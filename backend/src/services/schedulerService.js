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
const ENABLE_AUTOMATIC_MESSAGES = process.env.ENABLE_AUTOMATIC_MESSAGES === "true" || process.env.NODE_ENV === "production";


const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Armazena referencias de todos os cron jobs para poder parar no shutdown
const cronTasks = [];

const sendDailyReminders = async (triggerTime) => {
  const now = new Date();
  const nowInBrazil = toZonedTime(now, BRAZIL_TZ);

  // 1. Busca quais barbearias possuem disparos configurados para este minuto exato
  const shopsToNotify = await Barbershop.find({
    "whatsappConfig.enabled": true,
    $or: [
      { "whatsappConfig.morningReminderTime": triggerTime },
      { "whatsappConfig.afternoonReminderTime": triggerTime }
    ]
  }).select("_id").lean();

  if (shopsToNotify.length === 0) {
    // Silencioso se não houver nada para este minuto
    return;
  }

  console.log(`[${new Date().toLocaleTimeString()}] Iniciando envio de lembretes para ${shopsToNotify.length} barbearias no trigger: ${triggerTime}`);

  const shopIds = shopsToNotify.map(s => s._id);

  const startOfDayBrazil = startOfDay(nowInBrazil);
  const endOfDayBrazil = endOfDay(nowInBrazil);

  const start = fromZonedTime(startOfDayBrazil, BRAZIL_TZ);
  const end = fromZonedTime(endOfDayBrazil, BRAZIL_TZ);

  try {
    const bookings = await Booking.find({
      barbershop: { $in: shopIds },
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
      console.log(`-> Nenhum agendamento encontrado para as barbearias deste trigger.`);
      await sendDiscordNotification(DISCORD_LOGS_WEBHOOK_URL, createReminderLogEmbed(
        `📅 Lembretes Diários - ${triggerTime}h`,
        16776960, // Yellow
        [{ name: "Status", value: "Nenhum agendamento encontrado para este horário.", inline: false }]
      ));
      return;
    }

    await sendDiscordNotification(DISCORD_LOGS_WEBHOOK_URL, createReminderLogEmbed(
      `🔔 Iniciando Envio de Lembretes - ${triggerTime}h`,
      3447003, // Blue
      [{ name: "Agendamentos Encontrados", value: bookings.length.toString(), inline: true }]
    ));

    let sentCount = 0;
    let failureDetails = [];

    for (const booking of bookings) {
      if (!booking.customer || !booking.barbershop || !booking.barber) {
        console.warn(`Pulando agendamento ${booking._id} por falta de dados populados.`);
        continue;
      }

      // Converte o horario do agendamento (UTC) para o fuso horario do Brasil
      const appointmentDateInBrazil = toZonedTime(new Date(booking.time), BRAZIL_TZ);
      // Extrai a hora do agendamento no fuso do Brasil
      const appointmentHourInBrazil = getHours(appointmentDateInBrazil);

      const barbershop = booking.barbershop;
      const morningTime = barbershop.whatsappConfig?.morningReminderTime || "08:00";
      const afternoonTime = barbershop.whatsappConfig?.afternoonReminderTime || "13:00";

      const isMorningTrigger = morningTime === triggerTime;
      const isAfternoonTrigger = afternoonTime === triggerTime;

      // Se este horário não é o de disparo de manhã nem o de tarde desta barbearia, pula
      if (!isMorningTrigger && !isAfternoonTrigger) {
        continue;
      }

      // Se for o horário da manhã da barbearia, só envia pros agendamentos da manhã (< 13h)
      // A menos que o horário da tarde seja o mesmo (o que mandaria tudo)
      if (isMorningTrigger && appointmentHourInBrazil >= 13 && !isAfternoonTrigger) {
        continue;
      }
      
      // Se for o horário da tarde da barbearia, só envia pros agendamentos da tarde (>= 13h)
      // A menos que o horário da manhã seja o mesmo
      if (isAfternoonTrigger && appointmentHourInBrazil < 13 && !isMorningTrigger) {
        continue;
      }

      const customerPhone = booking.customer.phone;
      const appointmentTimeFormatted = format(appointmentDateInBrazil, "HH:mm");

      const barberShopAdress = booking.barbershop.address
        ? `${booking.barbershop.address.rua}, ${booking.barbershop.address.numero} - ${booking.barbershop.address.bairro}`
        : "";

      const triggerHourNum = parseInt(triggerTime.split(":")[0]);
      const greeting = triggerHourNum < 12 ? "Bom dia" : "Olá";
      const message = `${greeting}, ${booking.customer.name}! Lembrete do seu agendamento hoje na ${booking.barbershop.name} às ${appointmentTimeFormatted} com ${booking.barber.name}\n\nEndereço: ${barberShopAdress}`;

      const result = await sendWhatsAppMessage(booking.barbershop._id.toString(), customerPhone, message);

      if (result.success) {
        sentCount++;
      } else if (result.blocked) {
        // Circuit breaker bloqueou - para de tentar enviar
        console.log(
          `[CRON] Circuit breaker bloqueou envios. Parando tentativas. ` +
          `Enviados: ${sentCount}/${bookings.length}. Próxima tentativa em ${result.retryIn}s.`
        );
        failureDetails.push(`[Circuit Breaker] Bloqueado - ${bookings.length - sentCount} mensagens não enviadas`);
        break; // Sai do loop - não adianta continuar tentando
      } else {
        // Loga o motivo da falha individual para diagnóstico
        const reason = result.error || result.code || "Erro desconhecido";
        const statusPart = result.status ? ` [HTTP ${result.status}]` : "";
        console.warn(
          `[CRON] ⚠️  Falha ao enviar para ${customerPhone}${statusPart}: ${reason}`
        );
        failureDetails.push(`${customerPhone}: ${reason}${statusPart}`);
      }

      // Pausa aleatória entre mensagens — espaço suficiente para os retries internos
      // e para não sobrepor disparos seguidos na Evolution API
      if (!result.blocked) {
        const MIN_DELAY = 30000; // 30 segundos
        const MAX_DELAY = 60000; // 60 segundos
        const randomDelay = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
        await delay(randomDelay);
      }
    }

    console.log(`[CRON] Lembretes enviados: ${sentCount}/${bookings.length}`);

    const embedColor = sentCount === bookings.length ? 5763719 : (sentCount > 0 ? 16753920 : 15548997); // Verde / Laranja / Vermelho
    const embedFields = [
      { name: "Total", value: bookings.length.toString(), inline: true },
      { name: "Enviados", value: sentCount.toString(), inline: true },
      { name: "Falhas", value: (bookings.length - sentCount).toString(), inline: true }
    ];

    if (failureDetails.length > 0) {
      // Limita a 5 falhas no embed para não estourar o limite do Discord
      const detailsText = failureDetails.slice(0, 5).join("\n");
      embedFields.push({
        name: "Detalhes das Falhas",
        value: detailsText.slice(0, 1024),
        inline: false
      });
    }

    await sendDiscordNotification(DISCORD_LOGS_WEBHOOK_URL, createReminderLogEmbed(
      `${sentCount === bookings.length ? "✅" : "⚠️"} Lembretes Finalizados - ${triggerTime}h`,
      embedColor,
      embedFields
    ));
  } catch (error) {
    console.error(`[CRON] Erro ao enviar lembretes de agendamento (trigger: ${triggerTime}):`, error.message);
    await sendDiscordNotification(DISCORD_LOGS_WEBHOOK_URL, createReminderLogEmbed(
      `❌ Erro no Processo de Lembretes - ${triggerTime}h`,
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
    "0,30 * * * *",
    () => {
      if (ENABLE_AUTOMATIC_MESSAGES) {
        const now = new Date();
        const nowInBrazil = toZonedTime(now, BRAZIL_TZ);
        const currentTime = format(nowInBrazil, "HH:mm");
        sendDailyReminders(currentTime);
      }
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
      if (ENABLE_AUTOMATIC_MESSAGES) {
        sendAutomatedReturnReminders();
      }
    },
    {
      scheduled: true,
      timezone: "America/Sao_Paulo",
    }
  )
);

console.log(`[CRON] Serviço de agendamentos carregado. Mensagens automáticas: ${ENABLE_AUTOMATIC_MESSAGES ? 'ATIVADAS' : 'DESATIVADAS'}`);

// O cron job de 13h foi removido pois agora o processo é de hora em hora.

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
      if (ENABLE_AUTOMATIC_MESSAGES) {
        sendDailyStatsSummary();
      }
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
