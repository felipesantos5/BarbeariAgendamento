import cron from "node-cron";
import Booking from "../models/Booking.js";
import Barbershop from "../models/Barbershop.js";
import Subscription from "../models/Subscription.js";
import { sendWhatsAppConfirmation } from "./evolutionWhatsapp.js";
import { startOfDay, endOfDay, getHours } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { format } from "date-fns";
import { sendAutomatedReturnReminders } from "./returnReminderService.js";

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
      .populate("barbershop");

    if (bookings.length === 0) {
      console.log(`-> Nenhum agendamento encontrado para hoje.`);
      return;
    }

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

      try {
        await sendWhatsAppConfirmation(customerPhone, message);
        sentCount++;
      } catch (err) {
        console.error(`[CRON] Falha ao enviar lembrete para ${customerPhone}:`, err.message);
      }

      // Pausa aleatoria
      const MIN_DELAY = 5000;
      const MAX_DELAY = 15000;
      const randomDelay = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
      await delay(randomDelay);
    }

    console.log(`[CRON] Lembretes enviados: ${sentCount}/${bookings.length}`);
  } catch (error) {
    console.error(`[CRON] Erro ao enviar lembretes de agendamento (trigger: ${triggerHour}):`, error.message);
  }
};

const updateExpiredBookings = async () => {
  const now = new Date();
  try {
    const filter = {
      time: { $lt: now },
      status: { $in: ["booked", "confirmed"] },
    };

    const update = {
      $set: { status: "completed" },
    };

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
          status: "canceled",
          paymentStatus: "canceled",
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`[CRON] Limpeza: ${result.modifiedCount} agendamentos pendentes foram cancelados.`);
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
