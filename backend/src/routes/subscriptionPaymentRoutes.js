import express from "express";
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import Barbershop from "../models/Barbershop.js";
import Customer from "../models/Customer.js";
import { protectCustomer } from "../middleware/authCustomerMiddleware.js";
import { protectAdmin } from "../middleware/authAdminMiddleware.js";

const router = express.Router({ mergeParams: true });

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

    // Criar preapproval no Mercado Pago
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
        notification_url: `https://api.barbeariagendamento.com.br/api/barbershops/${barbershopId}/subscriptions/webhook?barbershopId=${barbershopId}`,
      },
    };

    const result = await preapproval.create(preapprovalData);

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

// POST /api/barbershops/:barbershopId/subscriptions/webhook
// Recebe notificações do Mercado Pago sobre assinaturas
router.post("/webhook", async (req, res) => {
  const notification = req.body;
  const { barbershopId } = req.query;

  console.log("🔔 ========== WEBHOOK DE ASSINATURA ==========");
  console.log("🔔 Body completo:", JSON.stringify(notification, null, 2));
  console.log("🔔 Query params:", req.query);
  console.log("🔔 Type:", notification.type);
  console.log("🔔 Action:", notification.action);
  console.log("🔔 Data ID:", notification.data?.id);

  // Responder 200 imediatamente para o MP não reenviar
  res.sendStatus(200);

  try {
    // Tipos de notificação do MP para subscriptions:
    // - subscription_preapproval (criação/atualização)
    // - subscription_authorized_payment (pagamento autorizado)
    // - payment (pagamento processado)
    // - updated (atualização genérica - usado pelo MP em alguns casos)

    const notificationType = notification.type;
    const dataId = notification.data?.id;

    if (!dataId) {
      console.log("⚠️ Webhook: Sem data.id, ignorando.");
      return;
    }

    if (!barbershopId) {
      console.error("❌ Webhook: barbershopId não fornecido na query.");
      return;
    }

    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop || !barbershop.mercadoPagoAccessToken) {
      console.error(`❌ Webhook: Barbearia ${barbershopId} não encontrada ou sem token.`);
      return;
    }

    const client = new MercadoPagoConfig({
      accessToken: barbershop.mercadoPagoAccessToken,
    });

    // ========== PROCESSAR SUBSCRIPTION_PREAPPROVAL ==========
    if (notificationType === "subscription_preapproval") {
      console.log(`📋 Processando subscription_preapproval ID: ${dataId}`);

      const preapproval = new PreApproval(client);
      const preapprovalData = await preapproval.get({ id: dataId });

      console.log(`📋 Preapproval Status: ${preapprovalData.status}`);
      console.log(`📋 Preapproval external_reference: ${preapprovalData.external_reference}`);

      // Tentar encontrar subscription pelo mercadoPagoPreapprovalId
      let subscription = await Subscription.findOne({
        mercadoPagoPreapprovalId: dataId,
      }).populate("plan");

      // Se não encontrou pelo ID, tentar pelo external_reference
      if (!subscription && preapprovalData.external_reference) {
        try {
          const refData = JSON.parse(preapprovalData.external_reference);
          subscription = await Subscription.findById(refData.subscriptionId).populate("plan");

          // Salvar o mercadoPagoPreapprovalId se não tinha
          if (subscription && !subscription.mercadoPagoPreapprovalId) {
            subscription.mercadoPagoPreapprovalId = dataId;
          }
        } catch (parseError) {
          console.error("❌ Erro ao parsear external_reference:", parseError);
        }
      }

      if (!subscription) {
        console.error(`❌ Subscription não encontrada para preapproval ${dataId}`);
        return;
      }

      console.log(`📋 Subscription encontrada: ${subscription._id}, status atual: ${subscription.status}`);

      // Atualizar baseado no status do preapproval
      if (preapprovalData.status === "authorized" || preapprovalData.status === "pending") {
        // "authorized" = cliente autorizou o pagamento recorrente
        // "pending" com primeiro pagamento pode significar que está ativo
        if (subscription.status === "pending") {
          subscription.status = "active";
          subscription.lastPaymentDate = new Date();
          subscription.nextPaymentDate = new Date();
          subscription.nextPaymentDate.setMonth(subscription.nextPaymentDate.getMonth() + 1);
          await subscription.save();
          console.log(`✅ Subscription ${subscription._id} ATIVADA! Créditos: ${subscription.creditsRemaining}`);
        }
      } else if (preapprovalData.status === "paused") {
        subscription.autoRenew = false;
        await subscription.save();
        console.log(`⏸️ Subscription ${subscription._id} pausada.`);
      } else if (preapprovalData.status === "cancelled") {
        subscription.autoRenew = false;
        await subscription.save();
        console.log(`🚫 Subscription ${subscription._id} cancelada no MP.`);
      }
    }

    // ========== PROCESSAR PAYMENT ==========
    if (notificationType === "payment") {
      console.log(`💰 Processando payment ID: ${dataId}`);

      const { Payment } = await import("mercadopago");
      const payment = new Payment(client);
      const paymentData = await payment.get({ id: dataId });

      console.log(`💰 Payment status: ${paymentData.status}`);
      console.log(`💰 Payment preapproval_id: ${paymentData.preapproval_id}`);

      if (paymentData.status === "approved" && paymentData.preapproval_id) {
        const subscription = await Subscription.findOne({
          mercadoPagoPreapprovalId: paymentData.preapproval_id,
        }).populate("plan");

        if (subscription) {
          console.log(`💰 Subscription encontrada: ${subscription._id}`);

          // Se está pending, é o primeiro pagamento - ativar
          if (subscription.status === "pending") {
            subscription.status = "active";
            subscription.lastPaymentDate = new Date();
            subscription.nextPaymentDate = new Date();
            subscription.nextPaymentDate.setMonth(subscription.nextPaymentDate.getMonth() + 1);
            await subscription.save();
            console.log(`✅ Subscription ${subscription._id} ATIVADA pelo pagamento!`);
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
            console.log(`🔄 Subscription ${subscription._id} RENOVADA! Créditos: ${subscription.creditsRemaining}`);
          }
        } else {
          console.error(`❌ Subscription não encontrada para preapproval_id: ${paymentData.preapproval_id}`);
        }
      }
    }

    // ========== PROCESSAR SUBSCRIPTION_AUTHORIZED_PAYMENT ==========
    if (notificationType === "subscription_authorized_payment") {
      console.log(`💳 Processando subscription_authorized_payment ID: ${dataId}`);
      // Este evento indica que um pagamento da assinatura foi autorizado
      // Geralmente vem junto com o payment, então já processamos acima
    }

    console.log("🔔 ========== FIM DO WEBHOOK ==========");
  } catch (error) {
    console.error("❌ Erro ao processar webhook de assinatura:", error);
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
// Configura webhook automaticamente no Mercado Pago (para admin)
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

    const webhookUrl = `https://api.barbeariagendamento.com.br/api/barbershops/${barbershopId}/subscriptions/webhook?barbershopId=${barbershopId}`;

    // Fazer requisição para a API do Mercado Pago
    const axios = (await import("axios")).default;

    try {
      // Criar webhook para assinaturas
      const response = await axios.post(
        "https://api.mercadopago.com/v1/webhooks",
        {
          url: webhookUrl,
          events: [
            { topic: "payment" },
            { topic: "subscription_preapproval" },
            { topic: "subscription_authorized_payment" },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${barbershop.mercadoPagoAccessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      res.json({
        success: true,
        message: "Webhook configurado com sucesso no Mercado Pago!",
        webhook: {
          id: response.data.id,
          url: webhookUrl,
          events: response.data.events,
        },
      });
    } catch (mpError) {
      console.error("Erro ao criar webhook no MP:", mpError.response?.data || mpError.message);

      // Se já existe um webhook com essa URL
      if (mpError.response?.status === 400 && mpError.response?.data?.message?.includes("already exists")) {
        return res.status(200).json({
          success: true,
          message: "Webhook já está configurado no Mercado Pago.",
          alreadyExists: true,
        });
      }

      return res.status(500).json({
        error: "Erro ao configurar webhook no Mercado Pago.",
        details: mpError.response?.data?.message || mpError.message,
      });
    }
  } catch (error) {
    console.error("Erro ao configurar webhook:", error);
    res.status(500).json({ error: "Falha ao configurar webhook." });
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
