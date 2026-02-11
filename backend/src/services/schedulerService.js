import cron from "node-cron";
import Booking from "../models/Booking.js";
import Barbershop from "../models/Barbershop.js";
import Subscription from "../models/Subscription.js";
import { sendWhatsAppConfirmation } from "./evolutionWhatsapp.js";
import { sendWhatsAppMessage } from "./whatsappMessageService.js";
import { startOfDay, endOfDay, getHours } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { format } from "date-fns";
import { sendAutomatedReturnReminders } from "./returnReminderService.js";
import { sendDiscordNotification, createReminderLogEmbed } from "./discordService.js";
import { getRedisClient } from "../config/redis.js";

const DISCORD_LOGS_WEBHOOK_URL = process.env.DISCORD_LOGS_WEBHOOK_URL;


const BRAZIL_TZ = "America/Sao_Paulo";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Armazena referencias de todos os cron jobs para poder parar no shutdown
const cronTasks = [];

const sendDailyReminders = async (triggerHour) => {
  console.log(`[${new Date().toLocaleTimeString()}] Iniciando envio de lembretes para triggerHour: ${triggerHour}`);
  const now = new Date();
  const nowInBrazil = toZonedTime(now, BRAZIL_TZ);

  const startOfDayBrazil = startOfDay(nowInBrazil);
  const endOfDayBrazil = endOfDay(nowInBrazil);

  const start = fromZonedTime(startOfDayBrazil, BRAZIL_TZ);
  const end = fromZonedTime(endOfDayBrazil, BRAZIL_TZ);

  try {
    const bookings = await Booking.find({
      time: {
        $gte: start,
        $lt: end,
      },
      status: "booked",
    })
      .populate("customer")
      .populate("barber")
      .populate("barbershop")
      .lean(); // Read-only query optimization

    if (bookings.length === 0) {
      console.log(`-> Nenhum agendamento encontrado para hoje.`);
      await sendDiscordNotification(DISCORD_LOGS_WEBHOOK_URL, createReminderLogEmbed(
        `📅 Lembretes Diários - ${triggerHour}h`,
        16776960, // Yellow
        [{ name: "Status", value: "Nenhum agendamento encontrado para hoje.", inline: false }]
      ));
      return;
    }

    await sendDiscordNotification(DISCORD_LOGS_WEBHOOK_URL, createReminderLogEmbed(
      `🔔 Iniciando Envio de Lembretes - ${triggerHour}h`,
      3447003, // Blue
      [{ name: "Agendamentos Encontrados", value: bookings.length.toString(), inline: true }]
    ));

    let sentCount = 0;

    for (const booking of bookings) {
      if (!booking.customer || !booking.barbershop || !booking.barber) {
        console.warn(`Pulando agendamento ${booking._id} por falta de dados populados.`);
        continue;
      }

      // Converte o horario do agendamento (UTC) para o fuso horario do Brasil
      const appointmentDateInBrazil = toZonedTime(new Date(booking.time), BRAZIL_TZ);
      // Extrai a hora do agendamento no fuso do Brasil
      const appointmentHourInBrazil = getHours(appointmentDateInBrazil);

      // Se o trigger e 8h, so envia se o agendamento for ANTES das 13h
      if (triggerHour === 8 && appointmentHourInBrazil >= 13) {
        continue;
      }
      // Se o trigger e 13h, so envia se o agendamento for a partir das 13h
      if (triggerHour === 13 && appointmentHourInBrazil < 13) {
        continue;
      }

      const customerPhone = booking.customer.phone;
      const appointmentTimeFormatted = format(appointmentDateInBrazil, "HH:mm");

      const barberShopAdress = booking.barbershop.address
        ? `${booking.barbershop.address.rua}, ${booking.barbershop.address.numero} - ${booking.barbershop.address.bairro}`
        : "";

      const greeting = triggerHour === 8 ? "Bom dia" : "Ola";
      const message = `${greeting}, ${booking.customer.name}! Lembrete do seu agendamento hoje na ${booking.barbershop.name} as ${appointmentTimeFormatted} com ${booking.barber.name}\n\nPara mais informacoes, entre em contato com a barbearia: ${booking.barbershop.contact}\nEndereco: ${barberShopAdress}`;

      const result = await sendWhatsAppMessage(booking.barbershop._id.toString(), customerPhone, message);

      if (result.success) {
        sentCount++;
      } else if (result.blocked) {
        // Circuit breaker bloqueou - para de tentar enviar
        console.log(
          `[CRON] Circuit breaker bloqueou envios. Parando tentativas. ` +
          `Enviados: ${sentCount}/${bookings.length}. Próxima tentativa em ${result.retryIn}s.`
        );
        break; // Sai do loop - não adianta continuar tentando
      }
      // Se falhou mas não está bloqueado, continua tentando os próximos

      // Pausa aleatória entre mensagens (apenas se não estiver bloqueado)
      if (!result.blocked) {
        const MIN_DELAY = 20000; // 20 segundos
        const MAX_DELAY = 45000; // 45 segundos
        const randomDelay = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
        await delay(randomDelay);
      }
    }

    console.log(`[CRON] Lembretes enviados: ${sentCount}/${bookings.length}`);

    await sendDiscordNotification(DISCORD_LOGS_WEBHOOK_URL, createReminderLogEmbed(
      `✅ Lembretes Finalizados - ${triggerHour}h`,
      5763719, // Green
      [
        { name: "Total", value: bookings.length.toString(), inline: true },
        { name: "Enviados", value: sentCount.toString(), inline: true },
        { name: "Falhas/Ignorados", value: (bookings.length - sentCount).toString(), inline: true }
      ]
    ));
  } catch (error) {
    console.error(`[CRON] Erro ao enviar lembretes de agendamento (trigger: ${triggerHour}):`, error.message);
    await sendDiscordNotification(DISCORD_LOGS_WEBHOOK_URL, createReminderLogEmbed(
      `❌ Erro no Processo de Lembretes - ${triggerHour}h`,
      15548997, // Red
      [{ name: "Erro", value: error.message, inline: false }]
    ));
  }
};

const sendDailyStatsSummary = async () => {
  console.log(`[${new Date().toLocaleTimeString()}] Gerando resumo diário de envios...`);
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    const attempts = await redis.get("stats:daily:whatsapp_attempts") || 0;
    const successes = await redis.get("stats:daily:whatsapp_successes") || 0;
    const failures = Math.max(0, parseInt(attempts) - parseInt(successes));

    if (parseInt(attempts) === 0) {
      console.log("[CRON] Nenhuma mensagem enviada hoje. Pulando resumo do Discord.");
      return;
    }

    await sendDiscordNotification(DISCORD_LOGS_WEBHOOK_URL, createReminderLogEmbed(
      "📊 Resumo Geral do Dia - WhatsApp",
      11468718, // Purple
      [
        { name: "Tentativas Totais", value: attempts.toString(), inline: true },
        { name: "Sucesso", value: successes.toString(), inline: true },
        { name: "Falhas", value: failures.toString(), inline: true }
      ]
    ));

    // Resetar para o próximo dia
    await redis.del("stats:daily:whatsapp_attempts");
    await redis.del("stats:daily:whatsapp_successes");
    console.log("[CRON] Resumo diário enviado e estatísticas resetadas.");
  } catch (error) {
    console.error("[CRON] Erro ao gerar resumo diário:", error.message);
  }
};

const updateExpiredBookings = async () => {
  const now = new Date();
  try {
    const filter = {
      time: { $lt: now },
      status: { $in: ["booked", "confirmed"] },
    };

    const update = [
      {
        $set: {
          status: "completed",
          paymentStatus: {
            $cond: {
              if: { $in: ["$paymentStatus", ["pending", "no-payment"]] },
              then: "paid_locally",
              else: "$paymentStatus",
            },
          },
        },
      },
    ];

    const result = await Booking.updateMany(filter, update);
    if (result.modifiedCount > 0) {
      console.log(`[CRON] ${result.modifiedCount} agendamentos expirados atualizados para 'completed'.`);
    }
  } catch (error) {
    console.error("[CRON] Erro ao atualizar status de agendamentos expirados:", error.message);
  }
};

const cleanupPendingPayments = async () => {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  try {
    const result = await Booking.updateMany(
      {
        isPaymentMandatory: true,
        status: "pending_payment",
        paymentStatus: "pending",
        createdAt: { $lt: fifteenMinutesAgo },
      },
      {
        $set: {
          status: "payment_expired", // ✅ Novo status específico
          paymentStatus: "canceled",
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`[CRON] Limpeza: ${result.modifiedCount} agendamentos expirados por falta de pagamento.`);
    }
  } catch (error) {
    console.error("[CRON] Erro ao limpar agendamentos pendentes:", error.message);
  }
};

cronTasks.push(
  cron.schedule(
    "*/5 * * * *",
    () => {
      cleanupPendingPayments();
    },
    {
      scheduled: true,
      timezone: "America/Sao_Paulo",
    }
  )
);

cronTasks.push(
  cron.schedule(
    "0 8 * * *",
    () => {
      sendDailyReminders(8);
    },
    {
      scheduled: true,
      timezone: "America/Sao_Paulo",
    }
  )
);

cronTasks.push(
  cron.schedule(
    "0 11 * * 2",
    () => {
      sendAutomatedReturnReminders();
    },
    {
      scheduled: true,
      timezone: "America/Sao_Paulo",
    }
  )
);

cronTasks.push(
  cron.schedule(
    "0 13 * * *",
    () => {
      sendDailyReminders(13);
    },
    {
      scheduled: true,
      timezone: "America/Sao_Paulo",
    }
  )
);

cronTasks.push(
  cron.schedule(
    "0 * * * *",
    () => {
      updateExpiredBookings();
    },
    {
      scheduled: true,
      timezone: "America/Sao_Paulo",
    }
  )
);

cronTasks.push(
  cron.schedule(
    "0 22 * * *",
    () => {
      sendDailyStatsSummary();
    },
    {
      scheduled: true,
      timezone: "America/Sao_Paulo",
    }
  )
);

// Funcao para desativar contas trial expiradas
const deactivateExpiredTrials = async () => {
  const now = new Date();
  try {
    const filter = {
      isTrial: true,
      accountStatus: "trial",
      trialEndsAt: { $lt: now },
    };

    const update = {
      $set: { accountStatus: "inactive" },
    };

    const result = await Barbershop.updateMany(filter, update);

    if (result.modifiedCount > 0) {
      console.log(`[CRON] ${result.modifiedCount} conta(s) trial expirada(s) foram desativadas.`);
    }
  } catch (error) {
    console.error("[CRON] Erro ao desativar contas trial expiradas:", error.message);
  }
};

cronTasks.push(
  cron.schedule(
    "0 0 * * *",
    () => {
      deactivateExpiredTrials();
    },
    {
      scheduled: true,
      timezone: "America/Sao_Paulo",
    }
  )
);

// Funcao para expirar assinaturas vencidas
const expireSubscriptions = async () => {
  const now = new Date();
  try {
    const filter = {
      status: { $in: ["active", "canceled"] },
      endDate: { $lt: now },
    };

    const update = {
      $set: { status: "expired" },
    };

    const result = await Subscription.updateMany(filter, update);

    if (result.modifiedCount > 0) {
      console.log(`[CRON] ${result.modifiedCount} assinatura(s) expirada(s) foram atualizadas.`);
    }
  } catch (error) {
    console.error("[CRON] Erro ao expirar assinaturas:", error.message);
  }
};

cronTasks.push(
  cron.schedule(
    "5 0 * * *",
    () => {
      expireSubscriptions();
    },
    {
      scheduled: true,
      timezone: "America/Sao_Paulo",
    }
  )
);

updateExpiredBookings();
deactivateExpiredTrials();
expireSubscriptions();

// Exporta funcao para parar todos os cron jobs durante o graceful shutdown
export function stopAllCronJobs() {
  cronTasks.forEach((task) => task.stop());
  console.log(`[CRON] ${cronTasks.length} cron jobs parados.`);
}
