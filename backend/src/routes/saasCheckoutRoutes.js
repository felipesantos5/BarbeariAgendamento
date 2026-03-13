import express from "express";
import AdminUser from "../models/AdminUser.js";
import { createSaasCheckoutSession } from "../services/stripeService.js";

const router = express.Router();

/**
 * POST /api/saas/checkout
 * Cria Checkout Session do Stripe para assinatura SaaS da plataforma
 */
router.post("/checkout", async (req, res) => {
  try {
    const { barbershopName, email, contact } = req.body;

    if (!barbershopName || !email) {
      return res.status(400).json({ error: "Nome da barbearia e email são obrigatórios." });
    }

    if (!process.env.SAAS_STRIPE_PRICE_ID) {
      return res.status(500).json({ error: "Configuração de pagamento SaaS não disponível." });
    }

    const existingAdmin = await AdminUser.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(409).json({ error: "Este email já está cadastrado no sistema." });
    }

    const session = await createSaasCheckoutSession({
      barbershopName,
      email,
      contact: contact || "",
    });

    console.log(`[SaaS] Checkout Session criada: ${session.id} para ${email}`);

    res.json({ checkout_url: session.url });
  } catch (error) {
    console.error("[SaaS] Erro ao criar checkout:", error);
    res.status(500).json({
      error: "Erro ao criar sessão de pagamento.",
      message: error.message,
    });
  }
});

export default router;
