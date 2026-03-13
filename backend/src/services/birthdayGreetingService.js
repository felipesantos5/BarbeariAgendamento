// src/services/birthdayGreetingService.js
import Customer from "../models/Customer.js";
import Barbershop from "../models/Barbershop.js";
import { sendWhatsAppMessage } from "./whatsappMessageService.js";
import { toZonedTime } from "date-fns-tz";
import { format } from "date-fns";
import { getRedisClient } from "../config/redis.js";
import { sendDiscordNotification, createReminderLogEmbed } from "./discordService.js";

const BRAZIL_TZ = "America/Sao_Paulo";
const DISCORD_LOGS_WEBHOOK_URL = process.env.DISCORD_LOGS_WEBHOOK_URL;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildBirthdayMessage(customerName, barbershopName) {
  return (
    `Olá, ${customerName}! 🎂 A equipe da ${barbershopName} está passando para te desejar um feliz aniversário! ` +
    `Que seu novo ciclo seja repleto de saúde, estilo e muito sucesso. ` +
    `Você é um cliente especial para nós e esperamos te ver em breve para celebrar com aquele trato no visual! ` +
    `Grande abraço! 💈✂️`
  );
}

/**
 * JOB que roda todos os dias às 09:00 (Brasília) para enviar mensagens de
 * aniversário via WhatsApp aos clientes que fazem aniversário hoje,
 * usando a instância WhatsApp de cada barbearia vinculada ao cliente.
 */
export const sendBirthdayGreetings = async () => {
  console.log(`[${new Date().toLocaleTimeString()}] Iniciando JOB: Parabéns de Aniversário.`);

  const nowBrazil = toZonedTime(new Date(), BRAZIL_TZ);
  const todayDay = nowBrazil.getDate();
  const todayMonth = nowBrazil.getMonth() + 1; // $month retorna 1-12
  const todayStr = format(nowBrazil, "yyyy-MM-dd");

  try {
    // 1. Busca clientes que fazem aniversário hoje (dia e mês), ignorando o ano
    const birthdayCustomers = await Customer.find({
      birthDate: { $exists: true, $ne: null },
      $expr: {
        $and: [
          { $eq: [{ $dayOfMonth: "$birthDate" }, todayDay] },
          { $eq: [{ $month: "$birthDate" }, todayMonth] },
        ],
      },
    })
      .select("name phone loyaltyData")
      .lean();

    if (birthdayCustomers.length === 0) {
      console.log("-> Nenhum aniversariante hoje.");
      return;
    }

    console.log(`-> ${birthdayCustomers.length} aniversariante(s) encontrado(s).`);

    // 2. Coleta os IDs únicos de todas as barbearias vinculadas
    const barbershopIds = [
      ...new Set(
        birthdayCustomers.flatMap((c) => c.loyaltyData.map((l) => l.barbershop.toString()))
      ),
    ];

    // 3. Busca apenas as barbearias com WhatsApp habilitado (em uma única query)
    const barbershops = await Barbershop.find({
      _id: { $in: barbershopIds },
      "whatsappConfig.enabled": true,
    })
      .select("name whatsappConfig")
      .lean();

    if (barbershops.length === 0) {
      console.log("-> Nenhuma barbearia vinculada com WhatsApp habilitado.");
      return;
    }

    const barbershopMap = new Map(barbershops.map((b) => [b._id.toString(), b]));

    const redis = await getRedisClient();

    let sentTotal = 0;
    let skippedTotal = 0;
    let failureTotal = 0;

    // 4. Para cada aniversariante, dispara uma mensagem por barbearia vinculada
    for (const customer of birthdayCustomers) {
      const linkedBarbershops = customer.loyaltyData
        .map((l) => barbershopMap.get(l.barbershop.toString()))
        .filter(Boolean);

      if (linkedBarbershops.length === 0) continue;

      for (const barbershop of linkedBarbershops) {
        // 5. Deduplicação via Redis: garante no máximo 1 envio por cliente/barbearia/dia
        const dedupeKey = `birthday_sent:${customer._id}:${barbershop._id}:${todayStr}`;

        if (redis) {
          const alreadySent = await redis.get(dedupeKey);
          if (alreadySent) {
            console.log(
              `-> [Duplicata] Aniversário já enviado hoje para ${customer.name} (${barbershop.name}). Pulando.`
            );
            skippedTotal++;
            continue;
          }
        }

        const message = buildBirthdayMessage(customer.name, barbershop.name);
        const result = await sendWhatsAppMessage(barbershop._id.toString(), customer.phone, message);

        if (result.success) {
          sentTotal++;
          // Marca no Redis com TTL de 25h (cobre meia-noite com folga)
          if (redis) {
            await redis.setex(dedupeKey, 25 * 60 * 60, "1");
          }
        } else if (result.blocked) {
          console.log(
            `[CRON] Circuit breaker bloqueou envios de aniversário. ` +
              `Enviados: ${sentTotal}. Parando.`
          );
          break;
        } else {
          failureTotal++;
          console.warn(
            `[CRON] Falha ao enviar aniversário para ${customer.phone}: ` +
              `${result.error || result.code || "Erro desconhecido"}`
          );
        }

        // Delay humanizado entre envios (5 a 15 segundos)
        if (!result.blocked) {
          const randomDelay = 5000 + Math.floor(Math.random() * 10000);
          await delay(randomDelay);
        }
      }
    }

    console.log(
      `[CRON] Aniversários — Enviados: ${sentTotal} | Ignorados (duplicata): ${skippedTotal} | Falhas: ${failureTotal}`
    );

    if (DISCORD_LOGS_WEBHOOK_URL && (sentTotal > 0 || failureTotal > 0)) {
      await sendDiscordNotification(
        DISCORD_LOGS_WEBHOOK_URL,
        createReminderLogEmbed("🎂 Parabéns de Aniversário", sentTotal > 0 ? 5763719 : 15548997, [
          { name: "Aniversariantes", value: birthdayCustomers.length.toString(), inline: true },
          { name: "Enviados", value: sentTotal.toString(), inline: true },
          { name: "Falhas", value: failureTotal.toString(), inline: true },
        ])
      );
    }
  } catch (error) {
    console.error("❌ Erro no JOB de parabéns de aniversário:", error);
    if (DISCORD_LOGS_WEBHOOK_URL) {
      sendDiscordNotification(
        DISCORD_LOGS_WEBHOOK_URL,
        createReminderLogEmbed("❌ Erro no JOB de Aniversário", 15548997, [
          { name: "Erro", value: error.message.slice(0, 200), inline: false },
        ])
      ).catch(() => {});
    }
  }

  console.log(`[${new Date().toLocaleTimeString()}] JOB: Parabéns de Aniversário finalizado.`);
};
