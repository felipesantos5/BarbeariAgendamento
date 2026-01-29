import express from "express";
import Customer from "../../models/Customer.js";
import Plan from "../../models/Plan.js";
import Booking from "../../models/Booking.js";
import Subscription from "../../models/Subscription.js";
import { protectAdmin, requireRole } from "../../middleware/authAdminMiddleware.js";
import { addDays } from "date-fns";
import mongoose from "mongoose";
import { z } from "zod";

const router = express.Router({ mergeParams: true });
const customerCreationSchema = z.object({
  name: z.string().min(2, "O nome é obrigatório"),
  phone: z.string().regex(/^\d{10,11}$/, "Telefone inválido (apenas 10 ou 11 dígitos)"),
});

// ✅ ROTA DE LISTAGEM (GET /) ATUALIZADA
// Agora é "Customer-centric" (baseada no cliente)
router.get("/", protectAdmin, requireRole("admin", "barber"), async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const barbershopMongoId = new mongoose.Types.ObjectId(barbershopId);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search || "";
    const { subscriptionStatus } = req.query;

    if (!mongoose.Types.ObjectId.isValid(barbershopId)) {
      return res.status(400).json({ error: "ID da barbearia inválido." });
    }

    const pipeline = [
      // 1. Inicia buscando TODOS os clientes
      // (Em vez de buscar bookings)

      // 2. Faz lookup de TODAS as associações do cliente
      { $lookup: { from: "bookings", localField: "_id", foreignField: "customer", as: "allBookings" } },
      { $lookup: { from: "subscriptions", localField: "_id", foreignField: "customer", as: "allSubscriptions" } },

      // 3. Filtra as associações para PERTENCEREM a esta barbearia
      {
        $project: {
          customerDetails: "$$ROOT", // Mantém todos os dados do cliente (name, phone, loyaltyData, etc.)
          // Filtra apenas bookings desta barbearia
          bookingsForShop: {
            $filter: {
              input: "$allBookings",
              as: "booking",
              cond: { $eq: ["$$booking.barbershop", barbershopMongoId] },
            },
          },
          // Filtra apenas subscriptions desta barbearia
          subscriptionsForShop: {
            $filter: {
              input: "$allSubscriptions",
              as: "sub",
              cond: { $eq: ["$$sub.barbershop", barbershopMongoId] },
            },
          },
        },
      },

      // 4. Filtra os Clientes
      // Mantém o cliente na lista se ele tiver:
      // (A) Um booking nesta loja, OU
      // (B) Uma assinatura nesta loja, OU
      // (C) Um registro de fidelidade nesta loja (criado pela rota POST)
      {
        $match: {
          $or: [
            { "customerDetails.loyaltyData.barbershop": barbershopMongoId },
            { bookingsForShop: { $ne: [] } },
            { subscriptionsForShop: { $ne: [] } },
          ],
        },
      },

      // 5. Adiciona o campo 'lastBookingTime' para ordenação
      // (Será 'null' para clientes novos sem agendamento)
      {
        $project: {
          customerDetails: 1,
          lastBookingTime: { $max: "$bookingsForShop.time" },
          // Campo auxiliar para garantir que nulls fiquem no final
          hasBookings: {
            $cond: {
              if: { $gt: [{ $size: "$bookingsForShop" }, 0] },
              then: 1,
              else: 0,
            },
          },
        },
      },
    ];

    // --- Filtro de Busca (Nome/Telefone) ---
    if (searchTerm) {
      const nameSearchRegex = new RegExp(searchTerm, "i");
      const phoneSearchRegex = searchTerm.replace(/\D/g, "");

      pipeline.push({
        $match: {
          $or: [
            { "customerDetails.name": nameSearchRegex },
            ...(phoneSearchRegex.length > 0 ? [{ "customerDetails.phone": { $regex: phoneSearchRegex } }] : []),
          ],
        },
      });
    }

    // --- Filtro de Assinatura ---
    pipeline.push({
      $lookup: {
        from: "subscriptions",
        let: { customerId: "$customerDetails._id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$customer", "$$customerId"] },
              status: "active",
              barbershop: barbershopMongoId,
              endDate: { $gte: new Date() },
            },
          },
          { $limit: 1 },
        ],
        as: "activeSubscriptionsCheck",
      },
    });

    if (subscriptionStatus === "with-plan") {
      pipeline.push({ $match: { activeSubscriptionsCheck: { $ne: [] } } });
    } else if (subscriptionStatus === "without-plan") {
      pipeline.push({ $match: { activeSubscriptionsCheck: { $eq: [] } } });
    }

    // --- Paginação e Projeção Final ---
    pipeline.push(
      // 8. Ordenar: primeiro por hasBookings (clientes com agendamentos no topo),
      //    depois por lastBookingTime (mais recentes primeiro)
      {
        $sort: {
          hasBookings: -1,        // 1 (tem agendamentos) vem antes de 0 (sem agendamentos)
          lastBookingTime: -1     // Dentro de cada grupo, mais recente primeiro
        },
      },
      // 9. Facet
      {
        $facet: {
          metadata: [{ $count: "totalCustomers" }],
          data: [
            { $skip: skip },
            { $limit: limit },
            // Lookup final para popular os dados das assinaturas ativas
            {
              $lookup: {
                from: "subscriptions",
                let: { customerId: "$customerDetails._id" },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$customer", "$$customerId"] },
                      status: "active",
                      barbershop: barbershopMongoId,
                      endDate: { $gte: new Date() },
                    },
                  },
                  { $lookup: { from: "plans", localField: "plan", foreignField: "_id", as: "planDetails" } },
                  { $unwind: { path: "$planDetails", preserveNullAndEmptyArrays: true } },
                ],
                as: "activeSubscriptions",
              },
            },
            // Projeção Final (idêntica à anterior)
            {
              $project: {
                _id: "$customerDetails._id",
                name: "$customerDetails.name",
                phone: "$customerDetails.phone",
                imageUrl: "$customerDetails.imageUrl",
                createdAt: "$customerDetails.createdAt",
                lastBookingTime: "$lastBookingTime",
                loyaltyData: "$customerDetails.loyaltyData",
                subscriptions: {
                  $map: {
                    input: "$activeSubscriptions",
                    as: "sub",
                    in: {
                      _id: "$$sub._id",
                      startDate: "$$sub.startDate",
                      endDate: "$$sub.endDate",
                      status: "$$sub.status",
                      plan: {
                        _id: "$$sub.planDetails._id",
                        name: "$$sub.planDetails.name",
                        totalCredits: { $ifNull: ["$$sub.planDetails.totalCredits", 0] },
                      },
                      creditsRemaining: { $ifNull: ["$$sub.creditsRemaining", 0] },
                      creditsUsed: {
                        $subtract: [{ $ifNull: ["$$sub.planDetails.totalCredits", 0] }, { $ifNull: ["$$sub.creditsRemaining", 0] }],
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      }
    );

    // Executa a pipeline
    const results = await Customer.aggregate(pipeline); // ✅ MUDANÇA: Customer.aggregate

    const customers = results[0]?.data || [];
    const totalCustomers = results[0]?.metadata[0]?.totalCustomers || 0;
    const totalPages = Math.ceil(totalCustomers / limit);

    res.status(200).json({
      customers,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalCustomers: totalCustomers,
        limit: limit,
        searchTerm: searchTerm,
        subscriptionStatus: subscriptionStatus,
      },
    });
  } catch (error) {
    console.error("💥 Erro ao listar clientes:", error);
    res.status(500).json({
      error: "Erro ao listar clientes.",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ✅ ROTA PARA CRIAR UM NOVO CLIENTE (AVULSO)
// POST /api/barbershops/:barbershopId/admin/customers
router.post("/", protectAdmin, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const data = customerCreationSchema.parse(req.body);

    const existingCustomer = await Customer.findOne({ phone: data.phone });
    if (existingCustomer) {
      // Opcional: verificar se ele já está ligado a esta barbearia
      const isAssociated = existingCustomer.loyaltyData.some((entry) => entry.barbershop.equals(barbershopId));
      if (isAssociated) {
        return res.status(409).json({ error: "Este cliente já está cadastrado nesta barbearia." });
      }

      // Se não está associado, apenas adiciona a entrada de fidelidade
      existingCustomer.loyaltyData.push({ barbershop: barbershopId, progress: 0, rewards: 0 });
      await existingCustomer.save();
      return res.status(200).json(existingCustomer);
    }

    // Se não existe, cria um novo
    const loyaltyEntry = {
      barbershop: barbershopId,
      progress: 0,
      rewards: 0,
    };

    const newCustomer = await Customer.create({
      name: data.name,
      phone: data.phone,
      imageUrl: data.imageUrl,
      loyaltyData: [loyaltyEntry],
      subscriptions: [],
      bookings: [],
    });

    res.status(201).json(newCustomer);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: "Dados inválidos.", details: e.errors });
    }
    console.error("Erro ao criar cliente:", e);
    res.status(500).json({ error: "Erro interno ao criar cliente." });
  }
});

// --- O RESTANTE DAS ROTAS (GET /:id, POST /:id/subscribe, GET /:id/bookings) ---
// (O código existente continua aqui, sem alterações)

// GET /:customerId
router.get("/:customerId", protectAdmin, requireRole("admin", "barber"), async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ error: "ID do cliente inválido." });
    }

    const customer = await Customer.findById(customerId).populate({
      path: "subscriptions",
      match: { status: "active", endDate: { $gte: new Date() } },
      populate: {
        path: "plan",
        select: "name description price durationInDays",
      },
    });

    if (!customer) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    res.status(200).json(customer);
  } catch (error) {
    console.error("Erro ao buscar cliente:", error);
    if (error.name === "CastError") {
      return res.status(400).json({ error: "ID do cliente inválido." });
    }
    res.status(500).json({ error: "Erro ao buscar cliente." });
  }
});

// POST /:customerId/subscribe
router.post("/:customerId/subscribe", protectAdmin, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId, customerId } = req.params;
    const { planId, barberId } = req.body; // barberId (vendedor)

    if (!mongoose.Types.ObjectId.isValid(customerId) || !mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({ error: "ID do cliente ou plano inválido." });
    }
    if (barberId && !mongoose.Types.ObjectId.isValid(barberId)) {
      return res.status(400).json({ error: "ID do barbeiro (vendedor) inválido." });
    }

    const [customer, plan] = await Promise.all([Customer.findById(customerId), Plan.findById(planId)]);

    if (!customer || !plan) {
      return res.status(404).json({ error: "Cliente ou plano não encontrado." });
    }
    if (plan.barbershop.toString() !== barbershopId) {
      return res.status(400).json({ error: "Este plano não pertence a esta barbearia." });
    }

    if (!plan.durationInDays || typeof plan.durationInDays !== "number" || plan.durationInDays <= 0) {
      return res.status(400).json({
        error: `O plano "${plan.name}" não possui uma duração válida definida.`,
      });
    }

    if (!plan.totalCredits || typeof plan.totalCredits !== "number" || plan.totalCredits <= 0) {
      return res.status(400).json({
        error: `O plano "${plan.name}" não possui um número de créditos válido.`,
      });
    }

    const startDate = new Date();
    const endDate = addDays(startDate, plan.durationInDays);

    if (isNaN(endDate.getTime())) {
      console.error("endDate resultou em Data Inválida. startDate:", startDate, "durationInDays:", plan.durationInDays);
      return res.status(500).json({ error: "Falha ao calcular a data final da assinatura." });
    }

    const existingActiveSubscriptionForPlan = await Subscription.findOne({
      customer: customerId,
      plan: planId,
      barbershop: barbershopId,
      status: "active",
      endDate: { $gte: new Date() },
    });
    if (existingActiveSubscriptionForPlan) {
      return res.status(409).json({
        error: `O cliente já possui uma assinatura ativa para o plano "${plan.name}".`,
      });
    }

    const newSubscription = await Subscription.create({
      customer: customerId,
      plan: planId,
      barbershop: barbershopId,
      barber: barberId || null, // Salva o vendedor
      startDate,
      endDate,
      status: "active",
      creditsRemaining: plan.totalCredits,
    });

    customer.subscriptions.push(newSubscription._id);
    await customer.save();

    const populatedSubscription = await Subscription.findById(newSubscription._id)
      .populate("plan", "name price durationInDays totalCredits")
      .populate("customer", "name phone");

    res.status(201).json(populatedSubscription || newSubscription);
  } catch (error) {
    console.error("Erro ao inscrever cliente no plano:", error);
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: "Dados inválidos para a assinatura.", details: error.errors });
    }
    res.status(500).json({ error: "Falha ao atrelar o plano." });
  }
});

// GET /:customerId/bookings
router.get("/:customerId/bookings", protectAdmin, requireRole("admin", "barber"), async (req, res) => {
  try {
    const { barbershopId, customerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ error: "ID do cliente inválido." });
    }

    const bookings = await Booking.find({
      customer: customerId,
      barbershop: barbershopId,
    })
      .sort({ time: -1 })
      .populate("service", "name price duration")
      .populate("barber", "name image")
      .populate("barbershop", "name");

    res.status(200).json(bookings);
  } catch (error) {
    console.error("Erro ao buscar agendamentos do cliente:", error);
    res.status(500).json({ error: "Erro ao buscar agendamentos do cliente." });
  }
});

// DELETE /:customerId/subscriptions/:subscriptionId
// Remove/Cancela uma assinatura de um cliente
router.delete("/:customerId/subscriptions/:subscriptionId", protectAdmin, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId, customerId, subscriptionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(customerId) || !mongoose.Types.ObjectId.isValid(subscriptionId)) {
      return res.status(400).json({ error: "ID do cliente ou assinatura inválido." });
    }

    // Busca a assinatura
    const subscription = await Subscription.findById(subscriptionId);

    if (!subscription) {
      return res.status(404).json({ error: "Assinatura não encontrada." });
    }

    // Valida se a assinatura pertence a esta barbearia
    if (subscription.barbershop.toString() !== barbershopId) {
      return res.status(403).json({ error: "Esta assinatura não pertence a esta barbearia." });
    }

    // Valida se a assinatura pertence ao cliente
    if (subscription.customer.toString() !== customerId) {
      return res.status(403).json({ error: "Esta assinatura não pertence a este cliente." });
    }

    // Cancela a assinatura (marca como canceled ao invés de deletar)
    subscription.status = "canceled";
    await subscription.save();

    // Remove a referência da assinatura no array do customer
    await Customer.findByIdAndUpdate(customerId, {
      $pull: { subscriptions: subscriptionId },
    });

    res.status(200).json({
      success: true,
      message: "Assinatura cancelada com sucesso.",
      subscription,
    });
  } catch (error) {
    console.error("Erro ao cancelar assinatura:", error);
    res.status(500).json({ error: "Erro ao cancelar assinatura." });
  }
});

// GET /:customerId/plan-history
// Retorna histórico de TODOS os planos do cliente (ativos, expirados, cancelados)
// com a contagem de agendamentos realizados em cada um
router.get("/:customerId/plan-history", protectAdmin, requireRole("admin", "barber"), async (req, res) => {
  try {
    const { barbershopId, customerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ error: "ID do cliente inválido." });
    }

    // Busca TODAS as subscriptions do cliente para esta barbearia
    const subscriptions = await Subscription.find({
      customer: customerId,
      barbershop: barbershopId,
    })
      .populate("plan", "name totalCredits durationInDays price")
      .populate("barber", "name")
      .sort({ createdAt: -1 }); // Mais recentes primeiro

    // Para cada subscription, contar quantos bookings foram feitos
    const historyWithBookings = await Promise.all(
      subscriptions.map(async (subscription) => {
        // Conta bookings que usaram esta subscription
        const bookingsCount = await Booking.countDocuments({
          subscriptionUsed: subscription._id,
          barbershop: barbershopId,
        });

        // Busca os bookings completos para detalhamento
        const bookings = await Booking.find({
          subscriptionUsed: subscription._id,
          barbershop: barbershopId,
        })
          .select("time status service")
          .populate("service", "name")
          .sort({ time: -1 });

        return {
          _id: subscription._id,
          plan: subscription.plan,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          status: subscription.status,
          creditsRemaining: subscription.creditsRemaining,
          totalCredits: subscription.plan?.totalCredits || 0,
          creditsUsed: (subscription.plan?.totalCredits || 0) - subscription.creditsRemaining,
          barber: subscription.barber, // Quem vendeu
          bookingsCount,
          bookings,
          createdAt: subscription.createdAt,
          autoRenew: subscription.autoRenew,
          mercadoPagoPreapprovalId: subscription.mercadoPagoPreapprovalId,
        };
      })
    );

    res.status(200).json({
      customerId,
      totalSubscriptions: historyWithBookings.length,
      subscriptions: historyWithBookings,
    });
  } catch (error) {
    console.error("Erro ao buscar histórico de planos:", error);
    res.status(500).json({ error: "Erro ao buscar histórico de planos." });
  }
});

export default router;
