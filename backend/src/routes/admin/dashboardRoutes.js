import express from "express";
import mongoose from "mongoose";
import { protectAdmin, requireRole } from "../../middleware/authAdminMiddleware.js";
import Booking from "../../models/Booking.js";
import Barber from "../../models/Barber.js";
import Customer from "../../models/Customer.js";
// ✅ CORREÇÃO: Corrigido o caminho da importação
import StockMovement from "../../models/StockMovement.js";
import Subscription from "../../models/Subscription.js";
import OperationalCost from "../../models/OperationalCost.js";
import { startOfMonth, endOfMonth, startOfDay, endOfDay, parseISO, isValid } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

const router = express.Router({ mergeParams: true });

// Protege todas as rotas neste arquivo
router.use(protectAdmin, requireRole("admin"));

const BRAZIL_TZ = "America/Sao_Paulo";

// GET /barbershops/:barbershopId/dashboard-metrics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get("/", async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const barbershopMongoId = new mongoose.Types.ObjectId(barbershopId);

    if (!mongoose.Types.ObjectId.isValid(barbershopId)) {
      return res.status(400).json({ error: "ID da barbearia inválido." });
    }

    // --- 1. Tratamento de Datas ---
    let { startDate: startDateQuery, endDate: endDateQuery } = req.query;
    let startDate, endDate;
    const nowInBrazil = toZonedTime(new Date(), BRAZIL_TZ);

    if (startDateQuery && isValid(parseISO(startDateQuery))) {
      startDate = fromZonedTime(startOfDay(parseISO(startDateQuery)), BRAZIL_TZ);
    } else {
      startDate = fromZonedTime(startOfMonth(nowInBrazil), BRAZIL_TZ);
    }

    if (endDateQuery && isValid(parseISO(endDateQuery))) {
      endDate = fromZonedTime(endOfDay(parseISO(endDateQuery)), BRAZIL_TZ);
    } else {
      endDate = fromZonedTime(endOfMonth(nowInBrazil), BRAZIL_TZ);
    }

    if (endDate < startDate) {
      return res.status(400).json({ error: "A data final deve ser posterior à data inicial." });
    }

    // --- 2. Agregações Principais (em Paralelo) ---
    const [bookingResults, planResults, planResultsGlobal, productResults, stockEntryResults, operationalCostsResults] = await Promise.all([
      // Agregação 1: Bookings (Serviços)
      Booking.aggregate([
        {
          $match: {
            barbershop: barbershopMongoId,
            time: { $gte: startDate, $lte: endDate },
          },
        },
        { $lookup: { from: "services", localField: "service", foreignField: "_id", as: "serviceDetails" } },
        { $lookup: { from: "barbers", localField: "barber", foreignField: "_id", as: "barberDetails" } },
        { $lookup: { from: "customers", localField: "customer", foreignField: "_id", as: "customerDetails" } },
        { $unwind: { path: "$serviceDetails", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$barberDetails", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$customerDetails", preserveNullAndEmptyArrays: true } },
        {
          $facet: {
            // --- Facet 1: Métricas Gerais (Receita de Serviços, Contagens Globais) ---
            generalMetrics: [
              {
                $group: {
                  _id: null,
                  totalBookings: { $sum: 1 },
                  completedBookings: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                  canceledBookings: { $sum: { $cond: [{ $eq: ["$status", "canceled"] }, 1, 0] } },

                  // ✅ ADIÇÃO: Contagem de agendamentos pendentes
                  pendingBookings: {
                    $sum: {
                      $cond: [{ $in: ["$status", ["booked", "confirmed", "pending_payment"]] }, 1, 0],
                    },
                  },

                  totalServiceRevenue: {
                    $sum: {
                      $cond: [
                        { $and: [{ $eq: ["$status", "completed"] }, { $not: { $in: ["$paymentStatus", ["plan_credit", "loyalty_reward"]] } }] },
                        { $ifNull: ["$serviceDetails.price", 0] },
                        0,
                      ],
                    },
                  },
                  uniqueCustomers: { $addToSet: "$customer" },
                },
              },
              {
                $project: {
                  _id: 0,
                  totalBookings: 1,
                  completedBookings: 1,
                  canceledBookings: 1,
                  pendingBookings: 1, // ✅ ADIÇÃO: Passa a métrica para a saída
                  totalRevenue: { $ifNull: ["$totalServiceRevenue", 0] }, // Renomeado para clareza
                  cancellationRate: {
                    $cond: [{ $gt: ["$totalBookings", 0] }, { $multiply: [{ $divide: ["$canceledBookings", "$totalBookings"] }, 100] }, 0],
                  },
                  totalUniqueCustomers: { $size: { $ifNull: ["$uniqueCustomers", []] } },
                },
              },
            ],
            // --- Facet 2: Breakdown por Barbeiro (APENAS SERVIÇOS) ---
            barberMetrics: [
              {
                $group: {
                  _id: "$barberDetails._id",
                  name: { $first: "$barberDetails.name" },
                  commissionRate: { $first: { $ifNull: ["$barberDetails.commission", 0] } },
                  totalServiceRevenue: {
                    $sum: {
                      $cond: [
                        { $and: [{ $eq: ["$status", "completed"] }, { $not: { $in: ["$paymentStatus", ["plan_credit", "loyalty_reward"]] } }] },
                        { $ifNull: ["$serviceDetails.price", 0] },
                        0,
                      ],
                    },
                  },
                  completedBookings: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                },
              },
              {
                $project: {
                  _id: 1,
                  name: { $ifNull: ["$name", "Barbeiro Removido"] },
                  commissionRate: 1,
                  totalServiceRevenue: 1,
                  completedBookings: 1,
                  totalServiceCommission: {
                    $multiply: ["$totalServiceRevenue", { $divide: ["$commissionRate", 100] }],
                  },
                },
              },
            ],
            // --- Facet 3: Métricas por Serviço (Top Serviços) ---
            serviceMetrics: [
              { $match: { status: "completed" } },
              {
                $group: {
                  _id: "$serviceDetails._id",
                  name: { $first: "$serviceDetails.name" },
                  totalRevenue: {
                    $sum: {
                      $cond: [{ $not: { $in: ["$paymentStatus", ["plan_credit", "loyalty_reward"]] } }, { $ifNull: ["$serviceDetails.price", 0] }, 0],
                    },
                  },
                  count: { $sum: 1 },
                },
              },
              { $project: { _id: 0, serviceId: "$_id", name: { $ifNull: ["$name", "Serviço Removido"] }, totalRevenue: 1, count: 1 } },
              { $sort: { totalRevenue: -1 } },
            ],
            // --- Facet 4: Análise de Novos x Recorrentes ---
            customerAnalysis: [
              { $group: { _id: "$customer", firstVisitDate: { $min: "$customerDetails.createdAt" } } },
              {
                $project: {
                  _id: 0,
                  customerId: "$_id",
                  isNew: { $and: [{ $gte: ["$firstVisitDate", startDate] }, { $lte: ["$firstVisitDate", endDate] }] },
                },
              },
              { $group: { _id: "$isNew", count: { $sum: 1 } } },
              { $project: { _id: 0, type: { $cond: ["$_id", "new", "returning"] }, count: 1 } },
            ],
            // --- Facet 5: Faturamento por Dia ---
            dailyRevenue: [
              { $match: { status: "completed" } },
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: "%Y-%m-%d",
                      date: "$time",
                      timezone: BRAZIL_TZ,
                    },
                  },
                  revenue: {
                    $sum: {
                      $cond: [
                        { $not: { $in: ["$paymentStatus", ["plan_credit", "loyalty_reward"]] } },
                        { $ifNull: ["$serviceDetails.price", 0] },
                        0,
                      ],
                    },
                  },
                  bookings: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
              {
                $project: {
                  _id: 0,
                  date: "$_id",
                  revenue: 1,
                  bookings: 1,
                },
              },
            ],
            // --- Facet 6: Faturamento por Hora ---
            hourlyRevenue: [
              { $match: { status: "completed" } },
              {
                $group: {
                  _id: {
                    $hour: {
                      date: "$time",
                      timezone: BRAZIL_TZ,
                    },
                  },
                  revenue: {
                    $sum: {
                      $cond: [
                        { $not: { $in: ["$paymentStatus", ["plan_credit", "loyalty_reward"]] } },
                        { $ifNull: ["$serviceDetails.price", 0] },
                        0,
                      ],
                    },
                  },
                  bookings: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
              {
                $project: {
                  _id: 0,
                  hour: "$_id",
                  revenue: 1,
                  bookings: 1,
                },
              },
            ],
          },
        },
      ]), // Fim Agregação 1 (Bookings)

      // Agregação 2: Planos (Subscriptions) - Agrupado por barbeiro
      Subscription.aggregate([
        {
          $match: {
            barbershop: barbershopMongoId,
            createdAt: { $gte: startDate, $lte: endDate },
            barber: { $exists: true, $ne: null }, // ✅ CORREÇÃO: Só planos com barbeiro específico
          },
        },
        { $lookup: { from: "plans", localField: "plan", foreignField: "_id", as: "planDetails" } },
        { $lookup: { from: "barbers", localField: "barber", foreignField: "_id", as: "barberDetails" } },
        { $unwind: "$planDetails" },
        { $unwind: "$barberDetails" }, // ✅ CORREÇÃO: Removido preserveNullAndEmptyArrays
        {
          $group: {
            _id: "$barber",
            totalPlanRevenue: { $sum: "$planDetails.price" },
            totalPlansSold: { $sum: 1 },
            totalPlanCommission: {
              $sum: {
                $multiply: [
                  "$planDetails.price",
                  {
                    $divide: [
                      // ✅ Se useBarberCommission = true, usa comissão do barbeiro
                      // ✅ Senão, usa commissionRate do plano (pode ser 0)
                      {
                        $cond: {
                          if: { $eq: ["$planDetails.useBarberCommission", true] },
                          then: "$barberDetails.commission",
                          else: { $ifNull: ["$planDetails.commissionRate", 0] },
                        },
                      },
                      100,
                    ],
                  },
                ],
              },
            },
          },
        },
      ]), // Fim Agregação 2 (Planos por Barbeiro)

      // Agregação 2.1: Planos GLOBAIS (com e sem barbeiro) - Para o overview financeiro
      Subscription.aggregate([
        {
          $match: {
            barbershop: barbershopMongoId,
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        { $lookup: { from: "plans", localField: "plan", foreignField: "_id", as: "planDetails" } },
        { $unwind: "$planDetails" },
        {
          $group: {
            _id: null,
            totalPlanRevenue: { $sum: "$planDetails.price" },
            totalPlansSold: { $sum: 1 },
          },
        },
      ]), // Fim Agregação 2.1 (Planos Globais)

      // Agregação 3: Produtos (StockMovements) - Agrupado por barbeiro
      StockMovement.aggregate([
        {
          $match: {
            barbershop: barbershopMongoId,
            type: "venda",
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "productDetails" } },
        { $unwind: "$productDetails" },
        {
          $group: {
            _id: "$barber", // Agrupa por barbeiro (pode ser null)
            totalItemsSold: { $sum: "$quantity" },
            totalGrossRevenue: { $sum: { $multiply: ["$quantity", "$productDetails.price.sale"] } },
            totalCostOfGoods: { $sum: "$totalCost" },
            totalProductCommission: {
              $sum: {
                $multiply: [
                  // ✅ CORREÇÃO: Comissão sobre o LUCRO (Receita - Custo), não sobre a venda
                  {
                    $subtract: [
                      { $multiply: ["$quantity", "$productDetails.price.sale"] }, // Receita
                      { $ifNull: ["$totalCost", 0] }, // Custo
                    ],
                  },
                  { $divide: [{ $ifNull: ["$productDetails.commissionRate", 0] }, 100] },
                ],
              },
            },
          },
        },
      ]), // Fim Agregação 3 (Produtos)

      // Agregação 4: Entradas de Estoque - Total de compras/entradas
      StockMovement.aggregate([
        {
          $match: {
            barbershop: barbershopMongoId,
            type: "entrada",
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            totalPurchaseCost: { $sum: { $ifNull: ["$totalCost", 0] } },
            totalItemsPurchased: { $sum: "$quantity" },
          },
        },
      ]), // Fim Agregação 4 (Entradas)

      // Agregação 5: Custos Operacionais - Total de despesas operacionais
      OperationalCost.aggregate([
        {
          $match: {
            barbershop: barbershopMongoId,
            date: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            totalOperationalCosts: { $sum: "$amount" },
            totalCostRecords: { $sum: 1 },
          },
        },
      ]), // Fim Agregação 5 (Custos Operacionais)
    ]); // Fim do Promise.all

    // --- 3. COMBINAR OS RESULTADOS ---

    const bookingData = bookingResults[0];
    const planDataByBarber = planResults;
    const planDataGlobal = planResultsGlobal[0] || { totalPlanRevenue: 0, totalPlansSold: 0 };
    const productDataByBarber = productResults;
    const stockEntryData = stockEntryResults[0] || { totalPurchaseCost: 0, totalItemsPurchased: 0 };
    const operationalCostsData = operationalCostsResults[0] || { totalOperationalCosts: 0, totalCostRecords: 0 };

    // --- 4. COMBINAR A TABELA 'barberPerformance' ---

    const masterBarberMap = new Map();
    const barberInfoCache = new Map();

    // Passo 1: Adicionar dados de Serviços (Bookings)
    const barberServiceData = bookingData?.barberMetrics || [];
    for (const serviceMetric of barberServiceData) {
      const barberId = serviceMetric._id?.toString();
      if (!barberId) continue;

      barberInfoCache.set(barberId, { name: serviceMetric.name, commissionRate: serviceMetric.commissionRate });

      masterBarberMap.set(barberId, {
        _id: serviceMetric._id,
        name: serviceMetric.name,
        commissionRate: serviceMetric.commissionRate,

        totalServiceRevenue: serviceMetric.totalServiceRevenue,
        totalServiceCommission: serviceMetric.totalServiceCommission,
        completedBookings: serviceMetric.completedBookings,

        totalPlanRevenue: 0,
        totalPlanCommission: 0,
        totalPlansSold: 0,
        totalProductRevenue: 0,
        totalProductCommission: 0,
        totalProductsSold: 0,
        totalCommission: serviceMetric.totalServiceCommission,
      });
    }

    // Passo 2: Adicionar dados de Planos
    for (const planMetric of planDataByBarber) {
      const barberId = planMetric._id?.toString();
      if (!barberId) continue;

      if (!masterBarberMap.has(barberId)) {
        let info = barberInfoCache.get(barberId);
        if (!info) {
          const barber = await Barber.findById(barberId).select("name commission").lean();
          info = barber || { name: "Barbeiro Removido", commission: 0 };
          barberInfoCache.set(barberId, info);
        }

        masterBarberMap.set(barberId, {
          _id: planMetric._id,
          name: info.name,
          commissionRate: info.commission,
          totalServiceRevenue: 0,
          totalServiceCommission: 0,
          completedBookings: 0,
          totalProductRevenue: 0,
          totalProductCommission: 0,
          totalProductsSold: 0,
          totalPlanRevenue: 0,
          totalPlanCommission: 0,
          totalPlansSold: 0,
          totalCommission: 0,
        });
      }

      const entry = masterBarberMap.get(barberId);
      entry.totalPlanRevenue = planMetric.totalPlanRevenue;
      entry.totalPlanCommission = planMetric.totalPlanCommission;
      entry.totalPlansSold = planMetric.totalPlansSold;
      entry.totalCommission += planMetric.totalPlanCommission;
    }

    // Passo 3: Adicionar dados de Produtos
    for (const productMetric of productDataByBarber) {
      const barberId = productMetric._id?.toString();
      if (!barberId) continue;

      if (!masterBarberMap.has(barberId)) {
        let info = barberInfoCache.get(barberId);
        if (!info) {
          const barber = await Barber.findById(barberId).select("name commission").lean();
          info = barber || { name: "Barbeiro Removido", commission: 0 };
          barberInfoCache.set(barberId, info);
        }

        masterBarberMap.set(barberId, {
          _id: productMetric._id,
          name: info.name,
          commissionRate: info.commission,
          totalServiceRevenue: 0,
          totalServiceCommission: 0,
          completedBookings: 0,
          totalProductRevenue: 0,
          totalProductCommission: 0,
          totalProductsSold: 0,
          totalPlanRevenue: 0,
          totalPlanCommission: 0,
          totalPlansSold: 0,
          totalCommission: 0,
        });
      }

      const entry = masterBarberMap.get(barberId);
      entry.totalProductRevenue = productMetric.totalGrossRevenue;
      entry.totalProductCommission = productMetric.totalProductCommission;
      entry.totalProductsSold = productMetric.totalItemsSold;
      entry.totalCommission += productMetric.totalProductCommission;
    }

    const combinedBarberPerformance = Array.from(masterBarberMap.values()).sort((a, b) => b.totalCommission - a.totalCommission);

    // --- 5. CÁLCULOS FINANCEIROS GLOBAIS (OVERVIEW) ---

    // ✅ ADIÇÃO: Inclui o novo campo "pendingBookings" no objeto default
    const overviewData = bookingData?.generalMetrics[0] || {
      totalBookings: 0,
      completedBookings: 0,
      canceledBookings: 0,
      pendingBookings: 0, // ✅ Default
      totalRevenue: 0,
      cancellationRate: 0,
      totalUniqueCustomers: 0,
    };

    // Calcula comissão total de planos (apenas dos barbeiros específicos)
    const totalPlanCommission = planDataByBarber.reduce((sum, item) => sum + (item.totalPlanCommission || 0), 0);

    // Usa os dados globais para receita (inclui todos os planos)
    const globalPlanData = {
      totalPlanRevenue: planDataGlobal.totalPlanRevenue,
      totalPlansSold: planDataGlobal.totalPlansSold,
      totalPlanCommission: totalPlanCommission, // Apenas de barbeiros específicos
    };

    const globalProductData = productDataByBarber.reduce(
      (acc, cur) => {
        acc.totalGrossRevenue += cur.totalGrossRevenue;
        acc.totalProductCommission += cur.totalProductCommission;
        acc.totalCostOfGoods += cur.totalCostOfGoods;
        acc.totalItemsSold += cur.totalItemsSold;
        return acc;
      },
      { totalGrossRevenue: 0, totalProductCommission: 0, totalCostOfGoods: 0, totalItemsSold: 0 }
    );

    const totalServiceCommission = combinedBarberPerformance.reduce((sum, barber) => sum + (barber.totalServiceCommission || 0), 0);
    const totalGrossRevenue = overviewData.totalRevenue + globalPlanData.totalPlanRevenue + globalProductData.totalGrossRevenue;
    const totalCommissionsPaid = totalServiceCommission + globalPlanData.totalPlanCommission + globalProductData.totalProductCommission;
    const totalCostOfGoods = globalProductData.totalCostOfGoods;
    const totalOperationalCosts = operationalCostsData.totalOperationalCosts;
    const totalExpenses = totalCostOfGoods + totalOperationalCosts;
    const totalNetRevenue = totalGrossRevenue - totalCommissionsPaid - totalExpenses;

    // --- 6. Organização da Resposta ---
    const dashboardData = {
      period: {
        startDate: toZonedTime(startDate, BRAZIL_TZ).toISOString().split("T")[0],
        endDate: toZonedTime(endDate, BRAZIL_TZ).toISOString().split("T")[0],
      },

      generalMetrics: {
        totalBookings: overviewData.totalBookings,
        completedBookings: overviewData.completedBookings,
        canceledBookings: overviewData.canceledBookings,
        pendingBookings: overviewData.pendingBookings, // ✅ ADIÇÃO: Métrica finalizada
        cancellationRate: overviewData.cancellationRate,
        totalUniqueCustomers: overviewData.totalUniqueCustomers,
        totalPlansSold: globalPlanData.totalPlansSold,
        totalProductsSold: globalProductData.totalItemsSold,
      },

      financialOverview: {
        // Faturamento Bruto
        totalGrossRevenue: totalGrossRevenue,
        revenueFromServices: overviewData.totalRevenue,
        revenueFromPlans: globalPlanData.totalPlanRevenue,
        revenueFromProducts: globalProductData.totalGrossRevenue,

        // Despesas de Comissões
        totalCommissionsPaid: totalCommissionsPaid,
        commissionFromServices: totalServiceCommission,
        commissionFromPlans: globalPlanData.totalPlanCommission,
        commissionFromProducts: globalProductData.totalProductCommission,

        // Despesas (Compra de Produtos + Custos Operacionais)
        totalExpenses: totalExpenses,
        totalCostOfGoods: totalCostOfGoods,
        totalOperationalCosts: totalOperationalCosts,

        // Faturamento Líquido
        totalNetRevenue: totalNetRevenue,
      },

      barberPerformance: combinedBarberPerformance,
      servicePerformance: bookingData?.serviceMetrics || [],
      customerStats: (bookingData?.customerAnalysis || []).reduce(
        (acc, curr) => {
          acc[curr.type] = curr.count;
          return acc;
        },
        { new: 0, returning: 0 }
      ),
      dailyRevenue: bookingData?.dailyRevenue || [],
      hourlyRevenue: bookingData?.hourlyRevenue || [],

      stockMovement: {
        totalProductsSold: globalProductData.totalItemsSold,
        totalProductsPurchased: stockEntryData.totalItemsPurchased,
        totalPurchaseCost: stockEntryData.totalPurchaseCost,
        totalSalesRevenue: globalProductData.totalGrossRevenue,
        netProductRevenue: globalProductData.totalGrossRevenue - globalProductData.totalCostOfGoods,
      },
    };

    res.status(200).json(dashboardData);
  } catch (error) {
    console.error("Erro ao gerar métricas do dashboard:", error);
    res.status(500).json({
      error: error.message || "Erro interno ao processar as métricas.",
    });
  }
});

export default router;
