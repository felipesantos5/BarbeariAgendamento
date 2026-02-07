import express from "express";
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import crypto from "crypto";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import Barbershop from "../models/Barbershop.js";
import Customer from "../models/Customer.js";
import { protectCustomer } from "../middleware/authCustomerMiddleware.js";
import { protectAdmin } from "../middleware/authAdminMiddleware.js";

const router = express.Router({ mergeParams: true });

// Função para validar assinatura do webhook do Mercado Pago
function validateWebhookSignature(req, secret) {
  try {
    const xSignature = req.headers["x-signature"];
    const xRequestId = req.headers["x-request-id"];

    if (!xSignature || !xRequestId) {
      console.log("⚠️ Headers x-signature ou x-request-id ausentes");
      return false;
    }

    // Extrair dataId da query ou do body
    const dataId = req.query["data.id"] || req.body?.data?.id;

    if (!dataId) {
      console.log("⚠️ data.id não encontrado na requisição");
      return false;
    }

    // Extrair ts e hash do header x-signature
    // Formato: "ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8eda45a0282ff693eac24131a5e839"
    const parts = xSignature.split(",");
    let ts = null;
    let hash = null;

    parts.forEach((part) => {
      const [key, value] = part.split("=");
      if (key.trim() === "ts") ts = value;
      if (key.trim() === "v1") hash = value;
    });

    if (!ts || !hash) {
      console.log("⚠️ Não foi possível extrair ts ou hash do x-signature");
      return false;
    }

    // Montar o manifest conforme documentação do MP
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    // Gerar assinatura usando HMAC SHA256
    const cyphedSignature = crypto
      .createHmac("sha256", secret)
      .update(manifest)
      .digest("hex");

    // Comparar assinaturas
    if (cyphedSignature === hash) {
      console.log("✅ Assinatura webhook validada com sucesso");
      return true;
    } else {
      console.log("❌ Assinatura webhook inválida");
      console.log("Expected:", cyphedSignature);
      console.log("Received:", hash);
      return false;
    }
  } catch (error) {
    console.error("❌ Erro ao validar assinatura do webhook:", error);
    return false;
  }
}

// POST /api/barbershops/:barbershopId/subscriptions/create-preapproval
// Cria uma assinatura recorrente no Mercado Pago
router.post("/create-preapproval", protectCustomer, async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { planId } = req.body;
    const customer = req.customer;

    if (!planId) {
      return res.status(400).json({ error: "O ID do plano é obrigatório." });
    }

    // Buscar barbershop e plano
    const [barbershop, plan] = await Promise.all([
      Barbershop.findById(barbershopId),
      Plan.findById(planId),
    ]);

    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }

    if (!plan || plan.barbershop.toString() !== barbershopId) {
      return res.status(404).json({ error: "Plano não encontrado ou não pertence a esta barbearia." });
    }

    // Verificar se pagamentos estão habilitados
    if (!barbershop.paymentsEnabled || !barbershop.mercadoPagoAccessToken) {
      return res.status(400).json({
        error: "Pagamento online não está habilitado para esta barbearia.",
      });
    }

    // Verificar se já tem assinatura ativa para este plano
    const existingSubscription = await Subscription.findOne({
      customer: customer._id,
      plan: planId,
      barbershop: barbershopId,
      status: "active",
    });

    if (existingSubscription) {
      return res.status(400).json({
        error: "Você já possui uma assinatura ativa para este plano.",
      });
    }

    // Calcular datas
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + plan.durationInDays);

    // Criar Subscription com status pending
    const subscription = new Subscription({
      customer: customer._id,
      plan: planId,
      barbershop: barbershopId,
      startDate,
      endDate,
      status: "pending",
      creditsRemaining: plan.totalCredits,
      autoRenew: true,
    });

    await subscription.save();

    // Adicionar ao array de subscriptions do customer
    await Customer.findByIdAndUpdate(customer._id, {
      $push: { subscriptions: subscription._id },
    });

    // Configurar Mercado Pago
    const client = new MercadoPagoConfig({
      accessToken: barbershop.mercadoPagoAccessToken,
    });

    const preapproval = new PreApproval(client);

    // Dados do external_reference para identificar no webhook
    const externalReference = JSON.stringify({
      subscriptionId: subscription._id.toString(),
      customerId: customer._id.toString(),
      customerPhone: customer.phone,
      planId: plan._id.toString(),
      barbershopId: barbershop._id.toString(),
    });

    // Definir notification_url para receber webhooks do Mercado Pago
    const notificationUrl = `https://api.barbeariagendamento.com.br/api/barbershops/${barbershopId}/subscriptions/webhook?barbershopId=${barbershopId}`;

    console.log(`📋 Criando PreApproval com notification_url: ${notificationUrl}`);

    const preapprovalData = {
      body: {
        reason: `Plano ${plan.name} - ${barbershop.name}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: plan.price,
          currency_id: "BRL",
        },
        payer_email: `cliente_${customer._id}@barbeariagendamento.com.br`,
        back_url: `https://barbeariagendamento.com.br/${barbershop.slug}/assinatura-sucesso`,
        external_reference: externalReference,
        notification_url: notificationUrl,
      },
    };

    console.log("📤 Enviando PreApproval para Mercado Pago...");
    const result = await preapproval.create(preapprovalData);
    console.log("✅ PreApproval criado:", result.id);

    // Salvar ID do preapproval na subscription
    subscription.mercadoPagoPreapprovalId = result.id;
    await subscription.save();

    res.json({
      init_point: result.init_point,
      subscriptionId: subscription._id,
    });
  } catch (error) {
    console.error("Erro ao criar assinatura:", error);
    const errorMessage = error.cause?.message || error.message || "Falha ao criar assinatura.";
    res.status(500).json({
      error: "Falha ao criar assinatura.",
      details: errorMessage,
    });
  }
});

// GET /api/barbershops/:barbershopId/subscriptions/webhook
// Endpoint de teste para verificar se URL está acessível
router.get("/webhook", async (req, res) => {
  console.log("🔍 Webhook GET recebido - endpoint está acessível!");
  console.log("Query params:", req.query);
  console.log("Headers:", req.headers);
  res.json({
    status: "ok",
    message: "Webhook endpoint está funcionando!",
    timestamp: new Date().toISOString(),
    receivedParams: req.query,
  });
});

// POST /api/barbershops/:barbershopId/subscriptions/webhook
// Recebe notificações do Mercado Pago sobre assinaturas
router.post("/webhook", async (req, res) => {
  const notification = req.body;

  // Tentar extrair barbershopId de múltiplas fontes
  let barbershopId = req.query.barbershopId || req.params.barbershopId;

  const logPrefix = `[WEBHOOK-SUB ${notification.type || 'unknown'}]`;
  console.log(`${logPrefix} 🔔 WEBHOOK RECEBIDO - ID: ${notification.data?.id}`);

  // Responder 200 imediatamente para o MP não reenviar
  res.sendStatus(200);

  try {
    const notificationType = notification.type;
    const dataId = notification.data?.id;

    if (!dataId) {
      console.log(`${logPrefix} ⚠️ data.id ausente - abortando`);
      return;
    }

    // Se não tem barbershopId nos params, tentar extrair do preapproval
    if (!barbershopId) {
      console.log(`${logPrefix} ⚠️ barbershopId não encontrado em query/params`);
      console.log(`${logPrefix} 🔍 Tentando extrair de external_reference...`);

      // Buscar o preapproval para pegar external_reference
      try {
        const { MercadoPagoConfig, PreApproval } = await import("mercadopago");

        // Precisamos de algum barbershop para buscar - vamos buscar todos e tentar encontrar
        const allBarbershops = await Barbershop.find({ mercadoPagoAccessToken: { $exists: true, $ne: null } });

        for (const shop of allBarbershops) {
          try {
            const client = new MercadoPagoConfig({ accessToken: shop.mercadoPagoAccessToken });
            const preapproval = new PreApproval(client);
            const preapprovalData = await preapproval.get({ id: dataId });

            if (preapprovalData.external_reference) {
              const refData = JSON.parse(preapprovalData.external_reference);
              if (refData.barbershopId) {
                barbershopId = refData.barbershopId;
                console.log(`${logPrefix} ✅ barbershopId encontrado em external_reference: ${barbershopId}`);
                break;
              }
            }
          } catch (e) {
            // Continuar tentando com próximo barbershop
            continue;
          }
        }
      } catch (error) {
        console.log(`${logPrefix} ❌ Erro ao buscar external_reference:`, error.message);
      }

      if (!barbershopId) {
        console.log(`${logPrefix} ❌ Impossível determinar barbershopId - abortando`);
        return;
      }
    }

    console.log(`${logPrefix} 🏪 Barbershop ID: ${barbershopId}`);

    // Buscar barbershop para validar assinatura
    const barbershop = await Barbershop.findById(barbershopId);

    if (!barbershop) {
      console.log(`${logPrefix} ❌ Barbershop não encontrada: ${barbershopId}`);
      return;
    }

    if (!barbershop.mercadoPagoAccessToken) {
      console.log(`${logPrefix} ❌ Barbershop sem token do MP configurado`);
      return;
    }

    // Se tem webhook secret configurado, validar assinatura
    if (barbershop.mercadoPagoWebhookSecret) {
      const isValid = validateWebhookSignature(req, barbershop.mercadoPagoWebhookSecret);

      if (!isValid) {
        console.log(`${logPrefix} ❌ Assinatura inválida - webhook rejeitado`);
        return;
      }
      console.log(`${logPrefix} ✅ Assinatura validada com sucesso`);
    } else {
      console.log(`${logPrefix} ⚠️ Webhook secret não configurado - processando sem validação`);
    }

    // Tipos de notificação do MP para subscriptions:
    // - subscription_preapproval (criação/atualização)
    // - subscription_authorized_payment (pagamento autorizado)
    // - payment (pagamento processado)

    if (!notificationType) {
      console.log(`${logPrefix} ⚠️ Tipo de notificação ausente`);
      return;
    }

    const client = new MercadoPagoConfig({
      accessToken: barbershop.mercadoPagoAccessToken,
    });

    // ========== PROCESSAR SUBSCRIPTION_PREAPPROVAL ==========
    if (notificationType === "subscription_preapproval") {
      const preapproval = new PreApproval(client);
      const preapprovalData = await preapproval.get({ id: dataId });

      // Tentar encontrar subscription pelo mercadoPagoPreapprovalId
      let subscription = await Subscription.findOne({
        mercadoPagoPreapprovalId: dataId,
      }).populate("plan");

      console.log(`${logPrefix} 🔍 Busca por mercadoPagoPreapprovalId: ${subscription ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);

      // Se não encontrou pelo ID, tentar pelo external_reference
      if (!subscription && preapprovalData.external_reference) {
        try {
          const refData = JSON.parse(preapprovalData.external_reference);
          console.log(`${logPrefix} 🔍 Tentando buscar por external_reference:`, refData);
          subscription = await Subscription.findById(refData.subscriptionId).populate("plan");
          console.log(`${logPrefix} 🔍 Busca por external_reference: ${subscription ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);

          // Salvar o mercadoPagoPreapprovalId se não tinha
          if (subscription && !subscription.mercadoPagoPreapprovalId) {
            subscription.mercadoPagoPreapprovalId = dataId;
          }
        } catch (parseError) {
          console.error("❌ Erro ao parsear external_reference:", parseError);
        }
      }

      if (!subscription) {
        console.log(`${logPrefix} ❌ Subscription não encontrada - abortando processamento`);
        return;
      }

      console.log(`${logPrefix} 📊 Status atual da subscription:`, {
        _id: subscription._id,
        status: subscription.status,
        creditsRemaining: subscription.creditsRemaining,
      });

      // Atualizar baseado no status do preapproval
      console.log(`${logPrefix} 🔄 Processando status do preapproval: ${preapprovalData.status}`);

      if (preapprovalData.status === "authorized" || preapprovalData.status === "pending") {
        if (subscription.status === "pending") {
          subscription.status = "active";
          subscription.lastPaymentDate = new Date();
          subscription.nextPaymentDate = new Date();
          subscription.nextPaymentDate.setMonth(subscription.nextPaymentDate.getMonth() + 1);
          await subscription.save();
          console.log(`${logPrefix} ✅ Subscription ${subscription._id} ativada com sucesso!`);
        } else {
          console.log(`${logPrefix} ⚠️ Subscription já está com status: ${subscription.status} (não é pending)`);
        }
      } else if (preapprovalData.status === "paused") {
        subscription.autoRenew = false;
        await subscription.save();
        console.log(`${logPrefix} ⏸️ Subscription pausada - autoRenew desativado`);
      } else if (preapprovalData.status === "cancelled") {
        subscription.autoRenew = false;
        await subscription.save();
        console.log(`${logPrefix} ❌ Subscription cancelada - autoRenew desativado`);
      } else {
        console.log(`${logPrefix} ⚠️ Status do preapproval não reconhecido: ${preapprovalData.status}`);
      }
    }

    // ========== PROCESSAR PAYMENT ==========
    if (notificationType === "payment") {
      const { Payment } = await import("mercadopago");
      const payment = new Payment(client);
      const paymentData = await payment.get({ id: dataId });

      if (paymentData.status === "approved" && paymentData.preapproval_id) {
        const subscription = await Subscription.findOne({
          mercadoPagoPreapprovalId: paymentData.preapproval_id,
        }).populate("plan");

        console.log(`${logPrefix} 🔍 Subscription do pagamento: ${subscription ? 'ENCONTRADA' : 'NÃO ENCONTRADA'}`);

        if (subscription) {
          console.log(`${logPrefix} 📊 Status atual: ${subscription.status}`);

          // Se está pending, é o primeiro pagamento - ativar
          if (subscription.status === "pending") {
            subscription.status = "active";
            subscription.lastPaymentDate = new Date();
            subscription.nextPaymentDate = new Date();
            subscription.nextPaymentDate.setMonth(subscription.nextPaymentDate.getMonth() + 1);
            await subscription.save();
            console.log(`✅ Subscription ${subscription._id} ativada`);
          }
          // Se já está active, é renovação
          else if (subscription.status === "active" || subscription.status === "expired") {
            const now = new Date();
            subscription.lastPaymentDate = now;
            subscription.startDate = now;
            subscription.endDate = new Date(now);
            subscription.endDate.setDate(subscription.endDate.getDate() + subscription.plan.durationInDays);
            subscription.creditsRemaining = subscription.plan.totalCredits;
            subscription.nextPaymentDate = new Date(now);
            subscription.nextPaymentDate.setMonth(subscription.nextPaymentDate.getMonth() + 1);
            subscription.status = "active";
            await subscription.save();
            console.log(`🔄 Subscription ${subscription._id} renovada`);
          }
        }
      }
    }

    // ========== PROCESSAR SUBSCRIPTION_AUTHORIZED_PAYMENT ==========
    // Este evento geralmente vem junto com o payment, então não precisa processar
    if (notificationType === "subscription_authorized_payment") {
      console.log(`${logPrefix} ℹ️ Evento subscription_authorized_payment recebido (processado junto com payment)`);
    }

    // Outros tipos de evento
    if (!["subscription_preapproval", "payment", "subscription_authorized_payment"].includes(notificationType)) {
      console.log(`${logPrefix} ⚠️ Tipo de notificação não reconhecido: ${notificationType}`);
    }
  } catch (error) {
    console.error(`${logPrefix} ❌ Erro ao processar webhook:`, error.message);
    console.error(`${logPrefix} ❌ Stack:`, error.stack);
  }
});

// POST /api/barbershops/:barbershopId/subscriptions/:subscriptionId/cancel
// Cliente cancela sua assinatura (para de renovar, mas mantém créditos até o fim)
router.post("/:subscriptionId/cancel", protectCustomer, async (req, res) => {
  try {
    const { barbershopId, subscriptionId } = req.params;
    const customer = req.customer;

    const subscription = await Subscription.findById(subscriptionId).populate("plan");

    if (!subscription) {
      return res.status(404).json({ error: "Assinatura não encontrada." });
    }

    // Verificar se a assinatura pertence ao cliente
    if (subscription.customer.toString() !== customer._id.toString()) {
      return res.status(403).json({ error: "Você não tem permissão para cancelar esta assinatura." });
    }

    // Verificar se já está cancelada
    if (!subscription.autoRenew) {
      return res.status(400).json({ error: "Esta assinatura já está com renovação cancelada." });
    }

    // Cancelar no Mercado Pago se tiver preapprovalId
    if (subscription.mercadoPagoPreapprovalId) {
      const barbershop = await Barbershop.findById(barbershopId);

      if (barbershop && barbershop.mercadoPagoAccessToken) {
        try {
          const client = new MercadoPagoConfig({
            accessToken: barbershop.mercadoPagoAccessToken,
          });

          const preapproval = new PreApproval(client);
          await preapproval.update({
            id: subscription.mercadoPagoPreapprovalId,
            body: { status: "cancelled" },
          });

          console.log(`Assinatura ${subscription.mercadoPagoPreapprovalId} cancelada no MP.`);
        } catch (mpError) {
          console.error("Erro ao cancelar no MP:", mpError);
          // Continua mesmo se falhar no MP
        }
      }
    }

    // Atualizar localmente - mantém status active mas para de renovar
    subscription.autoRenew = false;
    await subscription.save();

    res.json({
      message: "Renovação automática cancelada. Seus créditos continuam válidos até o fim do período.",
      subscription: {
        _id: subscription._id,
        status: subscription.status,
        autoRenew: subscription.autoRenew,
        creditsRemaining: subscription.creditsRemaining,
        endDate: subscription.endDate,
      },
    });
  } catch (error) {
    console.error("Erro ao cancelar assinatura:", error);
    res.status(500).json({ error: "Falha ao cancelar assinatura." });
  }
});

// GET /api/barbershops/:barbershopId/subscriptions
// Lista todas as subscriptions da barbearia (para admin)
router.get("/", protectAdmin, async (req, res) => {
  try {
    const { barbershopId } = req.params;

    const subscriptions = await Subscription.find({ barbershop: barbershopId })
      .populate("customer", "name phone")
      .populate("plan", "name price totalCredits durationInDays")
      .sort({ createdAt: -1 });

    res.json(subscriptions);
  } catch (error) {
    console.error("Erro ao listar subscriptions:", error);
    res.status(500).json({ error: "Falha ao listar assinaturas." });
  }
});

// PUT /api/barbershops/:barbershopId/subscriptions/:subscriptionId/activate
// Ativa manualmente uma subscription pendente (para admin)
router.put("/:subscriptionId/activate", protectAdmin, async (req, res) => {
  try {
    const { barbershopId, subscriptionId } = req.params;

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      barbershop: barbershopId,
    }).populate("plan");

    if (!subscription) {
      return res.status(404).json({ error: "Assinatura não encontrada." });
    }

    if (subscription.status === "active") {
      return res.status(400).json({ error: "Assinatura já está ativa." });
    }

    // Ativar a subscription
    const now = new Date();
    subscription.status = "active";
    subscription.lastPaymentDate = now;
    subscription.startDate = now;
    subscription.endDate = new Date(now);
    subscription.endDate.setDate(subscription.endDate.getDate() + subscription.plan.durationInDays);
    subscription.nextPaymentDate = new Date(now);
    subscription.nextPaymentDate.setMonth(subscription.nextPaymentDate.getMonth() + 1);

    await subscription.save();

    res.json({
      message: "Assinatura ativada com sucesso!",
      subscription,
    });
  } catch (error) {
    console.error("Erro ao ativar subscription:", error);
    res.status(500).json({ error: "Falha ao ativar assinatura." });
  }
});

// GET /api/barbershops/:barbershopId/subscriptions/:subscriptionId/webhook-diagnostics
// Diagnóstico de webhook - verifica se MP está configurado para enviar webhooks
router.get("/:subscriptionId/webhook-diagnostics", protectAdmin, async (req, res) => {
  try {
    const { barbershopId, subscriptionId } = req.params;

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      barbershop: barbershopId,
    }).populate("plan").populate("customer", "name phone");

    if (!subscription) {
      return res.status(404).json({ error: "Assinatura não encontrada." });
    }

    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop?.mercadoPagoAccessToken) {
      return res.status(400).json({ error: "Token do MP não configurado." });
    }

    const diagnostics = {
      subscription: {
        _id: subscription._id,
        status: subscription.status,
        mercadoPagoPreapprovalId: subscription.mercadoPagoPreapprovalId,
        customer: subscription.customer,
        plan: subscription.plan,
      },
      webhookConfiguration: {
        expectedUrl: `https://api.barbeariagendamento.com.br/api/barbershops/${barbershopId}/subscriptions/webhook`,
        hasWebhookSecret: !!barbershop.mercadoPagoWebhookSecret,
        tokenType: barbershop.mercadoPagoAccessToken.startsWith("TEST-") ? "TESTE (⚠️ Use produção!)" : "PRODUÇÃO ✅",
      },
      mercadoPagoPreapproval: null,
    };

    // Buscar dados do preapproval no MP
    if (subscription.mercadoPagoPreapprovalId) {
      try {
        const client = new MercadoPagoConfig({
          accessToken: barbershop.mercadoPagoAccessToken,
        });
        const preapproval = new PreApproval(client);
        const preapprovalData = await preapproval.get({ id: subscription.mercadoPagoPreapprovalId });

        diagnostics.mercadoPagoPreapproval = {
          id: preapprovalData.id,
          status: preapprovalData.status,
          notification_url: preapprovalData.notification_url || "❌ NÃO CONFIGURADA!",
          external_reference: preapprovalData.external_reference,
          payer_email: preapprovalData.payer_email,
          date_created: preapprovalData.date_created,
        };
      } catch (mpError) {
        diagnostics.mercadoPagoPreapproval = {
          error: mpError.message || "Erro ao consultar MP",
        };
      }
    }

    res.json(diagnostics);
  } catch (error) {
    console.error("Erro no diagnóstico:", error);
    res.status(500).json({ error: "Falha no diagnóstico." });
  }
});

// GET /api/barbershops/:barbershopId/subscriptions/:subscriptionId/check-status
// Verifica o status da subscription no Mercado Pago (para diagnóstico)
router.get("/:subscriptionId/check-status", protectAdmin, async (req, res) => {
  try {
    const { barbershopId, subscriptionId } = req.params;

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      barbershop: barbershopId,
    }).populate("plan").populate("customer", "name phone");

    if (!subscription) {
      return res.status(404).json({ error: "Assinatura não encontrada." });
    }

    const result = {
      subscription: {
        _id: subscription._id,
        status: subscription.status,
        autoRenew: subscription.autoRenew,
        creditsRemaining: subscription.creditsRemaining,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        mercadoPagoPreapprovalId: subscription.mercadoPagoPreapprovalId,
        customer: subscription.customer,
        plan: subscription.plan,
      },
      mercadoPagoStatus: null,
    };

    // Se tem preapprovalId, verificar no MP
    if (subscription.mercadoPagoPreapprovalId) {
      const barbershop = await Barbershop.findById(barbershopId);

      if (barbershop && barbershop.mercadoPagoAccessToken) {
        try {
          const client = new MercadoPagoConfig({
            accessToken: barbershop.mercadoPagoAccessToken,
          });

          const preapproval = new PreApproval(client);
          const preapprovalData = await preapproval.get({
            id: subscription.mercadoPagoPreapprovalId,
          });

          result.mercadoPagoStatus = {
            id: preapprovalData.id,
            status: preapprovalData.status,
            payer_email: preapprovalData.payer_email,
            date_created: preapprovalData.date_created,
            last_modified: preapprovalData.last_modified,
          };
        } catch (mpError) {
          result.mercadoPagoStatus = {
            error: mpError.message || "Erro ao consultar MP",
          };
        }
      }
    }

    res.json(result);
  } catch (error) {
    console.error("Erro ao verificar status:", error);
    res.status(500).json({ error: "Falha ao verificar status." });
  }
});

// POST /api/barbershops/:barbershopId/subscriptions/setup-webhook
// Retorna instruções de como configurar webhook no Mercado Pago (para admin)
router.post("/setup-webhook", protectAdmin, async (req, res) => {
  try {
    const { barbershopId } = req.params;

    const barbershop = await Barbershop.findById(barbershopId);

    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }

    if (!barbershop.mercadoPagoAccessToken) {
      return res.status(400).json({
        error: "Token do Mercado Pago não configurado. Configure o token antes de criar webhooks.",
      });
    }

    const webhookUrl = `https://api.barbeariagendamento.com.br/api/barbershops/${barbershopId}/subscriptions/webhook`;

    // O Mercado Pago não oferece API pública para criar webhooks programaticamente
    // A configuração deve ser feita através do painel de desenvolvedor
    res.json({
      success: true,
      message: "Instruções para configurar webhook no Mercado Pago",
      instructions: {
        step1: "Acesse o Painel de Aplicações do Mercado Pago",
        step2: "Selecione sua aplicação",
        step3: "No menu lateral, clique em 'Webhooks' > 'Configurar notificações'",
        step4: "Cole a URL abaixo no campo 'URL de produção' (IMPORTANTE: Configure no MODO DE PRODUÇÃO)",
        step5: "Selecione os eventos: Pagamentos, Planos e Assinaturas",
        step6: "Clique em 'Salvar' para gerar a assinatura secreta",
      },
      webhookUrl: webhookUrl,
      events: [
        "Pagamentos",
        "Planos e Assinaturas",
      ],
      note: "Após configurar, os pagamentos e assinaturas criados automaticamente enviarão notificações para esta URL.",
      dashboardLink: "https://www.mercadopago.com.br/developers/panel/app",
    });
  } catch (error) {
    console.error("Erro ao gerar instruções de webhook:", error);
    res.status(500).json({ error: "Falha ao gerar instruções de webhook." });
  }
});

// GET /api/barbershops/:barbershopId/subscriptions/list-webhooks
// Lista webhooks configurados no Mercado Pago (para admin)
router.get("/list-webhooks", protectAdmin, async (req, res) => {
  try {
    const { barbershopId } = req.params;

    const barbershop = await Barbershop.findById(barbershopId);

    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }

    if (!barbershop.mercadoPagoAccessToken) {
      return res.status(400).json({
        error: "Token do Mercado Pago não configurado.",
      });
    }

    const axios = (await import("axios")).default;

    try {
      const response = await axios.get("https://api.mercadopago.com/v1/webhooks", {
        headers: {
          Authorization: `Bearer ${barbershop.mercadoPagoAccessToken}`,
        },
      });

      res.json({
        webhooks: response.data,
        totalWebhooks: response.data.length,
      });
    } catch (mpError) {
      console.error("Erro ao listar webhooks:", mpError.response?.data || mpError.message);
      return res.status(500).json({
        error: "Erro ao listar webhooks do Mercado Pago.",
        details: mpError.response?.data?.message || mpError.message,
      });
    }
  } catch (error) {
    console.error("Erro ao listar webhooks:", error);
    res.status(500).json({ error: "Falha ao listar webhooks." });
  }
});

export default router;
