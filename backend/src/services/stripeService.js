import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export { stripe };

// Cria conta Stripe Connect Express para uma barbearia
export async function createConnectedAccount(barbershopName, email) {
  return stripe.accounts.create({
    type: "express",
    country: "BR",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      name: barbershopName,
      mcc: "7297", // Barber shops
    },
  });
}

// Gera link de onboarding para configurar conta conectada
export async function createOnboardingLink(stripeAccountId) {
  const adminUrl = process.env.ADMIN_URL || "https://admin.barbeariagendamento.com.br";
  return stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${adminUrl}/configuracoes/pagamentos?refresh=true`,
    return_url: `${adminUrl}/configuracoes/pagamentos?onboarding=true`,
    type: "account_onboarding",
  });
}

// Cria Checkout Session para pagamento avulso de agendamento
export async function createBookingCheckoutSession({ barbershop, booking, service, customer }) {
  const frontUrl = process.env.FRONT_URL || "https://barbeariagendamento.com.br";

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "brl",
          product_data: {
            name: `Agendamento: ${service.name}`,
            description: "Serviço de barbearia",
          },
          unit_amount: Math.round(service.price * 100),
        },
        quantity: 1,
      },
    ],
    customer_email: customer.email || undefined,
    payment_intent_data: {
      transfer_data: {
        destination: barbershop.stripeAccountId,
      },
      metadata: {
        bookingId: booking._id.toString(),
        barbershopId: barbershop._id.toString(),
        type: "booking",
      },
    },
    metadata: {
      bookingId: booking._id.toString(),
      barbershopId: barbershop._id.toString(),
      type: "booking",
    },
    success_url: `${frontUrl}/${barbershop.slug}/pagamento-sucesso?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontUrl}/${barbershop.slug}`,
  });
}

// Cria Checkout Session para assinatura de plano da barbearia
export async function createPlanSubscriptionCheckout({ barbershop, plan, customer, customerEmail }) {
  const frontUrl = process.env.FRONT_URL || "https://barbeariagendamento.com.br";
  const platformFeePercent = Number(process.env.STRIPE_PLATFORM_FEE_PERCENT) || 10;

  return stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "brl",
          product_data: {
            name: `Plano ${plan.name} - ${barbershop.name}`,
          },
          unit_amount: Math.round(plan.price * 100),
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    customer_email: customerEmail,
    subscription_data: {
      application_fee_percent: platformFeePercent,
      transfer_data: {
        destination: barbershop.stripeAccountId,
      },
      metadata: {
        customerId: customer._id.toString(),
        planId: plan._id.toString(),
        barbershopId: barbershop._id.toString(),
        type: "plan_subscription",
      },
    },
    metadata: {
      customerId: customer._id.toString(),
      planId: plan._id.toString(),
      barbershopId: barbershop._id.toString(),
      type: "plan_subscription",
    },
    success_url: `${frontUrl}/${barbershop.slug}/assinatura-sucesso?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontUrl}/${barbershop.slug}`,
  });
}

// Cria Checkout Session para assinatura SaaS (conta da plataforma)
export async function createSaasCheckoutSession({ barbershopName, email, contact }) {
  const adminUrl = process.env.ADMIN_URL || "https://admin.barbeariagendamento.com.br";
  const priceId = process.env.SAAS_STRIPE_PRICE_ID;

  if (!priceId) throw new Error("SAAS_STRIPE_PRICE_ID não configurado no ambiente.");

  return stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: email.toLowerCase(),
    subscription_data: {
      metadata: {
        barbershopName,
        email: email.toLowerCase(),
        contact: contact || "",
        type: "saas",
      },
    },
    metadata: {
      barbershopName,
      email: email.toLowerCase(),
      contact: contact || "",
      type: "saas",
    },
    success_url: `${adminUrl}/login?primeiro-acesso=true`,
    cancel_url: `${adminUrl}/cadastro`,
  });
}

// Para de renovar a assinatura ao final do período atual
export async function cancelSubscriptionAtPeriodEnd(stripeSubscriptionId) {
  return stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
}

// Cria estorno total de um PaymentIntent
export async function createRefund(paymentIntentId) {
  return stripe.refunds.create({ payment_intent: paymentIntentId });
}
