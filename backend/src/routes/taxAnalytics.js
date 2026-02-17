import express from "express";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Subscription from "../models/Subscription.js";
import StockMovement from "../models/StockMovement.js";
import Barbershop from "../models/Barbershop.js";
import { protectAdmin, requireRole } from "../middleware/authAdminMiddleware.js";

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

    // 3. Calcular Projeção de Imposto
    const taxInfo = barbershop.taxInfo || {};
    let estimatedTax = 0;
    let taxDetails = "";

    switch (taxInfo.regime) {
      case "MEI":
        // Valor fixo aproximado do DAS MEI 2024 (Comércio e Serviços)
        estimatedTax = 75.60;
        taxDetails = "Valor fixo mensal do DAS-MEI.";
        break;
      case "Simples Nacional":
        const rate = (taxInfo.simplesNacionalRate || 6) / 100;
        estimatedTax = taxableRevenue * rate;
        taxDetails = `Alíquota de ${(rate * 100).toFixed(2)}% sobre faturamento tributável (Lei do Salão-Parceiro).`;
        break;
      case "Lucro Presumido":
        // Cálculo simplificado de Lucro Presumido (Serviços aprox 13.33% a 16.33%)
        estimatedTax = taxableRevenue * 0.15;
        taxDetails = "Estimativa base de 15% (PIS/COFINS/ISS/IRPJ/CSLL) sobre faturamento tributável.";
        break;
      default:
        estimatedTax = 0;
        taxDetails = "Regime fiscal não configurado.";
    }

    res.json({
      success: true,
      period: { startDate: timeQuery.$gte, endDate: timeQuery.$lte },
      metrics: {
        grossRevenue,
        totalCommissions,
        taxableRevenue,
        estimatedTax,
      },
      taxInfo: {
        regime: taxInfo.regime || "Não Informado",
        cnpj: taxInfo.cnpj,
        details: taxDetails,
      },
      lawSupport: {
        isLawApplied: true,
        description: "Salão-Parceiro: Comissões deduzidas da base de cálculo tributária.",
      }
    });

  } catch (error) {
    console.error("Erro ao calcular projeção fiscal:", error);
    res.status(500).json({ error: "Erro ao calcular projeção fiscal." });
  }
});

export default router;
