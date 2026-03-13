import express from "express";
import Booking from "../../models/Booking.js";
import Barbershop from "../../models/Barbershop.js";
import Customer from "../../models/Customer.js";
import Service from "../../models/Service.js";
import Subscription from "../../models/Subscription.js";
import mongoose from "mongoose";
import { bookingSchema as BookingValidationSchema } from "../../validations/bookingValidation.js";
import { sendEventToBarbershop } from "../../services/sseService.js";
import { protectAdmin } from "../../middleware/authAdminMiddleware.js";
import { z } from "zod";
import { addWeeks, addMonths, addDays, isBefore } from "date-fns";
import { randomUUID } from "crypto";

const router = express.Router({ mergeParams: true });

// Protege todas as rotas neste arquivo
router.use(protectAdmin);

// 1. Estende a validação base para incluir os campos de admin
const recurrenceSchema = z.object({
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
  until: z.string().datetime({ message: "Data limite inválida" }),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
});

const ManualBookingSchema = BookingValidationSchema.extend({
  // Admin pode opcionalmente definir o status na criação (ex: "completed")
  status: z.enum(["booked", "confirmed", "completed", "canceled"]).optional(),
  // Admin pode forçar o agendamento mesmo se houver conflito
  force: z.boolean().optional().default(false),
  // Recorrência opcional
  recurrence: recurrenceSchema.optional(),
});

/**
 * Gera as datas futuras de uma série de agendamentos recorrentes.
 * A data de início (startDate) já foi criada, então retorna apenas as próximas.
 */
function generateRecurrenceDates(startDate, recurrence) {
  const until = new Date(recurrence.until);
  const dates = [];

  if (recurrence.frequency === "weekly" && recurrence.daysOfWeek?.length > 0) {
    // Gera ocorrências semanais para cada dia da semana especificado
    for (const targetDay of recurrence.daysOfWeek) {
      let current = new Date(startDate);
      const currentDay = current.getDay();
      const daysUntilTarget = (targetDay - currentDay + 7) % 7;

      if (daysUntilTarget === 0) {
        // Mesmo dia da semana que startDate — pula para a próxima semana
        current = addWeeks(current, 1);
      } else {
        current = addDays(current, daysUntilTarget);
        // Mantém o mesmo horário do agendamento original
        current.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
      }

      while (isBefore(current, until)) {
        dates.push(new Date(current));
        current = addWeeks(current, 1);
      }
    }
  } else {
    const advance =
      recurrence.frequency === "biweekly"
        ? (d) => addWeeks(d, 2)
        : recurrence.frequency === "monthly"
        ? (d) => addMonths(d, 1)
        : (d) => addWeeks(d, 1); // weekly sem daysOfWeek

    let current = advance(new Date(startDate));
    while (isBefore(current, until)) {
      dates.push(new Date(current));
      current = advance(current);
    }
  }

  return dates.sort((a, b) => a - b);
}

/**
 * ROTA: POST /api/barbershops/:barbershopId/admin/bookings
 * * Permite um admin/barbeiro criar um agendamento manualmente,
 * inclusive em horários passados, e definir um status inicial.
 * Não envia WhatsApp e não tem rate limit.
 */
router.post("/", async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const data = ManualBookingSchema.parse(req.body);
    const bookingTime = new Date(data.time);

    // Lógica de "isPast" é INTENCIONALMENTE OMITIDA. O Admin pode agendar no passado.

    if (!data.customer.name || data.customer.name.trim() === "" || !data.customer.phone || data.customer.phone.trim() === "") {
      return res.status(400).json({
        error: "Nome e telefone do cliente são obrigatórios.",
      });
    }

    // 2. Lógica de Cliente (idêntica à rota de booking)
    const [barbershop, customer] = await Promise.all([
      Barbershop.findById(barbershopId),
      Customer.findOneAndUpdate(
        { phone: data.customer.phone },
        { name: data.customer.name, phone: data.customer.phone },
        { new: true, upsert: true }
      ),
    ]);

    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }

    // 3. Verificação de Conflito (com bypass de 'force')
    if (!data.force) {
      // Só verifica conflito se o admin não estiver forçando
      const conflict = await Booking.findOne({
        barber: data.barber,
        time: bookingTime,
        status: { $nin: ["canceled"] },
      });

      if (conflict) {
        return res.status(409).json({
          error: "Este horário já está preenchido. Para agendar mesmo assim, marque a opção 'Forçar Agendamento'.",
          conflict: true,
        });
      }
    }

    // 4. Lógica de Serviço e Plano (idêntica à rota de booking)
    const service = await Service.findById(data.service);
    if (!service) {
      return res.status(404).json({ error: "Serviço não encontrado." });
    }

    const bookingPayload = {
      barber: data.barber,
      service: data.service,
      customer: customer._id,
      barbershop: barbershopId,
      time: bookingTime,
      isLoyaltyReward: false,
    };

    let activeSubscription = null;

    if (data.useLoyaltyReward) {
      // Procura a entrada de fidelidade para ESTA barbearia
      let loyaltyEntry = customer.loyaltyData.find((entry) => entry.barbershop.equals(barbershopMongoId));

      if (!loyaltyEntry || loyaltyEntry.rewards <= 0) {
        return res.status(400).json({
          error: "Cliente não possui recompensas de fidelidade para resgatar nesta barbearia.",
        });
      }

      // Cliente tem prêmios!
      loyaltyEntry.rewards -= 1; // Deduz o prêmio
      bookingPayload.isLoyaltyReward = true;
      bookingPayload.paymentStatus = "loyalty_reward";
      bookingPayload.status = data.status || "completed";
    } else if (service.isPlanService && service.plan) {
      activeSubscription = await Subscription.findOne({
        customer: customer._id,
        plan: service.plan,
        barbershop: barbershopId,
        status: "active",
        // Permite usar créditos mesmo que o admin esteja registrando um
        // agendamento antigo, desde que a assinatura esteja ativa HOJE.
        endDate: { $gte: new Date() },
        creditsRemaining: { $gt: 0 },
      });

      if (activeSubscription) {
        bookingPayload.paymentStatus = "plan_credit";
        bookingPayload.status = "confirmed";
        bookingPayload.subscriptionUsed = activeSubscription._id;
      } else {
        // Se o admin está forçando um serviço de plano sem créditos
        if (data.force) {
          bookingPayload.paymentStatus = "no-payment"; // Marcar como "não aplicável"
          bookingPayload.status = "confirmed";
        } else {
          return res.status(403).json({
            error: "Cliente não possui créditos válidos para este plano. Marque 'Forçar Agendamento' para registrar mesmo assim.",
            conflict: true,
          });
        }
      }
    } else {
      // Serviço normal (não é de plano)
      bookingPayload.paymentStatus = "no-payment"; // Padrão para admin
    }

    // 5. Lógica de Status (Aprimorada)
    if (data.status) {
      // Se o admin mandou um status (ex: "completed"), use-o
      bookingPayload.status = data.status;
    } else if (!bookingPayload.status) {
      // Senão, usa o padrão (booked)
      bookingPayload.status = "booked";
    }

    // Se o admin marcou como "completed", o pagamento deve ser "approved"
    if (bookingPayload.status === "completed" && bookingPayload.paymentStatus !== "plan_credit") {
      bookingPayload.paymentStatus = "approved"; // Assume que foi pago no local
    }

    // 6. Criação do Agendamento
    const createdBooking = await Booking.create(bookingPayload);

    // 7. Decremento de Créditos (se aplicável)
    if (activeSubscription) {
      activeSubscription.creditsRemaining -= 1;
      await activeSubscription.save();
    }

    const allCreatedBookingIds = [createdBooking._id];

    // 8. Lógica de Recorrência
    let recurrenceInfo = null;
    if (data.recurrence) {
      const groupId = randomUUID();

      // Marca o primeiro agendamento como parte da série
      createdBooking.isRecurring = true;
      createdBooking.recurrenceGroup = groupId;
      await createdBooking.save();

      const futureDates = generateRecurrenceDates(bookingTime, data.recurrence);
      let createdCount = 0;
      let skippedCount = 0;

      for (const date of futureDates) {
        // Verifica conflito para cada data futura (a menos que force=true)
        if (!data.force) {
          const conflict = await Booking.findOne({
            barber: data.barber,
            time: date,
            status: { $nin: ["canceled", "payment_expired"] },
          });
          if (conflict) {
            skippedCount++;
            continue;
          }
        }

        const recurringPayload = {
          barber: data.barber,
          service: data.service,
          customer: customer._id,
          barbershop: barbershopId,
          time: date,
          status: "booked",
          paymentStatus: "no-payment",
          isPaymentMandatory: false,
          isRecurring: true,
          recurrenceGroup: groupId,
        };

        try {
          const recurringBooking = await Booking.create(recurringPayload);
          allCreatedBookingIds.push(recurringBooking._id);
          createdCount++;
        } catch (err) {
          // Ignora erros de duplicata (index único barber+time)
          if (err.code === 11000) {
            skippedCount++;
          } else {
            throw err;
          }
        }
      }

      recurrenceInfo = {
        groupId,
        totalCreated: createdCount + 1, // +1 inclui o primeiro
        skipped: skippedCount,
      };
    }

    customer.bookings.push(...allCreatedBookingIds);
    await customer.save();

    // 9. Envia SSE (para atualizar a agenda do admin em tempo real)
    const populatedBooking = await Booking.findById(createdBooking._id)
      .populate("customer", "name")
      .populate("barber", "name")
      .populate("service", "name price duration")
      .lean();

    if (populatedBooking) {
      sendEventToBarbershop(barbershopId, "new_booking", populatedBooking);
    }

    // Intencionalmente NÃO enviamos WhatsApp

    res.status(201).json({
      ...(populatedBooking || createdBooking),
      ...(recurrenceInfo ? { recurrenceInfo } : {}),
    });
  } catch (e) {
    console.error("ERRO AO CRIAR AGENDAMENTO MANUAL:", e);
    if (e instanceof z.ZodError) {
      return res.status(400).json({
        error: "Dados de agendamento inválidos.",
        details: e.errors,
      });
    }
    if (e.name === "CastError") {
      return res.status(400).json({ error: "ID inválido fornecido para um dos campos." });
    }
    res.status(500).json({
      error: "Ocorreu um erro interno ao processar sua solicitação.",
    });
  }
});

export default router;
