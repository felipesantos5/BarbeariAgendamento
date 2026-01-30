import express from "express";
import Booking from "../models/Booking.js";
import Barbershop from "../models/Barbershop.js";
import Customer from "../models/Customer.js";
import Barber from "../models/Barber.js";
import Service from "../models/Service.js";
import BlockedDay from "../models/BlockedDay.js";
import TimeBlock from "../models/TimeBlock.js";
import Subscription from "../models/Subscription.js";
import mongoose from "mongoose";
import { bookingSchema as BookingValidationSchema } from "../validations/bookingValidation.js";
import { sendWhatsAppConfirmation } from "../services/evolutionWhatsapp.js";
import { sendWhatsAppMessage } from "../services/whatsappMessageService.js";
import { formatBookingTime } from "../utils/formatBookingTime.js";
import { protectAdmin } from "../middleware/authAdminMiddleware.js";
import { protectCustomer } from "../middleware/authCustomerMiddleware.js";
import { startOfMonth, endOfMonth, format, eachDayOfInterval, isToday, isPast } from "date-fns";
import { z } from "zod";
import { ptBR } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { appointmentLimiter } from "../middleware/rateLimiting.js";
import { addClient, removeClient, sendEventToBarbershop, getConnectionStats } from "../services/sseService.js";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { cacheService } from "../config/redis.js";

const router = express.Router({ mergeParams: true });

const rescheduleSchema = z.object({
  newTime: z.string().datetime({ message: "Formato de data e hora inválido" }),
});

// Cache helpers
const generateAvailabilityCacheKey = (barberId, year, month, serviceId) => {
  return `availability:${barberId}:${year}:${month}:${serviceId}`;
};

const invalidateAvailabilityCache = async (barberId) => {
  await cacheService.delPattern(`availability:${barberId}:*`);
};

router.post("/", appointmentLimiter, async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const data = BookingValidationSchema.parse(req.body);
    const bookingTime = new Date(data.time);

    if (!data.customer.name || data.customer.name.trim() === "" || !data.customer.phone || data.customer.phone.trim() === "") {
      return res.status(400).json({
        error: "Nome do cliente é obrigatório.",
      });
    }

    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }

    const customer = await Customer.findOneAndUpdate(
      { phone: data.customer.phone },
      {
        name: data.customer.name, // Sempre atualiza o nome
        phone: data.customer.phone,
      },
      { new: true, upsert: true }
    );

    const conflict = await Booking.findOne({
      barber: data.barber,
      time: bookingTime,
      status: { $nin: ["canceled"] },
    });

    if (conflict) {
      return res.status(409).json({
        error: "Este horário já foi preenchido. Por favor, escolha outro.",
      });
    }

    const service = await Service.findById(data.service);
    if (!service) {
      return res.status(404).json({ error: "Serviço não encontrado." });
    }

    const bookingPayload = {
      ...data,
      customer: customer._id,
      barbershop: barbershopId,
      isPaymentMandatory: barbershop.paymentsEnabled && barbershop.requireOnlinePayment,
    };

    let activeSubscription = null;

    if (service.isPlanService && service.plan) {
      activeSubscription = await Subscription.findOne({
        customer: customer._id,
        plan: service.plan,
        barbershop: barbershopId,
        status: "active",
        endDate: { $gte: new Date() },
        creditsRemaining: { $gt: 0 },
      });

      if (activeSubscription) {
        // Cliente tem créditos!
        bookingPayload.paymentStatus = "plan_credit";
        bookingPayload.status = "confirmed"; // Já entra como confirmado
        bookingPayload.subscriptionUsed = activeSubscription._id;
        bookingPayload.isPaymentMandatory = false;
      } else {
        // Cliente não tem créditos, e o serviço é SÓ de plano
        return res.status(403).json({
          error: "Este serviço é exclusivo para assinantes do plano e você não possui créditos válidos.",
        });
      }
    } else {
      // Serviço normal, segue fluxo de pagamento padrão
      if (barbershop.paymentsEnabled) {
        bookingPayload.paymentStatus = "pending";

        // ✅ AQUI É A MUDANÇA
        if (bookingPayload.isPaymentMandatory) {
          bookingPayload.status = "pending_payment"; // Define o novo status
        }
      } else {
        bookingPayload.paymentStatus = "no-payment"; // Ou 'approved' se o padrão for agendar sem pagar
      }
    }

    const createdBooking = await Booking.create(bookingPayload);

    // Invalidate availability cache
    await invalidateAvailabilityCache(data.barber);

    if (activeSubscription) {
      activeSubscription.creditsRemaining -= 1;
      // Opcional: se os créditos chegarem a 0, poderia mudar o status
      if (activeSubscription.creditsRemaining === 0) {
        activeSubscription.status = "expired";
      }
      await activeSubscription.save();
    }

    customer.bookings.push(createdBooking._id);
    await customer.save();

    if (createdBooking.isPaymentMandatory) {
      // FLUXO OBRIGATÓRIO: Gerar link de pagamento imediatamente

      if (!barbershop.mercadoPagoAccessToken) {
        return res.status(400).json({
          error: "Pagamento online não está habilitado para esta barbearia.",
        });
      }

      const client = new MercadoPagoConfig({
        accessToken: barbershop.mercadoPagoAccessToken,
      });
      const preference = new Preference(client);

      const preferenceData = {
        body: {
          items: [
            {
              id: createdBooking._id.toString(),
              title: `Agendamento: ${service.name}`,
              description: "serviço de barbearia",
              quantity: 1,
              currency_id: "BRL",
              unit_price: service.price,
            },
          ],
          payer: {
            name: customer.name,
            email: `cliente_${customer._id}@email.com`,
            phone: {
              area_code: customer.phone.substring(0, 2),
              number: customer.phone.substring(2, 11),
            },
          },
          back_urls: {
            success: `https://barbeariagendamento.com.br/${barbershop.slug}/pagamento-sucesso`,
            failure: `https://barbeariagendamento.com.br/${barbershop.slug}`,
            pending: `https://barbeariagendamento.com.br/${barbershop.slug}`,
          },
          auto_return: "approved",
          notification_url: `https://api.barbeariagendamento.com.br/api/barbershops/${barbershopId}/bookings/webhook?barbershopId=${barbershopId}`,
          external_reference: createdBooking._id.toString(),
        },
      };

      const result = await preference.create(preferenceData);

      createdBooking.paymentId = result.id;
      await createdBooking.save();

      // Retorna o link de pagamento. NENHUMA notificação é enviada ainda.
      res.status(201).json({ payment_url: result.init_point });
    } else {
      // FLUXO OPCIONAL (ou pagamento desabilitado)
      // Envia notificações imediatamente

      // websocket
      const populatedBooking = await Booking.findById(createdBooking._id)
        .populate("customer", "name phone")
        .populate("barber", "name")
        .populate("service", "name price duration")
        .lean();

      if (populatedBooking) {
        sendEventToBarbershop(barbershopId, "new_booking", populatedBooking);
      }

      // envio de mensagem
      const formattedTime = formatBookingTime(bookingTime, true);
      const cleanPhoneNumber = barbershop.contact.replace(/\D/g, "");
      const whatsappLink = `https://wa.me/55${cleanPhoneNumber}`;
      const locationLink = `https://barbeariagendamento.com.br/localizacao/${barbershop._id}`;
      const message = `Olá, ${customer.name}! Seu agendamento na ${barbershop.name} foi confirmado com sucesso para ${formattedTime} ✅\n\nPara mais informações, entre em contato com a barbearia:\n${whatsappLink}\n\n📍 Ver no mapa:\n${locationLink}\n\nNosso time te aguarda! 💈`;
      sendWhatsAppMessage(barbershopId, customer.phone, message);

      res.status(201).json(createdBooking);
    }
  } catch (e) {
    console.error("ERRO AO CRIAR AGENDAMENTO:", e);
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

// Listar Agendamentos de uma Barbearia
// Rota esperada: GET /barbershops/:barbershopId/bookings
router.get("/", async (req, res) => {
  try {
    const barbershopId = req.params.barbershopId;

    if (!barbershopId || !mongoose.Types.ObjectId.isValid(barbershopId)) {
      return res.status(400).json({ error: "ID da barbearia inválido ou não fornecido." });
    }

    const bookings = await Booking.find({ barbershop: barbershopId })
      .sort({ time: -1 })
      .populate("barber", "name")
      .populate("service", "name price duration")
      .populate("customer", "name phone loyaltyData");

    res.json(bookings);
  } catch (error) {
    console.error("Erro ao buscar agendamentos:", error);
    res.status(500).json({ error: "Falha ao buscar agendamentos." });
  }
});

router.put(
  "/:bookingId/status",
  protectAdmin, // Apenas usuários logados no painel podem acessar
  async (req, res) => {
    try {
      const { barbershopId, bookingId } = req.params;
      const { status } = req.body;
      const barbershopMongoId = new mongoose.Types.ObjectId(barbershopId);

      // 1. Validação dos IDs
      if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({ error: "ID do agendamento inválido." });
      }

      const booking = await Booking.findOne({
        _id: bookingId,
        barbershop: barbershopId,
      }).populate("customer");

      if (!booking) {
        return res.status(404).json({ error: "Agendamento não encontrado nesta barbearia." });
      }

      const barbershop = await Barbershop.findById(barbershopId);

      // 2. Validação do Status recebido
      const allowedStatuses = ["booked", "completed", "canceled", "confirmed"];
      if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({
          error: `Status inválido. Use um dos seguintes: ${allowedStatuses.join(", ")}`,
        });
      }

      const bookingDate = new Date(booking.time);

      const formattedDate = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }).format(bookingDate);

      if (status === "canceled") {
        // Devolve créditos se o agendamento usou crédito de plano
        if (booking.subscriptionUsed && booking.paymentStatus === "plan_credit") {
          const subscription = await Subscription.findById(booking.subscriptionUsed);
          if (subscription) {
            subscription.creditsRemaining += 1;
            // Se estava expirado por falta de créditos, reativa
            if (subscription.status === "expired" && subscription.endDate >= new Date()) {
              subscription.status = "active";
            }
            await subscription.save();
          }
        }

        const message = `Olá ${booking.customer.name},\nInformamos que seu agendamento foi cancelado na ${barbershop.name} para o dia ${formattedDate}.`;

        sendWhatsAppMessage(barbershopId, booking.customer.phone, message);
      }

      // --- LÓGICA DE FIDELIDADE (CORRIGIDA) ---
      if (status === "completed" && barbershop.loyaltyProgram?.enabled && !booking.countedForLoyalty && !booking.isLoyaltyReward) {
        const customer = booking.customer;

        if (customer) {
          // Procura a entrada de fidelidade para ESTA barbearia
          let loyaltyEntry = customer.loyaltyData.find((entry) => entry.barbershop.equals(barbershopMongoId));

          // Se o cliente não tem entrada para esta barbearia, cria uma
          if (!loyaltyEntry) {
            customer.loyaltyData.push({
              barbershop: barbershopMongoId,
              progress: 0,
              rewards: 0,
            });
            loyaltyEntry = customer.loyaltyData[customer.loyaltyData.length - 1];
          }

          // Incrementa o progresso
          loyaltyEntry.progress += 1;
          booking.countedForLoyalty = true;

          const target = barbershop.loyaltyProgram.targetCount;

          // Atingiu o alvo?
          if (loyaltyEntry.progress >= target) {
            loyaltyEntry.rewards += 1; // Ganhou prêmio
            loyaltyEntry.progress = 0; // Zera contador

            // Notifica o cliente
            const rewardMsg = barbershop.loyaltyProgram.rewardDescription;
            const message = `Parabéns, ${customer.name}! 🎁\n\nVocê completou nosso cartão fidelidade e acaba de ganhar: *${rewardMsg}*!\n\nUse no seu próximo agendamento na ${barbershop.name}. 💈`;
            sendWhatsAppMessage(barbershopId, customer.phone, message);
          }

          await customer.save(); // Salva o cliente com o array loyaltyData atualizado
        }
      }

      // 4. Atualizar o status e salvar
      booking.status = status;
      await booking.save();

      // Invalidate availability cache
      await invalidateAvailabilityCache(booking.barber.toString());

      // 5. Retornar a resposta de sucesso com o agendamento atualizado
      res.status(200).json({
        success: true,
        message: `Agendamento atualizado para '${status}' com sucesso.`,
        data: booking,
      });
    } catch (error) {
      console.error("Erro ao atualizar status do agendamento:", error);
      res.status(500).json({ error: "Ocorreu um erro no servidor." });
    }
  }
);

router.put(
  "/:bookingId/cancel", // Mantivemos o mesmo padrão de URL, mas com outra proteção
  protectCustomer, // Protegida para garantir que um cliente esteja logado
  async (req, res) => {
    try {
      const { bookingId } = req.params;
      const customerId = req.customer.id; // ID do cliente logado, vindo do middleware protectCustomer

      if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({ error: "ID do agendamento inválido." });
      }

      // 1. Encontra o agendamento que o cliente quer cancelar
      const booking = await Booking.findById(bookingId);

      if (!booking) {
        return res.status(404).json({ error: "Agendamento não encontrado." });
      }

      // 2. VERIFICAÇÃO DE SEGURANÇA CRUCIAL!
      // Garante que o ID do cliente logado é o mesmo ID do cliente no agendamento.
      // Isso impede que o cliente A cancele o agendamento do cliente B.
      if (booking.customer.toString() !== customerId) {
        return res.status(403).json({
          error: "Você não tem permissão para cancelar este agendamento.",
        });
      }

      // 3. Regra de negócio: não permitir cancelamento de agendamentos que já passaram
      if (new Date(booking.time) < new Date()) {
        return res.status(400).json({
          error: "Não é possível cancelar um agendamento que já ocorreu.",
        });
      }

      // 4. Devolve créditos se o agendamento usou crédito de plano
      if (booking.subscriptionUsed && booking.paymentStatus === "plan_credit") {
        const subscription = await Subscription.findById(booking.subscriptionUsed);
        if (subscription) {
          subscription.creditsRemaining += 1;
          // Se estava expirado por falta de créditos, reativa
          if (subscription.status === "expired" && subscription.endDate >= new Date()) {
            subscription.status = "active";
          }
          await subscription.save();
        }
      }

      // 5. Se tudo estiver certo, atualiza o status
      booking.status = "canceled";
      await booking.save();

      // Invalidate availability cache
      await invalidateAvailabilityCache(booking.barber.toString());

      // Você pode adicionar uma notificação de WhatsApp para o admin/barbeiro aqui se desejar

      res.status(200).json({
        success: true,
        message: "Seu agendamento foi cancelado com sucesso.",
        data: booking,
      });
    } catch (error) {
      console.error("Erro ao cancelar agendamento pelo cliente:", error);
      res.status(500).json({ error: "Falha ao processar o cancelamento." });
    }
  }
);

router.put(
  "/:bookingId/redeem-reward",
  protectAdmin, // Apenas admin/barbeiro
  async (req, res) => {
    try {
      const { barbershopId, bookingId } = req.params;
      const barbershopMongoId = new mongoose.Types.ObjectId(barbershopId);

      // 1. Busca o agendamento e o cliente associado
      const booking = await Booking.findOne({
        _id: bookingId,
        barbershop: barbershopId,
      }).populate("customer"); // Popula o cliente inteiro

      if (!booking) {
        return res.status(404).json({ error: "Agendamento não encontrado." });
      }

      // 2. Verifica se o agendamento já não foi um prêmio ou de plano
      if (booking.isLoyaltyReward || booking.paymentStatus === "loyalty_reward") {
        return res.status(400).json({ error: "Este agendamento já foi resgatado como um prêmio." });
      }
      if (booking.paymentStatus === "plan_credit") {
        return res.status(400).json({ error: "Não é possível resgatar prêmio em um agendamento de plano." });
      }

      const customer = booking.customer;
      if (!customer) {
        return res.status(404).json({ error: "Cliente deste agendamento não encontrado." });
      }

      // 3. Encontra a entrada de fidelidade específica desta barbearia
      let loyaltyEntry = customer.loyaltyData.find((entry) => entry.barbershop.equals(barbershopMongoId));

      // 4. Verifica se o cliente tem prêmios para gastar
      if (!loyaltyEntry || loyaltyEntry.rewards <= 0) {
        return res.status(400).json({ error: "O cliente não possui prêmios de fidelidade para resgatar." });
      }

      // 5. GASTAR O PRÊMIO
      loyaltyEntry.rewards -= 1;
      await customer.save();

      // 6. ATUALIZAR O AGENDAMENTO
      booking.status = "completed"; // Marca como concluído
      booking.isLoyaltyReward = true; // Marca como prêmio
      booking.paymentStatus = "loyalty_reward"; // Novo status de pagamento
      // (Não marca 'countedForLoyalty' pois não deve dar pontos)
      await booking.save();

      res.status(200).json({
        success: true,
        message: "Prêmio resgatado! O agendamento foi concluído como cortesia.",
        data: booking,
      });
    } catch (error) {
      console.error("Erro ao resgatar prêmio de fidelidade:", error);
      res.status(500).json({ error: "Ocorreu um erro no servidor." });
    }
  }
);

router.get("/:barberId/monthly-availability", async (req, res) => {
  try {
    const { barbershopId, barberId } = req.params;
    const { year, month, serviceId } = req.query;

    if (!year || !month || !serviceId) {
      return res.status(400).json({ error: "Ano, mês e serviço são obrigatórios." });
    }

    // Check cache first
    const cacheKey = generateAvailabilityCacheKey(barberId, year, month, serviceId);
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const startDate = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
    const endDate = endOfMonth(startDate);

    // Obtém a data/hora atual no fuso horário do Brasil para comparação
    const nowInBrazil = toZonedTime(new Date(), "America/Sao_Paulo");

    // 1. Buscar todos os dados necessários para o mês de uma só vez
    const [barber, service, bookings, blockedDays, timeBlocks] = await Promise.all([
      Barber.findById(barberId).lean(),
      Service.findById(serviceId).lean(),
      Booking.find({
        barber: barberId,
        time: { $gte: startDate, $lte: endDate },
        status: { $ne: "canceled" },
      }).lean(),
      BlockedDay.find({
        barbershop: barbershopId,
        date: { $gte: startDate, $lte: endDate },
        barber: { $in: [null, barberId] },
      }).lean(),
      TimeBlock.find({
        barber: barberId,
        startTime: { $lt: endDate },
        endTime: { $gt: startDate },
      }).lean(),
    ]);

    if (!barber || !service) {
      return res.status(404).json({ error: "Barbeiro ou serviço não encontrado." });
    }

    const serviceDuration = service.duration;
    const daysInMonth = eachDayOfInterval({ start: startDate, end: endDate });
    const unavailableDays = new Set();

    const availabilityMap = new Map(barber.availability.map((a) => [a.day.toLowerCase(), a]));

    // Pre-index blocked days in Set for O(1) lookup
    const blockedDaysSet = new Set(blockedDays.map((blocked) => format(new Date(blocked.date), "yyyy-MM-dd")));

    // Group bookings by day in Map for faster access
    const bookingsByDay = new Map();
    for (const booking of bookings) {
      const dayStr = format(new Date(booking.time), "yyyy-MM-dd");
      if (!bookingsByDay.has(dayStr)) {
        bookingsByDay.set(dayStr, []);
      }
      bookingsByDay.get(dayStr).push(booking);
    }

    // 2. Iterar sobre cada dia do mês
    for (const day of daysInMonth) {
      const dayString = format(day, "yyyy-MM-dd");
      const dayOfWeekName = format(day, "EEEE", { locale: ptBR });

      // Causa #1: Dia bloqueado (O(1) lookup)
      if (blockedDaysSet.has(dayString)) {
        unavailableDays.add(dayString);
        continue;
      }

      // Causa #3: Barbeiro não trabalha
      const workHours = availabilityMap.get(dayOfWeekName.toLowerCase());
      if (!workHours) {
        unavailableDays.add(dayString);
        continue;
      }

      // Causa #4: Nenhum horário vago no dia
      let hasAvailableSlot = false;
      const slotInterval = 15;

      const [startWorkH, startWorkM] = workHours.start.split(":").map(Number);
      const [endWorkH, endWorkM] = workHours.end.split(":").map(Number);

      const dayStart = new Date(day);
      dayStart.setHours(startWorkH, startWorkM, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(endWorkH, endWorkM, 0, 0);

      const todaysBookings = bookingsByDay.get(dayString) || [];
      const todaysTimeBlocks = timeBlocks.filter((tb) => tb.startTime < dayEnd && tb.endTime > dayStart);

      // ---- VALIDAÇÃO ADICIONADA ----
      // Ajusta o ponto de partida da verificação para o dia de hoje
      let initialSlotTime = new Date(dayStart);
      if (isToday(day) && nowInBrazil > initialSlotTime) {
        // Define a hora inicial como a hora atual se já passamos do início do expediente
        initialSlotTime = nowInBrazil;
      }
      // -----------------------------

      let currentSlotTime = new Date(initialSlotTime);

      while (currentSlotTime < dayEnd) {
        const potentialEndTime = new Date(currentSlotTime.getTime() + serviceDuration * 60000);

        if (potentialEndTime > dayEnd) break;

        let hasConflict = false;

        // Verifica conflito com agendamentos
        for (const booking of todaysBookings) {
          const bookingStart = new Date(booking.time);
          const bookingEnd = new Date(bookingStart.getTime() + (booking.service?.duration || serviceDuration) * 60000);
          if (currentSlotTime < bookingEnd && potentialEndTime > bookingStart) {
            hasConflict = true;
            break;
          }
        }
        if (hasConflict) {
          currentSlotTime.setMinutes(currentSlotTime.getMinutes() + slotInterval);
          continue;
        }

        // Verifica conflito com bloqueios de tempo
        for (const block of todaysTimeBlocks) {
          if (currentSlotTime < new Date(block.endTime) && potentialEndTime > new Date(block.startTime)) {
            hasConflict = true;
            break;
          }
        }

        if (!hasConflict) {
          hasAvailableSlot = true;
          break;
        }

        currentSlotTime.setMinutes(currentSlotTime.getMinutes() + slotInterval);
      }

      if (!hasAvailableSlot) {
        unavailableDays.add(dayString);
      }
    }

    const result = { unavailableDays: Array.from(unavailableDays) };

    // Save to cache (5 min TTL)
    await cacheService.set(cacheKey, result, 300);

    res.status(200).json(result);
  } catch (error) {
    console.error("Erro ao buscar disponibilidade mensal:", error);
    res.status(500).json({ error: "Erro ao processar disponibilidade." });
  }
});

router.get(
  "/stream",
  protectAdmin, // Garante que apenas usuários logados (admin/barbeiro) possam conectar
  (req, res) => {
    const { barbershopId } = req.params;
    // Pega o barbershopId do token JWT para garantir que o usuário pertence a essa barbearia
    const userBarbershopId = req.adminUser?.barbershopId;

    if (userBarbershopId !== barbershopId) {
      return res.status(403).json({ error: "Não autorizado a escutar eventos desta barbearia." });
    }

    // 1. Configura os headers essenciais para SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders(); // Envia os headers imediatamente

    // 2. Adiciona o cliente à lista no sseService
    addClient(barbershopId, res);

    // 3. Envia um evento inicial (opcional, bom para confirmar a conexão)
    res.write(`event: connected\ndata: ${JSON.stringify({ message: "Conectado ao stream de agendamentos!" })}\n\n`);

    // 4. Ping periódico para manter a conexão viva (evita timeouts)
    const keepAliveInterval = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 20000); // A cada 20 segundos

    // 5. Lida com a desconexão do cliente
    req.on("close", () => {
      clearInterval(keepAliveInterval); // Para o ping
      removeClient(barbershopId, res); // Remove o cliente da lista
      res.end(); // Fecha a resposta
    });
  }
);

router.delete("/:bookingId", async (req, res) => {
  try {
    const { bookingId, barbershopId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ error: "ID do agendamento inválido." });
    }

    // Busca o booking primeiro para poder devolver créditos
    const booking = await Booking.findOne({
      _id: bookingId,
      barbershop: barbershopId,
    });

    if (!booking) {
      return res.status(404).json({ error: "Agendamento não encontrado." });
    }

    // Devolve créditos se o agendamento usou crédito de plano
    if (booking.subscriptionUsed && booking.paymentStatus === "plan_credit") {
      const subscription = await Subscription.findById(booking.subscriptionUsed);
      if (subscription) {
        subscription.creditsRemaining += 1;
        // Se estava expirado por falta de créditos, reativa
        if (subscription.status === "expired" && subscription.endDate >= new Date()) {
          subscription.status = "active";
        }
        await subscription.save();
      }
    }

    // Agora deleta o booking
    await Booking.findByIdAndDelete(bookingId);

    // Invalidate availability cache
    await invalidateAvailabilityCache(booking.barber.toString());

    const barbershop = await Barbershop.findById(barbershopId);

    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }

    const bookingDate = new Date(booking.time);

    const formattedDate = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(bookingDate);

    const message = `Olá ${booking.customer.name},\nInformamos que seu agendamento foi cancelado na ${barbershop.name} para o dia ${formattedDate} foi cancelado.`;

    sendWhatsAppMessage(barbershopId, booking.customer.phone, message);

    res.status(200).json({ message: "Agendamento excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir agendamento:", error);
    res.status(500).json({ error: "Falha ao excluir agendamento." });
  }
});

router.patch("/:bookingId/reschedule", async (req, res) => {
  try {
    const { barbershopId, bookingId } = req.params;
    const validationResult = rescheduleSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Dados inválidos.",
        details: validationResult.error.errors,
      });
    }

    const { newTime } = validationResult.data;
    const newBookingTime = new Date(newTime);

    // 1. Validação básica da nova data
    if (isPast(newBookingTime)) {
      return res.status(400).json({ error: "Não é possível reagendar para uma data passada." });
    }

    // 2. Buscar o agendamento original (populando dados necessários)
    const booking = await Booking.findOne({
      _id: bookingId,
      barbershop: barbershopId,
    })
      .populate("barber")
      .populate("service")
      .populate("customer", "name phone"); // Inclui customer para notificação

    if (!booking) {
      return res.status(404).json({ error: "Agendamento não encontrado nesta barbearia." });
    }

    // Se o agendamento já foi cancelado ou concluído, não pode reagendar
    if (["canceled", "completed"].includes(booking.status)) {
      return res.status(400).json({
        error: `Agendamentos com status '${booking.status}' não podem ser reagendados.`,
      });
    }

    const barber = booking.barber;
    const service = booking.service;
    const customer = booking.customer;

    if (!barber || !service || !customer) {
      return res.status(500).json({
        error: "Dados do agendamento original estão incompletos (barbeiro, serviço ou cliente).",
      });
    }

    // Verificar disponibilidade do barbeiro (dia da semana e horário)
    const dayOfWeekName = format(newBookingTime, "EEEE", { locale: ptBR });
    const workHours = barber.availability.find((a) => a.day.toLowerCase() === dayOfWeekName.toLowerCase());
    if (!workHours) {
      return res.status(400).json({ error: "O barbeiro não trabalha neste dia da semana." });
    }
    const [startH, startM] = workHours.start.split(":").map(Number);
    const [endH, endM] = workHours.end.split(":").map(Number);
    const newStartTimeMinutes = newBookingTime.getHours() * 60 + newBookingTime.getMinutes();
    const workStartTimeMinutes = startH * 60 + startM;
    const workEndTimeMinutes = endH * 60 + endM;
    const newEndTime = new Date(newBookingTime.getTime() + service.duration * 60000);
    const newEndTimeMinutes = newEndTime.getHours() * 60 + newEndTime.getMinutes();

    if (newStartTimeMinutes < workStartTimeMinutes || newEndTimeMinutes > workEndTimeMinutes) {
      return res.status(400).json({
        error: "O novo horário está fora do expediente do barbeiro.",
      });
    }

    //    c) Verificar conflitos com OUTROS agendamentos
    const conflictingBooking = await Booking.findOne({
      _id: { $ne: bookingId }, // Exclui o próprio agendamento da verificação
      barber: barber._id,
      time: newBookingTime,
      status: { $nin: ["canceled"] },
    });
    if (conflictingBooking) {
      return res.status(409).json({
        error: "Conflito: Já existe outro agendamento neste novo horário.",
      });
    }

    //    d) Verificar conflitos com bloqueios de tempo (TimeBlock)
    const conflictingTimeBlock = await TimeBlock.findOne({
      barber: barber._id,
      startTime: { $lt: newEndTime },
      endTime: { $gt: newBookingTime },
    });
    if (conflictingTimeBlock) {
      return res.status(409).json({
        error: "Conflito: O novo horário coincide com um período bloqueado.",
      });
    }

    // 4. Atualizar o horário do agendamento
    booking.time = newBookingTime;
    // Opcional: Mudar status para 'confirmed' ou manter 'booked'
    // booking.status = "confirmed";
    await booking.save();

    // Invalidate availability cache
    await invalidateAvailabilityCache(booking.barber._id.toString());

    // 5. (Opcional) Notificar o cliente sobre o reagendamento
    const formattedNewTime = format(newBookingTime, "dd/MM/yyyy 'às' HH:mm", {
      locale: ptBR,
    });
    const message = `Olá, ${customer.name}! Seu agendamento foi reagendado para ${formattedNewTime}. Até lá! 💈`;
    sendWhatsAppMessage(barbershopId, customer.phone, message);

    res.status(200).json({
      success: true,
      message: "Agendamento reagendado com sucesso!",
      data: booking, // Retorna o agendamento atualizado
    });
  } catch (error) {
    console.error("Erro ao reagendar:", error);
    if (error instanceof z.ZodError) {
      // Trata erros específicos do Zod
      return res.status(400).json({
        error: "Dados de entrada inválidos.",
        details: error.errors,
      });
    }
    res.status(500).json({ error: "Ocorreu um erro interno ao reagendar." });
  }
});

// SSE stats endpoint
router.get("/sse-stats", protectAdmin, (req, res) => {
  const stats = getConnectionStats();
  res.status(200).json(stats);
});

export default router;
