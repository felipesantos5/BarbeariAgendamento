import express from "express";
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import crypto from "crypto";
import Barbershop from "../models/Barbershop.js";
import AdminUser from "../models/AdminUser.js";
import BarbershopSubscription from "../models/BarbershopSubscription.js";
import { sendDiscordNotification, createReminderLogEmbed } from "../services/discordService.js";
import { sendWhatsAppConfirmation } from "../services/evolutionWhatsapp.js";

const router = express.Router();

const SAAS_MP_ACCESS_TOKEN = process.env.SAAS_MERCADOPAGO_ACCESS_TOKEN;
const SAAS_MP_WEBHOOK_SECRET = process.env.SAAS_MERCADOPAGO_WEBHOOK_SECRET;
const DISCORD_LOGS_WEBHOOK_URL = process.env.DISCORD_LOGS_WEBHOOK_URL;
const BASE_URL = process.env.BASE_URL || "https://www.barbeariagendamento.com.br";
const ADMIN_URL = process.env.ADMIN_URL || "https://admin.barbeariagendamento.com.br";
const API_URL = process.env.API_URL || "https://api.barbeariagendamento.com.br";

// Valor mensal do plano SaaS
const SAAS_MONTHLY_PRICE = 99.9;

/**
 * Gera um slug único a partir do nome da barbearia
 */
async function generateUniqueSlug(name) {
  let baseSlug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

  if (!baseSlug) baseSlug = "barbearia";

  let slug = baseSlug;
  let counter = 1;

  while (await Barbershop.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

/**
 * Cria a barbearia e o admin user automaticamente
 */
async function createBarbershopFromSubscription(barbershopName, adminEmail, contact, mpPreapprovalId) {
  // Verifica se já existe um admin com esse email
  const existingAdmin = await AdminUser.findOne({ email: adminEmail.toLowerCase() });
  if (existingAdmin) {
    console.log(`[SaaS] Admin com email ${adminEmail} já existe. Ignorando criação.`);
    return null;
  }

  const slug = await generateUniqueSlug(barbershopName);

  // Cria a barbearia com configurações padrão
  const barbershop = await Barbershop.create({
    name: barbershopName,
    slug,
    contact: contact || "",
    address: {
      cep: "",
      estado: "",
      cidade: "",
      bairro: "",
      rua: "",
      numero: "",
    },
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

  // Cria o admin sem senha (primeiro acesso cria a senha)
  const admin = await AdminUser.create({
    email: adminEmail.toLowerCase(),
    barbershop: barbershop._id,
    role: "admin",
    status: "pending",
  });

  // Cria a assinatura SaaS da barbearia
  const nextBillingDate = new Date();
  nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

  await BarbershopSubscription.create({
    barbershop: barbershop._id,
    planName: "Plano Profissional",
    monthlyPrice: SAAS_MONTHLY_PRICE,
    startDate: new Date(),
    nextBillingDate,
    status: "active",
    notes: `MP PreApproval: ${mpPreapprovalId}`,
    paymentHistory: [
      {
        date: new Date(),
        amount: SAAS_MONTHLY_PRICE,
        status: "paid",
        notes: "Primeiro pagamento via Mercado Pago",
      },
    ],
  });

  console.log(`[SaaS] Barbearia "${barbershopName}" criada com sucesso! Slug: ${slug}, Admin: ${adminEmail}`);

  // Notifica no Discord
  if (DISCORD_LOGS_WEBHOOK_URL) {
    await sendDiscordNotification(
      DISCORD_LOGS_WEBHOOK_URL,
      createReminderLogEmbed("🎉 Nova Barbearia Cadastrada via Assinatura", 5763719, [
        { name: "Barbearia", value: barbershopName, inline: true },
        { name: "Email", value: adminEmail, inline: true },
        { name: "Slug", value: slug, inline: true },
        { name: "Plano", value: `R$ ${SAAS_MONTHLY_PRICE}/mês`, inline: true },
      ])
    );
  }

  // Envia WhatsApp de boas-vindas pelo número fixo do BarbeariAgendamento
  if (contact) {
    const welcomeMessage =
      `Olá! Sua assinatura do *BarbeariAgendamento* foi aprovada com sucesso! 🎉\n\n` +
      `Sua barbearia *${barbershopName}* já está pronta para uso.\n\n` +
      `Para acessar seu painel:\n` +
      `1. Acesse o link abaixo\n` +
      `2. Digite seu email: *${adminEmail}*\n` +
      `3. Crie sua senha e pronto!\n\n` +
      `${ADMIN_URL}/login?primeiro-acesso=true\n\n` +
      `Qualquer dúvida, estamos aqui para ajudar! 💈`;

    try {
      await sendWhatsAppConfirmation(contact, welcomeMessage);
      console.log(`[SaaS] WhatsApp de boas-vindas enviado para ${contact}`);
    } catch (error) {
      console.error(`[SaaS] Erro ao enviar WhatsApp de boas-vindas:`, error.message);
    }
  }

  return { barbershop, admin };
}

/**
 * POST /api/saas/checkout
 * Cria uma assinatura recorrente no Mercado Pago e retorna o link de pagamento
 */
router.post("/checkout", async (req, res) => {
  try {
    const { barbershopName, email, contact } = req.body;

    if (!barbershopName || !email) {
      return res.status(400).json({ error: "Nome da barbearia e email são obrigatórios." });
    }

    if (!SAAS_MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: "Token do Mercado Pago não configurado." });
    }

    // Verifica se o email já está em uso
    const existingAdmin = await AdminUser.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(409).json({ error: "Este email já está cadastrado no sistema." });
    }

    const client = new MercadoPagoConfig({ accessToken: SAAS_MP_ACCESS_TOKEN });
    const preApproval = new PreApproval(client);

    // Dados para identificar depois no webhook
    const externalReference = JSON.stringify({
      barbershopName,
      email: email.toLowerCase(),
      contact: contact || "",
    });

    const webhookUrl = `${API_URL}/api/saas/webhook`;

    const preApprovalData = await preApproval.create({
      body: {
        reason: `BarbeariAgendamento - Plano Profissional`,
        external_reference: externalReference,
        payer_email: email.toLowerCase(),
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: SAAS_MONTHLY_PRICE,
          currency_id: "BRL",
        },
        back_url: `${ADMIN_URL}/login`,
        notification_url: webhookUrl,
      },
    });

    console.log(`[SaaS] PreApproval criado: ${preApprovalData.id} para ${email}`);

    res.json({
      init_point: preApprovalData.init_point,
      preapprovalId: preApprovalData.id,
    });
  } catch (error) {
    console.error("[SaaS] Erro ao criar checkout:", error);
    res.status(500).json({
      error: "Erro ao criar assinatura.",
      message: error.message,
    });
  }
});

/**
 * POST /api/saas/webhook
 * Recebe notificações do Mercado Pago sobre assinaturas SaaS
 */
router.post("/webhook", async (req, res) => {
  try {
    const eventType = req.body?.type || req.query?.type;
    const dataId = req.body?.data?.id || req.query?.["data.id"];

    console.log(`[SaaS Webhook] Evento: ${eventType}, ID: ${dataId}`);

    // Responde imediatamente (MP exige 200 rápido)
    res.status(200).json({ received: true });

    if (!dataId || !SAAS_MP_ACCESS_TOKEN) return;

    // Processa apenas eventos de assinatura
    if (eventType === "subscription_preapproval" || eventType === "payment") {
      await processSubscriptionEvent(eventType, dataId);
    }
  } catch (error) {
    console.error("[SaaS Webhook] Erro:", error);
    if (!res.headersSent) {
      res.status(200).json({ received: true });
    }
  }
});

/**
 * Processa eventos de assinatura do Mercado Pago
 */
async function processSubscriptionEvent(eventType, dataId) {
  try {
    const client = new MercadoPagoConfig({ accessToken: SAAS_MP_ACCESS_TOKEN });

    if (eventType === "subscription_preapproval") {
      // Busca detalhes da assinatura
      const preApproval = new PreApproval(client);
      const subscription = await preApproval.get({ id: dataId });

      console.log(`[SaaS Webhook] Status da assinatura ${dataId}: ${subscription.status}`);

      // Cria barbearia quando assinatura é autorizada
      if (subscription.status === "authorized" && subscription.external_reference) {
        let refData;
        try {
          refData = JSON.parse(subscription.external_reference);
        } catch {
          console.error("[SaaS Webhook] external_reference inválido:", subscription.external_reference);
          return;
        }

        await createBarbershopFromSubscription(
          refData.barbershopName,
          refData.email,
          refData.contact,
          dataId
        );
      }
    } else if (eventType === "payment") {
      // Para pagamentos, busca o preapproval associado via API de pagamentos
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
        headers: { Authorization: `Bearer ${SAAS_MP_ACCESS_TOKEN}` },
      });

      if (!response.ok) {
        console.error(`[SaaS Webhook] Erro ao buscar pagamento ${dataId}: ${response.status}`);
        return;
      }

      const payment = await response.json();

      if (payment.status === "approved" && payment.external_reference) {
        let refData;
        try {
          refData = JSON.parse(payment.external_reference);
        } catch {
          console.log("[SaaS Webhook] payment external_reference não é JSON, ignorando.");
          return;
        }

        // Verifica se a barbearia já existe (evita duplicatas)
        const existingAdmin = await AdminUser.findOne({ email: refData.email?.toLowerCase() });
        if (!existingAdmin) {
          await createBarbershopFromSubscription(
            refData.barbershopName,
            refData.email,
            refData.contact,
            payment.metadata?.preapproval_id || dataId
          );
        } else {
          console.log(`[SaaS Webhook] Admin ${refData.email} já existe. Pagamento recorrente.`);
        }
      }
    }
  } catch (error) {
    console.error("[SaaS Webhook] Erro ao processar evento:", error);
  }
}

export default router;
