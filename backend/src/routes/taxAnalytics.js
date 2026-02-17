import express from "express";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Subscription from "../models/Subscription.js";
import StockMovement from "../models/StockMovement.js";
import Barbershop from "../models/Barbershop.js";
import { protectAdmin, requireRole } from "../middleware/authAdminMiddleware.js";
import { calculateEstimatedTax, TAX_RATES } from "../config/taxConfig.js";

const router = express.Router({ mergeParams: true });

// GET /api/barbershops/:barbershopId/tax-analytics/projection
// Calcula projeção de impostos e Lei do Salão-Parceiro
router.get("/projection", protectAdmin, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { month, year, startDate, endDate } = req.query;

    if (!mongoose.Types.ObjectId.isValid(barbershopId)) {
      return res.status(400).json({ error: "ID da barbearia inválido." });
    }

    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }

    const barbershopMongoId = new mongoose.Types.ObjectId(barbershopId);

    // 1. Definir Período
    let timeQuery = {};
    if (month && year) {
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);
      timeQuery = { $gte: startOfMonth, $lte: endOfMonth };
    } else if (startDate && endDate) {
      timeQuery = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    } else {
      // Padrão: Mês atual
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      timeQuery = { $gte: startOfMonth, $lte: endOfMonth };
    }

    // 2. Buscar Receitas e Comissões
    const [serviceData, planData, productData] = await Promise.all([
      // Serviços (Bookings) - Receita e Comissões
      Booking.aggregate([
        {
          $match: {
            barbershop: barbershopMongoId,
            status: "completed",
            time: timeQuery,
          },
        },
        { $lookup: { from: "services", localField: "service", foreignField: "_id", as: "serviceInfo" } },
        { $lookup: { from: "barbers", localField: "barber", foreignField: "_id", as: "barberInfo" } },
        { $unwind: "$serviceInfo" },
        { $unwind: "$barberInfo" },
        {
          $group: {
            _id: null,
            totalServiceRevenue: { $sum: "$serviceInfo.price" },
            totalServiceCommission: {
              $sum: {
                $multiply: ["$serviceInfo.price", { $divide: ["$barberInfo.commission", 100] }],
              },
            },
          },
        },
      ]),

      // Planos (Subscriptions) - Receita (Geralmente não tem comissão direta ou é tratada diferente)
      Subscription.aggregate([
        {
          $match: {
            barbershop: barbershopMongoId,
            createdAt: timeQuery,
          },
        },
        { $lookup: { from: "plans", localField: "plan", foreignField: "_id", as: "planDetails" } },
        { $unwind: "$planDetails" },
        {
          $group: {
            _id: null,
            totalPlanRevenue: { $sum: "$planDetails.price" },
          },
        },
      ]),

      // Produtos (StockMovements) - Receita e Comissões
      StockMovement.aggregate([
        {
          $match: {
            barbershop: barbershopMongoId,
            type: "venda",
            createdAt: timeQuery,
          },
        },
        { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "productInfo" } },
        { $unwind: "$productInfo" },
        {
          $project: {
            revenue: { $multiply: ["$quantity", "$productInfo.price.sale"] },
            commission: {
              $multiply: [
                {
                  $subtract: [
                    { $multiply: ["$quantity", "$productInfo.price.sale"] },
                    { $ifNull: ["$totalCost", 0] },
                  ],
                },
                { $divide: [{ $ifNull: ["$productInfo.commissionRate", 0] }, 100] },
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalProductRevenue: { $sum: "$revenue" },
            totalProductCommission: { $sum: "$commission" },
          },
        },
      ]),
    ]);

    const totalServiceRevenue = serviceData[0]?.totalServiceRevenue || 0;
    const totalServiceCommission = serviceData[0]?.totalServiceCommission || 0;
    const totalPlanRevenue = planData[0]?.totalPlanRevenue || 0;
    const totalProductRevenue = productData[0]?.totalProductRevenue || 0;
    const totalProductCommission = productData[0]?.totalProductCommission || 0;

    const grossRevenue = totalServiceRevenue + totalPlanRevenue + totalProductRevenue;
    const totalCommissions = totalServiceCommission + totalProductCommission;

    // Lógica da Lei do Salão-Parceiro:
    // O imposto incide apenas sobre o que sobra após pagar as comissões (cotaparte do salão)
    const taxableRevenue = Math.max(0, grossRevenue - totalCommissions);

    // 3. Detectar Meses Operados (Meses com algum faturamento)
    const [bookingMonths, movementMonths, subscriptionMonths] = await Promise.all([
      Booking.distinct("time", { barbershop: barbershopMongoId, status: "completed", time: timeQuery }),
      StockMovement.distinct("createdAt", { barbershop: barbershopMongoId, type: "venda", createdAt: timeQuery }),
      Subscription.distinct("createdAt", { barbershop: barbershopMongoId, createdAt: timeQuery })
    ]);

    const allDates = [...bookingMonths, ...movementMonths, ...subscriptionMonths];
    const uniqueMonths = new Set(allDates.map(d => {
      const date = new Date(d);
      return `${date.getFullYear()}-${date.getMonth()}`;
    }));

    const activeMonthsCount = Math.max(1, uniqueMonths.size);

    // 4. Calcular Projeção de Imposto
    const taxInfo = barbershop.taxInfo || {};
    const estimatedTax = calculateEstimatedTax(
      taxInfo.regime, 
      taxableRevenue, 
      taxInfo.regime === "Simples Nacional" ? taxInfo.simplesNacionalRate : null,
      activeMonthsCount
    );

    let taxDetails = "";
    if (taxInfo.regime === "MEI") {
      taxDetails = `Valor fixo de R$ ${TAX_RATES.MEI_FIXED_VALUE.toFixed(2)} x ${activeMonthsCount} mês(es) operado(s).`;
    } else if (taxInfo.regime === "Simples Nacional") {
      const currentRate = taxInfo.simplesNacionalRate || TAX_RATES.SIMPLES_NACIONAL.DEFAULT_RATE;
      taxDetails = `Alíquota de ${currentRate}% sobre faturamento tributável.`;
    } else if (taxInfo.regime === "Lucro Presumido") {
      taxDetails = `Estimativa de ${TAX_RATES.LUCRO_PRESUMIDO.ESTIMATED_TOTAL_RATE}% sobre faturamento tributável.`;
    } else {
      taxDetails = "Regime fiscal não configurado.";
    }

    const netAfterTax = grossRevenue - totalCommissions - estimatedTax;

    res.json({
      success: true,
      period: { 
        start: timeQuery.$gte, 
        end: timeQuery.$lte 
      },
      metrics: {
        grossRevenue,
        totalCommissions,
        taxableRevenue,
        estimatedTax,
        netAfterTax
      },
      taxRegime: {
        regime: taxInfo.regime || "Não Informado",
        rate: taxInfo.regime === "Simples Nacional" ? (taxInfo.simplesNacionalRate || TAX_RATES.SIMPLES_NACIONAL.DEFAULT_RATE) : 
              taxInfo.regime === "Lucro Presumido" ? TAX_RATES.LUCRO_PRESUMIDO.ESTIMATED_TOTAL_RATE : 0,
        leiSalaoParceiroApplied: true, // No backend já está aplicando a lógica
        cnpj: taxInfo.cnpj,
        details: taxDetails,
      }
    });

  } catch (error) {
    console.error("Erro ao calcular projeção fiscal:", error);
    res.status(500).json({ error: "Erro ao calcular projeção fiscal." });
  }
});

export default router;
