// src/services/returnReminderService.js
import Booking from "../models/Booking.js";
import Barbershop from "../models/Barbershop.js";
import Customer from "../models/Customer.js";
import mongoose from "mongoose";
import { sendWhatsAppConfirmation } from "./evolutionWhatsapp.js";
import { sendWhatsAppMessage } from "./whatsappMessageService.js";
import { subDays, startOfDay, startOfMonth } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { sendDiscordNotification, createReminderLogEmbed } from "./discordService.js";

const DISCORD_LOGS_WEBHOOK_URL = process.env.DISCORD_LOGS_WEBHOOK_URL;


const BRAZIL_TZ = "America/Sao_Paulo";
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
          from: "customers", // nome da coleção no MongoDB
          localField: "_id",
          foreignField: "_id",
          as: "customerDetails",
        },
      },
      { $unwind: "$customerDetails" }, // Transforma o array de 1 elemento em objeto
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
                    { $gte: ["$$b.time", todayUTC] }, // Data é hoje ou no futuro
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
      // 6. O FILTRO MÁGICO: Aplica todas as regras de negócio
      {
        $match: {
          // Regra 1: O último corte foi ANTES da data de corte (ex: 30 dias atrás)
          lastCompletedVisit: { $lt: cutoffDateUTC, $ne: null },
          // Regra 2: E o cliente NÃO tem nenhum horário futuro marcado
          futureBookingsCount: 0,
          // Exclusão 2: E o total de lembretes enviados é MENOR que 3
          totalRemindersSent: { $lt: 3 },
          // Exclusão 1: E (ou o cliente nunca recebeu lembrete OU o último lembrete foi antes do início deste mês)
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
    return []; // Retorna array vazio em caso de erro
  }
}

/**
 * JOB (Worker) que roda toda terça-feira para enviar lembretes de retorno.
 */
export const sendAutomatedReturnReminders = async () => {
  console.log(`[${new Date().toLocaleTimeString()}] Iniciando JOB: Lembretes de Retorno (Toda Terça).`); //
  const nowBrazil = toZonedTime(new Date(), BRAZIL_TZ); //
  const todayUTC = fromZonedTime(startOfDay(nowBrazil), BRAZIL_TZ); //
  const startOfCurrentMonthUTC = fromZonedTime(startOfMonth(nowBrazil), BRAZIL_TZ); //

  // --- 1. DEFINIR REGRAS FIXAS ---
  const DAYS_SINCE_LAST_CUT = 30;
  const BASE_URL = "https://www.barbeariagendamento.com.br";

  try {
    // 2. Encontra barbearias que ativaram o lembrete (e busca o slug)
    const barbershopsToNotify = await Barbershop.find({
      "returnReminder.enabled": true,
    }).select("name slug"); // ✅ Busca o slug

    console.log(`-> Encontradas ${barbershopsToNotify.length} barbearias com lembretes automáticos ativos.`); //
    
    if (barbershopsToNotify.length > 0) {
      await sendDiscordNotification(DISCORD_LOGS_WEBHOOK_URL, createReminderLogEmbed(
        "🔄 Iniciando Lembretes de Retorno",
        3447003, // Blue
        [{ name: "Barbearias Ativas", value: barbershopsToNotify.length.toString(), inline: true }]
      ));
    }


    for (const barbershop of barbershopsToNotify) {
      // --- 3. USA OS DIAS FIXOS ---
      const cutoffDateUTC = fromZonedTime(subDays(nowBrazil, DAYS_SINCE_LAST_CUT), BRAZIL_TZ); //

      // 4. Usa a lógica de agregação para achar os clientes
      const customers = await findCustomersToRemind(barbershop._id, cutoffDateUTC, startOfCurrentMonthUTC, todayUTC); //

      if (customers.length > 0) {
        console.log(`-> Enviando ${customers.length} lembretes para ${barbershop.name}...`); //
      } else {
        console.log(`-> Nenhum cliente elegível para ${barbershop.name}.`); //
        continue; //
      }

      // 5. Envia as mensagens e atualiza o histórico do cliente
      let sentCount = 0;
      for (const customer of customers) {
        // --- 6. CRIA A MENSAGEM E O LINK DINAMICAMENTE ---
        const agendamentoLink = `${BASE_URL}/${barbershop.slug}`;

        const message = `Olá, ${customer.name}! Sentimos sua falta na ${barbershop.name}. Já faz ${DAYS_SINCE_LAST_CUT} dias desde seu último corte. 💈\n\nQue tal agendar seu retorno?\n${agendamentoLink}`;

        const result = await sendWhatsAppMessage(barbershopId, customer.phone, message);

        if (result.success) {
          sentCount++;
          // Só registra o envio se a mensagem foi enviada com sucesso
          await Customer.updateOne(
            { _id: customer._id },
            { $push: { returnReminders: { sentAt: new Date() } } }
          );
        } else if (result.blocked) {
          // Circuit breaker bloqueou - para de tentar enviar
          console.log(
            `[CRON] Circuit breaker bloqueou lembretes de retorno. ` +
            `Enviados: ${sentCount}/${customers.length} para ${barbershop.name}. ` +
            `Próxima tentativa em ${result.retryIn}s.`
          );
          break; // Sai do loop desta barbearia
        }

        // Pausa entre mensagens (apenas se não estiver bloqueado)
        if (!result.blocked) {
          const MIN_DELAY = 20000; // 20 segundos
          const MAX_DELAY = 45000; // 45 segundos
          const randomDelay = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
          await delay(randomDelay);
        }
      }

      if (sentCount > 0) {
        console.log(`-> Enviados ${sentCount}/${customers.length} lembretes para ${barbershop.name}.`);
      }
    }
  } catch (error) {
    console.error(`❌ Erro no JOB de lembretes de retorno:`, error); //
  }
  console.log(`[${new Date().toLocaleTimeString()}] JOB: Lembretes de Retorno finalizado.`); //
};
