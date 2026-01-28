import express from "express";
import mongoose from "mongoose";
import { protectAdmin } from "../../middleware/authAdminMiddleware.js";
import Booking from "../../models/Booking.js";
import Subscription from "../../models/Subscription.js";
import { startOfMonth, endOfMonth, parseISO } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import StockMovement from "../../models/StockMovement.js";

const router = express.Router({ mergeParams: true });

const BRAZIL_TZ = "America/Sao_Paulo";

router.use(protectAdmin);

router.get("/", async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const barberId = req.adminUser?.barberProfileId;

    if (!barberId) {
      return res.status(403).json({
        error: "Usuário não tem um perfil de barbeiro associado.",
      });
    }

    const barberMongoId = new mongoose.Types.ObjectId(barberId);
    const barbershopMongoId = new mongoose.Types.ObjectId(barbershopId);

    // 2. DEFINIR O PERÍODO DE TEMPO (igual)
    let { startDate: startDateQuery, endDate: endDateQuery } = req.query;
    let startDate, endDate;
    const nowInBrazil = toZonedTime(new Date(), BRAZIL_TZ);

    if (startDateQuery) {
      startDate = fromZonedTime(startOfMonth(parseISO(startDateQuery)), BRAZIL_TZ);
    } else {
      startDate = fromZonedTime(startOfMonth(nowInBrazil), BRAZIL_TZ);
    }

    if (endDateQuery) {
      endDate = fromZonedTime(endOfMonth(parseISO(endDateQuery)), BRAZIL_TZ);
    } else {
      endDate = fromZonedTime(endOfMonth(nowInBrazil), BRAZIL_TZ);
    }

    // --- 3. PIPELINE DE SERVIÇOS (BOOKINGS) ---
    const servicePipeline = [
      {
        $match: {
          barbershop: barbershopMongoId,
          barber: barberMongoId,
          status: "completed",
          time: { $gte: startDate, $lte: endDate },
        },
      },
      // ... (lookups de service, barber, customer)
      { $lookup: { from: "services", localField: "service", foreignField: "_id", as: "serviceDetails" } },
      { $lookup: { from: "barbers", localField: "barber", foreignField: "_id", as: "barberDetails" } },
      { $lookup: { from: "customers", localField: "customer", foreignField: "_id", as: "customerDetails" } },
      { $unwind: "$serviceDetails" },
      { $unwind: "$barberDetails" },
      { $unwind: "$customerDetails" },
      {
        $facet: {
          geral: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$serviceDetails.price" },
                totalBookings: { $sum: 1 },
                serviceCommissionRate: { $first: "$barberDetails.commission" }, // ✅ Renomeado
                uniqueCustomers: { $addToSet: "$customerDetails._id" },
              },
            },
            {
              $project: {
                _id: 0,
                totalRevenue: 1,
                totalBookings: 1,
                serviceCommissionRate: 1,
                totalServiceCommission: {
                  $multiply: ["$totalRevenue", { $divide: ["$serviceCommissionRate", 100] }],
                },
                // ❌ averageTicket REMOVIDO
                totalUniqueCustomers: { $size: "$uniqueCustomers" },
              },
            },
          ],
          // ... (facet 'servicosExecutados' continua o mesmo)
          servicosExecutados: [
            {
              $group: {
                _id: "$serviceDetails._id",
                serviceName: { $first: "$serviceDetails.name" },
                count: { $sum: 1 },
                revenueFromService: { $sum: "$serviceDetails.price" },
              },
            },
            { $sort: { revenueFromService: -1 } },
            {
              $project: {
                _id: 0,
                serviceId: "$_id",
                serviceName: 1,
                count: 1,
                revenueFromService: 1,
              },
            },
          ],
        },
      },
    ];

    // --- 4. PIPELINE DE PRODUTOS (STOCKMOVEMENTS) ---
    // (Esta pipeline continua a mesma da etapa anterior)
    const productPipeline = [
      {
        $match: {
          barbershop: barbershopMongoId,
          barber: barberMongoId,
          type: "venda",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "productInfo" } },
      { $unwind: "$productInfo" },
      {
        $project: {
          saleRevenue: { $multiply: ["$quantity", "$productInfo.price.sale"] },
          commissionAmount: {
            $multiply: [{ $multiply: ["$quantity", "$productInfo.price.sale"] }, { $divide: [{ $ifNull: ["$productInfo.commissionRate", 0] }, 100] }],
          },
          quantity: 1,
        },
      },
      {
        $group: {
          _id: null,
          totalProductRevenue: { $sum: "$saleRevenue" },
          totalProductCommission: { $sum: "$commissionAmount" },
          totalProductsSold: { $sum: "$quantity" },
        },
      },
      { $project: { _id: 0 } },
    ];

    // --- 5. ✅ NOVA PIPELINE DE PLANOS (SUBSCRIPTIONS) ---
    const planPipeline = [
      {
        $match: {
          barbershop: barbershopMongoId,
          barber: barberMongoId, // Apenas planos vendidos por este barbeiro
          createdAt: { $gte: startDate, $lte: endDate }, // Vendidos neste período
        },
      },
      { $lookup: { from: "plans", localField: "plan", foreignField: "_id", as: "planInfo" } },
      { $lookup: { from: "barbers", localField: "barber", foreignField: "_id", as: "barberInfo" } },
      { $unwind: "$planInfo" },
      { $unwind: "$barberInfo" },
      {
        // Pré-calcula receita e comissão por plano vendido
        $project: {
          planRevenue: "$planInfo.price",
          // ✅ Se useBarberCommission = true, usa comissão do barbeiro
          // ✅ Senão, usa commissionRate do plano (pode ser 0)
          commissionAmount: {
            $multiply: [
              "$planInfo.price",
              {
                $divide: [
                  {
                    $cond: {
                      if: { $eq: ["$planInfo.useBarberCommission", true] },
                      then: { $ifNull: ["$barberInfo.commission", 0] },
                      else: { $ifNull: ["$planInfo.commissionRate", 0] },
                    },
                  },
                  100,
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalPlanRevenue: { $sum: "$planRevenue" },
          totalPlanCommission: { $sum: "$commissionAmount" },
          totalPlansSold: { $sum: 1 },
        },
      },
      { $project: { _id: 0 } },
    ];

    // 6. EXECUTAR AGREGAÇÕES EM PARALELO
    const [serviceResult, productResult, planResult] = await Promise.all([
      Booking.aggregate(servicePipeline),
      StockMovement.aggregate(productPipeline),
      Subscription.aggregate(planPipeline), // ✅ Adiciona a terceira
    ]);

    // 7. FORMATAR A RESPOSTA
    const serviceMetrics = serviceResult[0];

    const serviceOverview = serviceMetrics.geral[0] || {
      totalRevenue: 0,
      totalBookings: 0,
      serviceCommissionRate: (await mongoose.model("Barber").findById(barberMongoId).select("commission").lean())?.commission || 0,
      totalServiceCommission: 0,
      totalUniqueCustomers: 0,
    };

    const productOverview = productResult[0] || {
      totalProductRevenue: 0,
      totalProductCommission: 0,
      totalProductsSold: 0,
    };

    // ✅ Pega os dados de planos
    const planOverview = planResult[0] || {
      totalPlanRevenue: 0,
      totalPlanCommission: 0,
      totalPlansSold: 0,
    };

    // 8. COMBINAR OS RESULTADOS
    const response = {
      period: {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      },
      overview: {
        // Métricas de Serviço
        totalServiceRevenue: serviceOverview.totalRevenue,
        totalBookings: serviceOverview.totalBookings,
        serviceCommissionRate: serviceOverview.serviceCommissionRate,
        totalServiceCommission: serviceOverview.totalServiceCommission,
        totalUniqueCustomers: serviceOverview.totalUniqueCustomers,

        // Métricas de Produto
        totalProductRevenue: productOverview.totalProductRevenue,
        totalProductCommission: productOverview.totalProductCommission,
        totalProductsSold: productOverview.totalProductsSold,

        // ✅ Métricas de Plano
        totalPlanRevenue: planOverview.totalPlanRevenue,
        totalPlanCommission: planOverview.totalPlanCommission,
        totalPlansSold: planOverview.totalPlansSold,

        // ✅ Métrica Combinada Total
        totalCommission: serviceOverview.totalServiceCommission + productOverview.totalProductCommission + planOverview.totalPlanCommission, // ✅ Somado
      },
      // Breakdown de serviços (continua o mesmo)
      serviceBreakdown: serviceMetrics.servicosExecutados || [],
    };

    res.json(response);
  } catch (error) {
    console.error("Erro ao buscar métricas de performance do barbeiro:", error);
    res.status(500).json({ error: "Erro interno ao buscar métricas." });
  }
});

export default router;
