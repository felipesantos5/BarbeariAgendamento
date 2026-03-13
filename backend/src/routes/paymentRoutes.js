import express from "express";
import Booking from "../models/Booking.js";
import Barbershop from "../models/Barbershop.js";
import { protectAdmin } from "../middleware/authAdminMiddleware.js";
import { createBookingCheckoutSession, createConnectedAccount, createOnboardingLink } from "../services/stripeService.js";

const router = express.Router({ mergeParams: true });

// ROTA: POST /api/barbershops/:barbershopId/bookings/:bookingId/create-payment
// Cria link de pagamento para um agendamento existente (pagamento não obrigatório)
router.post("/:bookingId/create-payment", async (req, res) => {
  try {
    const { barbershopId, bookingId } = req.params;

    const [barbershop, booking] = await Promise.all([
      Barbershop.findById(barbershopId),
      Booking.findById(bookingId).populate("service").populate("customer"),
    ]);

    if (!booking || !barbershop) {
      return res.status(404).json({ error: "Agendamento ou barbearia não encontrado(a)." });
    }

    if (!barbershop.paymentsEnabled || !barbershop.stripeAccountId || !barbershop.stripeOnboardingComplete) {
      return res.status(400).json({
        error: "Pagamento online não está configurado para esta barbearia.",
      });
    }

    if (!booking.service || typeof booking.service.price !== "number" || booking.service.price <= 0) {
      return res.status(400).json({ error: "Serviço ou preço inválido para este agendamento." });
    }

    const session = await createBookingCheckoutSession({
      barbershop,
      booking,
      service: booking.service,
      customer: booking.customer,
    });

    booking.paymentId = session.id;
    await booking.save();

    res.json({ payment_url: session.url });
  } catch (error) {
    console.error("Erro ao criar pagamento:", error);
    res.status(500).json({
      error: "Falha ao gerar link de pagamento.",
      details: error.message,
    });
  }
});

// ROTA: POST /api/barbershops/:barbershopId/bookings/stripe-onboarding
// Cria uma conta Stripe Connect Express para a barbearia e retorna link de onboarding
router.post("/stripe-onboarding", protectAdmin, async (req, res) => {
  try {
    const { barbershopId } = req.params;

    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }

    // Se já tem conta, apenas gera novo link de onboarding
    if (barbershop.stripeAccountId) {
      const link = await createOnboardingLink(barbershop.stripeAccountId);
      return res.json({ onboarding_url: link.url, stripeAccountId: barbershop.stripeAccountId });
    }

    // Cria nova conta conectada
    const account = await createConnectedAccount(
      barbershop.name,
      req.adminUser?.email || `barbearia_${barbershopId}@barbeariagendamento.com.br`
    );

    barbershop.stripeAccountId = account.id;
    barbershop.stripeOnboardingComplete = false;
    await barbershop.save();

    const link = await createOnboardingLink(account.id);

    res.json({ onboarding_url: link.url, stripeAccountId: account.id });
  } catch (error) {
    console.error("Erro ao criar conta Stripe:", error);
    res.status(500).json({ error: "Falha ao iniciar onboarding do Stripe.", details: error.message });
  }
});

export default router;
