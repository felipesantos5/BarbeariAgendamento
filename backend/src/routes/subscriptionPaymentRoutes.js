import express from "express";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import Barbershop from "../models/Barbershop.js";
import Customer from "../models/Customer.js";
import { protectCustomer } from "../middleware/authCustomerMiddleware.js";
import { protectAdmin } from "../middleware/authAdminMiddleware.js";
import { createPlanSubscriptionCheckout, cancelSubscriptionAtPeriodEnd } from "../services/stripeService.js";

const router = express.Router({ mergeParams: true });

// POST /api/barbershops/:barbershopId/subscriptions/create-checkout
// Cria Checkout Session do Stripe para assinatura de plano
router.post("/create-checkout", protectCustomer, async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { planId, email } = req.body;
    const customer = req.customer;

    if (!planId) {
      return res.status(400).json({ error: "O ID do plano é obrigatório." });
    }

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

    if (!barbershop.paymentsEnabled || !barbershop.stripeAccountId || !barbershop.stripeOnboardingComplete) {
      return res.status(400).json({
        error: "Pagamento online não está configurado para esta barbearia.",
      });
    }

    const existing = await Subscription.findOne({
      customer: customer._id,
      plan: planId,
      barbershop: barbershopId,
      status: "active",
    });

    if (existing) {
      return res.status(400).json({ error: "Você já possui uma assinatura ativa para este plano." });
    }

    const emailFromBody = email?.trim();
    const customerEmail = customer.email || emailFromBody;

    if (!customerEmail) {
      return res.status(400).json({ error: "O e-mail é obrigatório para criar uma assinatura." });
    }

    // Atualiza email se veio diferente no body
    if (emailFromBody && customer.email !== emailFromBody) {
      await Customer.findByIdAndUpdate(customer._id, { email: emailFromBody });
    }

    const session = await createPlanSubscriptionCheckout({
      barbershop,
      plan,
      customer,
      customerEmail: customerEmail.trim().toLowerCase(),
    });

    res.json({ checkout_url: session.url });
  } catch (error) {
    console.error("Erro ao criar checkout de assinatura:", error);
    res.status(500).json({
      error: "Falha ao criar sessão de pagamento.",
      details: error.message,
    });
  }
});

// POST /api/barbershops/:barbershopId/subscriptions/:subscriptionId/cancel
// Cliente cancela renovação automática (mantém créditos até o fim do período)
router.post("/:subscriptionId/cancel", protectCustomer, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const customer = req.customer;

    const subscription = await Subscription.findById(subscriptionId).populate("plan");

    if (!subscription) {
      return res.status(404).json({ error: "Assinatura não encontrada." });
    }

    if (subscription.customer.toString() !== customer._id.toString()) {
      return res.status(403).json({ error: "Você não tem permissão para cancelar esta assinatura." });
    }

    if (!subscription.autoRenew) {
      return res.status(400).json({ error: "Esta assinatura já está com renovação cancelada." });
    }

    // Cancela no Stripe ao final do período
    if (subscription.stripeSubscriptionId) {
      try {
        await cancelSubscriptionAtPeriodEnd(subscription.stripeSubscriptionId);
        console.log(`[Subscription] Stripe subscription ${subscription.stripeSubscriptionId} marcada para cancelar.`);
      } catch (stripeError) {
        console.error("[Subscription] Erro ao cancelar no Stripe:", stripeError.message);
        // Continua mesmo se falhar no Stripe
      }
    }

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
// Lista todas as subscriptions da barbearia (admin)
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
// Ativa manualmente uma subscription pendente (admin)
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

    const now = new Date();
    subscription.status = "active";
    subscription.lastPaymentDate = now;
    subscription.startDate = now;
    subscription.endDate = new Date(now);
    subscription.endDate.setDate(subscription.endDate.getDate() + subscription.plan.durationInDays);
    subscription.nextPaymentDate = new Date(now);
    subscription.nextPaymentDate.setMonth(subscription.nextPaymentDate.getMonth() + 1);

    await subscription.save();

    res.json({ message: "Assinatura ativada com sucesso!", subscription });
  } catch (error) {
    console.error("Erro ao ativar subscription:", error);
    res.status(500).json({ error: "Falha ao ativar assinatura." });
  }
});

export default router;
