import express from "express";
import { stripe } from "../services/stripeService.js";
import Booking from "../models/Booking.js";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import Barbershop from "../models/Barbershop.js";
import AdminUser from "../models/AdminUser.js";
import BarbershopSubscription from "../models/BarbershopSubscription.js";
import { formatBookingTime } from "../utils/formatBookingTime.js";
import { sendWhatsAppConfirmation } from "../services/evolutionWhatsapp.js";
import { sendEventToBarbershop } from "../services/sseService.js";
import { sendDiscordNotification, createReminderLogEmbed } from "../services/discordService.js";

const router = express.Router();

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const DISCORD_LOGS_WEBHOOK_URL = process.env.DISCORD_LOGS_WEBHOOK_URL;
const ADMIN_URL = process.env.ADMIN_URL || "https://admin.barbeariagendamento.com.br";
const SAAS_MONTHLY_PRICE = Number(process.env.SAAS_MONTHLY_PRICE) || 99.9;

router.post("/", async (req, res) => {
  const sig = req.headers["stripe-signature"];

  if (!WEBHOOK_SECRET) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET não configurado.");
    return res.status(500).send("Webhook secret não configurado.");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("[Stripe Webhook] Assinatura inválida:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Responde 200 imediatamente para o Stripe não reenviar
  res.sendStatus(200);

  const logPrefix = `[Stripe ${event.type}]`;
  console.log(`${logPrefix} Evento: ${event.id}`);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object, logPrefix);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object, logPrefix);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object, logPrefix);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object, logPrefix);
        break;
      default:
        console.log(`${logPrefix} Evento não tratado.`);
    }
  } catch (err) {
    console.error(`${logPrefix} Erro ao processar evento:`, err.message, err.stack);
  }
});

async function handleCheckoutSessionCompleted(session, logPrefix) {
  const type = session.metadata?.type;
  console.log(`${logPrefix} type=${type} mode=${session.mode}`);

  if (type === "booking") {
    await confirmBookingPayment(session, logPrefix);
  } else if (type === "plan_subscription") {
    await activatePlanSubscription(session, logPrefix);
  } else if (type === "saas") {
    await createBarbershopFromSaas(session, logPrefix);
  }
}

async function confirmBookingPayment(session, logPrefix) {
  const { bookingId, barbershopId } = session.metadata;

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    console.warn(`${logPrefix} Booking ${bookingId} não encontrado.`);
    return;
  }

  if (booking.paymentStatus === "approved") {
    console.log(`${logPrefix} Booking ${bookingId} já aprovado. Ignorando.`);
    return;
  }

  booking.paymentStatus = "approved";
  // Salva o PaymentIntent ID para estornos futuros
  booking.paymentId = session.payment_intent;

  if (booking.isPaymentMandatory && ["pending_payment", "booked"].includes(booking.status)) {
    booking.status = "confirmed";
    console.log(`${logPrefix} Booking ${bookingId} confirmado após pagamento.`);

    try {
      await booking.populate([
        { path: "customer", select: "name phone" },
        { path: "barbershop", select: "name contact slug" },
        { path: "service", select: "name" },
      ]);

      const formattedTime = formatBookingTime(booking.time, true);
      const cleanPhone = booking.barbershop.contact?.replace(/\D/g, "");
      const whatsappLink = cleanPhone ? `\n\nFale com a barbearia: https://wa.me/55${cleanPhone}` : "";
      const message = `Olá, ${booking.customer.name}! Seu pagamento foi aprovado e seu agendamento na ${booking.barbershop.name} está confirmado para ${formattedTime} ✅\n\nNos vemos lá! 💈${whatsappLink}`;

      sendWhatsAppConfirmation(booking.customer.phone, message).catch((err) =>
        console.error(`${logPrefix} Erro WhatsApp:`, err.message)
      );

      sendEventToBarbershop(barbershopId, "new_booking", booking.toObject());
    } catch (notifyErr) {
      console.error(`${logPrefix} Erro nas notificações:`, notifyErr.message);
    }
  }

  await booking.save();
}

async function activatePlanSubscription(session, logPrefix) {
  const { customerId, planId, barbershopId } = session.metadata;
  const stripeSubscriptionId = session.subscription;

  const existing = await Subscription.findOne({
    customer: customerId,
    plan: planId,
    barbershop: barbershopId,
    status: "active",
  });

  if (existing) {
    console.log(`${logPrefix} Subscription já ativa para este plano. Ignorando.`);
    return;
  }

  const plan = await Plan.findById(planId);
  if (!plan) {
    console.error(`${logPrefix} Plano ${planId} não encontrado.`);
    return;
  }

  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + plan.durationInDays);

  const nextPaymentDate = new Date(now);
  nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

  const subscription = await Subscription.create({
    customer: customerId,
    plan: planId,
    barbershop: barbershopId,
    startDate: now,
    endDate,
    status: "active",
    creditsRemaining: plan.totalCredits,
    autoRenew: true,
    stripeSubscriptionId,
    lastPaymentDate: now,
    nextPaymentDate,
  });

  console.log(`${logPrefix} Subscription ${subscription._id} criada. Plano: ${plan.name}`);
}

async function createBarbershopFromSaas(session, logPrefix) {
  const { barbershopName, email, contact } = session.metadata;
  const stripeSubscriptionId = session.subscription;

  const existingAdmin = await AdminUser.findOne({ email: email.toLowerCase() });
  if (existingAdmin) {
    console.log(`${logPrefix} Admin ${email} já existe. Ignorando criação.`);
    return;
  }

  let baseSlug = (barbershopName || "barbearia")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim() || "barbearia";

  let slug = baseSlug;
  let counter = 1;
  while (await Barbershop.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  const barbershop = await Barbershop.create({
    name: barbershopName,
    slug,
    contact: contact || "",
    address: { cep: "", estado: "", cidade: "", bairro: "", rua: "", numero: "" },
    workingHours: [
      { day: "Segunda", start: "09:00", end: "19:00" },
      { day: "Terça", start: "09:00", end: "19:00" },
      { day: "Quarta", start: "09:00", end: "19:00" },
      { day: "Quinta", start: "09:00", end: "19:00" },
      { day: "Sexta", start: "09:00", end: "19:00" },
      { day: "Sábado", start: "09:00", end: "15:00" },
    ],
    accountStatus: "active",
    isTrial: false,
  });

  await AdminUser.create({
    email: email.toLowerCase(),
    barbershop: barbershop._id,
    role: "admin",
    status: "pending",
  });

  const nextBillingDate = new Date();
  nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

  await BarbershopSubscription.create({
    barbershop: barbershop._id,
    planName: "Plano Profissional",
    monthlyPrice: SAAS_MONTHLY_PRICE,
    startDate: new Date(),
    nextBillingDate,
    status: "active",
    notes: `Stripe Subscription: ${stripeSubscriptionId}`,
    paymentHistory: [
      {
        date: new Date(),
        amount: SAAS_MONTHLY_PRICE,
        status: "paid",
        notes: "Primeiro pagamento via Stripe",
      },
    ],
  });

  console.log(`${logPrefix} Barbearia "${barbershopName}" criada. Slug: ${slug}, Admin: ${email}`);

  if (DISCORD_LOGS_WEBHOOK_URL) {
    sendDiscordNotification(
      DISCORD_LOGS_WEBHOOK_URL,
      createReminderLogEmbed("Nova Barbearia Cadastrada via Assinatura", 5763719, [
        { name: "Barbearia", value: barbershopName, inline: true },
        { name: "Email", value: email, inline: true },
        { name: "Slug", value: slug, inline: true },
      ])
    ).catch((err) => console.error(`${logPrefix} Discord error:`, err.message));
  }

  if (contact) {
    const welcomeMessage =
      `Olá! Sua assinatura do *BarbeariAgendamento* foi aprovada com sucesso!\n\n` +
      `Sua barbearia *${barbershopName}* já está pronta para uso.\n\n` +
      `Para acessar seu painel:\n` +
      `1. Acesse o link abaixo\n` +
      `2. Digite seu email: *${email}*\n` +
      `3. Crie sua senha e pronto!\n\n` +
      `${ADMIN_URL}/login?primeiro-acesso=true\n\n` +
      `Qualquer dúvida, estamos aqui para ajudar!`;

    sendWhatsAppConfirmation(contact, welcomeMessage).catch((err) =>
      console.error(`${logPrefix} Erro WhatsApp boas-vindas:`, err.message)
    );
  }
}

async function handleInvoicePaid(invoice, logPrefix) {
  const stripeSubscriptionId = invoice.subscription;
  if (!stripeSubscriptionId) return;

  const subscription = await Subscription.findOne({ stripeSubscriptionId }).populate("plan");
  if (!subscription) {
    // Pode ser renovação SaaS — não há modelo Subscription para isso
    console.log(`${logPrefix} Nenhuma Subscription encontrada para ${stripeSubscriptionId}. Pode ser SaaS.`);
    return;
  }

  if (subscription.status === "active" || subscription.status === "expired") {
    const now = new Date();
    subscription.lastPaymentDate = now;
    subscription.startDate = now;

    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + subscription.plan.durationInDays);
    subscription.endDate = endDate;

    subscription.creditsRemaining = subscription.plan.totalCredits;

    const nextPaymentDate = new Date(now);
    nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
    subscription.nextPaymentDate = nextPaymentDate;
    subscription.status = "active";

    await subscription.save();
    console.log(`${logPrefix} Subscription ${subscription._id} renovada. Créditos: ${subscription.creditsRemaining}`);
  }
}

async function handleSubscriptionUpdated(stripeSubscription, logPrefix) {
  if (!stripeSubscription.cancel_at_period_end) return;

  const subscription = await Subscription.findOne({ stripeSubscriptionId: stripeSubscription.id });
  if (subscription) {
    subscription.autoRenew = false;
    await subscription.save();
    console.log(`${logPrefix} Subscription ${subscription._id} marcada para não renovar.`);
  }
}

async function handleSubscriptionDeleted(stripeSubscription, logPrefix) {
  const subscription = await Subscription.findOne({ stripeSubscriptionId: stripeSubscription.id });
  if (subscription) {
    subscription.autoRenew = false;
    await subscription.save();
    console.log(`${logPrefix} Subscription ${subscription._id} cancelada no Stripe.`);
  }
}

export default router;
