// src/services/returnReminderService.js
import Booking from "../models/Booking.js";
import Barbershop from "../models/Barbershop.js";
import Customer from "../models/Customer.js";
import mongoose from "mongoose";
import { sendWhatsAppMessage } from "./whatsappMessageService.js";
import { subDays, startOfDay, startOfMonth } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { sendDiscordNotification, createReminderLogEmbed } from "./discordService.js";

const DISCORD_LOGS_WEBHOOK_URL = process.env.DISCORD_LOGS_WEBHOOK_URL;

const BRAZIL_TZ = "America/Sao_Paulo";
const BASE_URL = "https://www.barbeariagendamento.com.br";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lógica principal para encontrar clientes elegíveis para lembrete de retorno,
 * respeitando todas as regras de negócio.
 */
async function findCustomersToRemind(barbershopId, cutoffDateUTC, startOfCurrentMonthUTC, todayUTC) {
  try {
    const customers = await Booking.aggregate([
      // 1. Achar todos agendamentos da barbearia
      { $match: { barbershop: new mongoose.Types.ObjectId(barbershopId) } },
      // 2. Ordenar por data para sabermos qual foi o último
      { $sort: { time: -1 } },
      // 3. Agrupar por cliente
      {
        $group: {
          _id: "$customer",
          allBookings: { $push: { status: "$status", time: "$time" } },
        },
      },
      // 4. Buscar os dados do cliente (para pegar o histórico de lembretes)
      {
        $lookup: {
          from: "customers",
          localField: "_id",
          foreignField: "_id",
          as: "customerDetails",
        },
      },
      { $unwind: "$customerDetails" },
      // 5. Analisar os dados e projetar o que precisamos
      {
        $project: {
          customerDetails: 1,
          // Encontra a data do ÚLTIMO agendamento COMPLETADO
          lastCompletedVisit: {
            $max: {
              $map: {
                input: { $filter: { input: "$allBookings", as: "b", cond: { $eq: ["$$b.status", "completed"] } } },
                as: "comp",
                in: "$$comp.time",
              },
            },
          },
          // Conta quantos agendamentos FUTUROS (agendados ou confirmados) o cliente já tem
          futureBookingsCount: {
            $size: {
              $filter: {
                input: "$allBookings",
                as: "b",
                cond: {
                  $and: [
                    { $in: ["$$b.status", ["booked", "confirmed"]] },
                    { $gte: ["$$b.time", todayUTC] },
                  ],
                },
              },
            },
          },
          // Pega o histórico de lembretes do cliente
          totalRemindersSent: { $size: "$customerDetails.returnReminders" },
          lastReminderSent: { $max: "$customerDetails.returnReminders.sentAt" },
        },
      },
      // 6. Aplica todas as regras de negócio
      {
        $match: {
          // Regra 1: O último corte foi ANTES da data de corte
          lastCompletedVisit: { $lt: cutoffDateUTC, $ne: null },
          // Regra 2: E o cliente NÃO tem nenhum horário futuro marcado
          futureBookingsCount: 0,
          // Exclusão 1: E o total de lembretes enviados é MENOR que 3
          totalRemindersSent: { $lt: 3 },
          // Exclusão 2: E (ou o cliente nunca recebeu lembrete OU o último lembrete foi antes do início deste mês)
          $or: [{ lastReminderSent: { $exists: false } }, { lastReminderSent: { $lt: startOfCurrentMonthUTC } }],
        },
      },
      // 7. Retorna os dados limpos de quem passou no filtro
      {
        $project: {
          _id: "$customerDetails._id",
          name: "$customerDetails.name",
          phone: "$customerDetails.phone",
        },
      },
    ]);
    return customers;
  } catch (error) {
    console.error(`Erro na agregação para barbershop ${barbershopId}:`, error);
    return [];
  }
}

/**
 * Monta a mensagem final substituindo as variáveis do template.
 * Variáveis suportadas: {nome}, {barbearia}, {dias}, {link}
 */
function buildMessage(template, { customerName, barbershopName, inactiveDays, link }) {
  if (!template || template.trim() === "") {
    return `Olá, ${customerName}! Sentimos sua falta na ${barbershopName}. Já faz ${inactiveDays} dias desde seu último corte. 💈\n\nQue tal agendar seu retorno?\n${link}`;
  }
  return template
    .replace(/\{nome\}/g, customerName)
    .replace(/\{barbearia\}/g, barbershopName)
    .replace(/\{dias\}/g, String(inactiveDays))
    .replace(/\{link\}/g, link);
}

/**
 * JOB (Worker) que roda toda terça-feira para enviar lembretes de retorno.
 */
export const sendAutomatedReturnReminders = async () => {
  console.log(`[${new Date().toLocaleTimeString()}] Iniciando JOB: Lembretes de Retorno (Toda Terça).`);
  const nowBrazil = toZonedTime(new Date(), BRAZIL_TZ);
  const todayUTC = fromZonedTime(startOfDay(nowBrazil), BRAZIL_TZ);
  const startOfCurrentMonthUTC = fromZonedTime(startOfMonth(nowBrazil), BRAZIL_TZ);

  try {
    // 1. Encontra barbearias com lembrete ativado
    const barbershopsToNotify = await Barbershop.find({
      "returnReminder.enabled": true,
    }).select("name slug returnReminder");

    console.log(`-> Encontradas ${barbershopsToNotify.length} barbearias com lembretes automáticos ativos.`);

    if (barbershopsToNotify.length > 0) {
      await sendDiscordNotification(DISCORD_LOGS_WEBHOOK_URL, createReminderLogEmbed(
        "🔄 Iniciando Lembretes de Retorno",
        3447003,
        [{ name: "Barbearias Ativas", value: barbershopsToNotify.length.toString(), inline: true }]
      ));
    }

    for (const barbershop of barbershopsToNotify) {
      const inactiveDays = barbershop.returnReminder?.inactiveDays || 30;
      const customMessage = barbershop.returnReminder?.customMessage || "";

      // 2. Calcula data de corte com base nos dias configurados pela barbearia
      const cutoffDateUTC = fromZonedTime(subDays(nowBrazil, inactiveDays), BRAZIL_TZ);

      // 3. Acha clientes elegíveis
      const customers = await findCustomersToRemind(barbershop._id, cutoffDateUTC, startOfCurrentMonthUTC, todayUTC);

      if (customers.length === 0) {
        console.log(`-> Nenhum cliente elegível para ${barbershop.name}.`);
        continue;
      }

      console.log(`-> Enviando ${customers.length} lembretes para ${barbershop.name} (${inactiveDays} dias inativo)...`);

      // 4. Envia mensagens com fila e delays aleatórios para comportamento humano
      let sentCount = 0;
      for (const customer of customers) {
        const agendamentoLink = `${BASE_URL}/${barbershop.slug}`;
        const message = buildMessage(customMessage, {
          customerName: customer.name,
          barbershopName: barbershop.name,
          inactiveDays,
          link: agendamentoLink,
        });

        const result = await sendWhatsAppMessage(barbershop._id.toString(), customer.phone, message);

        if (result.success) {
          sentCount++;
          await Customer.updateOne(
            { _id: customer._id },
            { $push: { returnReminders: { sentAt: new Date(), barbershop: barbershop._id, message } } }
          );
        } else if (result.blocked) {
          console.log(
            `[CRON] Circuit breaker bloqueou lembretes de retorno. ` +
            `Enviados: ${sentCount}/${customers.length} para ${barbershop.name}. ` +
            `Próxima tentativa em ${result.retryIn}s.`
          );
          break;
        }

        // Delay humanizado entre mensagens: 20-45 segundos + jitter de até 10s
        if (!result.blocked) {
          const baseDelay = 20000 + Math.floor(Math.random() * 25000); // 20-45s
          const jitter = Math.floor(Math.random() * 10000); // +0-10s
          await delay(baseDelay + jitter);
        }
      }

      if (sentCount > 0) {
        console.log(`-> Enviados ${sentCount}/${customers.length} lembretes para ${barbershop.name}.`);
      }
    }
  } catch (error) {
    console.error(`❌ Erro no JOB de lembretes de retorno:`, error);
  }
  console.log(`[${new Date().toLocaleTimeString()}] JOB: Lembretes de Retorno finalizado.`);
};
