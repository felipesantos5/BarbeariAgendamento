import express from "express";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import { protectAdmin } from "../middleware/authAdminMiddleware.js";
import { requireRole } from "../middleware/authAdminMiddleware.js";
import Subscription from "../models/Subscription.js";
import StockMovement from "../models/StockMovement.js";
import "dotenv/config";

const router = express.Router({ mergeParams: true });

router.get("/", protectAdmin, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(barbershopId)) {
      return res.status(400).json({ error: "ID da barbearia inválido." });
    }

    const { role, barberProfileId } = req.adminUser;
    const { barberId, startDate, endDate, month, year } = req.query;

    if (role === "barber" && barberId && barberId !== barberProfileId) {
      return res.status(403).json({ error: "Barbeiro não pode visualizar comissões de outros barbeiros" });
    }

    // --- 1. Definir Filtros de Data e Barbeiro ---
    const barbershopMongoId = new mongoose.Types.ObjectId(barbershopId);

    // Filtro de Data
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
    }

    // Filtro de Barbeiro
    let barberQuery = {};
    if (role === "barber") {
      barberQuery.barber = new mongoose.Types.ObjectId(barberProfileId);
    } else if (barberId) {
      barberQuery.barber = new mongoose.Types.ObjectId(barberId);
    }

    // --- 2. Buscar Comissões de Serviços (Bookings) ---
    const serviceCommissions = await Booking.aggregate([
      {
        $match: {
          barbershop: barbershopMongoId,
          status: "completed",
          time: timeQuery,
          ...barberQuery, // Aplica filtro de barbeiro se houver
        },
      },
      { $lookup: { from: "barbers", localField: "barber", foreignField: "_id", as: "barberInfo" } },
      { $lookup: { from: "services", localField: "service", foreignField: "_id", as: "serviceInfo" } },
      { $unwind: "$barberInfo" },
      { $unwind: "$serviceInfo" },
      {
        $group: {
          _id: "$barber",
          barberName: { $first: "$barberInfo.name" },
          barberImage: { $first: "$barberInfo.image" },
          serviceCommissionRate: { $first: "$barberInfo.commission" },
          totalServiceRevenue: { $sum: "$serviceInfo.price" },
          totalServices: { $sum: 1 },
          services: {
            $push: {
              bookingId: "$_id",
              serviceName: "$serviceInfo.name",
              servicePrice: "$serviceInfo.price",
              date: "$time",
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          barberName: 1,
          barberImage: 1,
          serviceCommissionRate: 1,
          totalServiceRevenue: 1,
          totalServices: 1,
          services: 1,
          totalServiceCommission: {
            $multiply: ["$totalServiceRevenue", { $divide: ["$serviceCommissionRate", 100] }],
          },
        },
      },
    ]);

    // --- 3. Buscar Comissões de Produtos (StockMovements) ---
    const productCommissions = await StockMovement.aggregate([
      {
        $match: {
          barbershop: barbershopMongoId,
          type: "venda",
          createdAt: timeQuery,
          barber: { $exists: true, $ne: null },
          ...barberQuery,
        },
      },
      { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "productInfo" } },
      { $lookup: { from: "barbers", localField: "barber", foreignField: "_id", as: "barberInfo" } },
      { $unwind: "$productInfo" },
      { $unwind: "$barberInfo" },
      {
        // Pré-calcula a receita e a comissão de CADA venda
        $project: {
          barber: 1, // Mantém o ID do barbeiro
          barberInfo: 1, // Mantém os dados do barbeiro
          quantity: 1,
          createdAt: 1,
          productInfo: 1,
          totalCost: 1, // ✅ Mantém o custo total
          // Calcula a receita desta venda específica
          saleRevenue: { $multiply: ["$quantity", "$productInfo.price.sale"] },
          // ✅ CORREÇÃO: Calcula a comissão sobre o LUCRO (Receita - Custo)
          commissionAmount: {
            $multiply: [
              {
                $subtract: [
                  { $multiply: ["$quantity", "$productInfo.price.sale"] }, // Receita
                  { $ifNull: ["$totalCost", 0] }, // Custo
                ],
              },
              { $divide: [{ $ifNull: ["$productInfo.commissionRate", 0] }, 100] },
            ],
          },
        },
      },
      {
        // Agrupa por barbeiro
        $group: {
          _id: "$barber",
          barberName: { $first: "$barberInfo.name" },
          barberImage: { $first: "$barberInfo.image" },
          // Soma a receita total de produtos vendidos
          totalProductRevenue: { $sum: "$saleRevenue" },
          // Soma a comissão total de produtos
          totalProductCommission: { $sum: "$commissionAmount" },
          totalProductsSold: { $sum: "$quantity" },
          products: {
            $push: {
              movementId: "$_id",
              productName: "$productInfo.name",
              quantity: "$quantity",
              salePrice: "$productInfo.price.sale",
              commissionRate: "$productInfo.commissionRate", // Opcional: mostra a % no detalhe
              date: "$createdAt",
            },
          },
        },
      },
      {
        // Limpa o projeto final
        $project: {
          _id: 1,
          barberName: 1,
          barberImage: 1,
          totalProductRevenue: 1,
          totalProductCommission: 1,
          totalProductsSold: 1,
          products: 1,
        },
      },
    ]);

    // --- 4. Unificar os resultados ---
    const commissionMap = new Map();

    // Adiciona comissões de serviço
    serviceCommissions.forEach((sc) => {
      commissionMap.set(sc._id.toString(), {
        _id: sc._id,
        barberName: sc.barberName,
        barberImage: sc.barberImage,
        serviceCommissionRate: sc.serviceCommissionRate,
        totalServiceRevenue: sc.totalServiceRevenue,
        totalServiceCommission: sc.totalServiceCommission,
        totalServices: sc.totalServices,
        services: sc.services,
        // Inicia produtos como zero
        totalProductRevenue: 0,
        totalProductCommission: 0,
        totalProductsSold: 0,
        products: [],
      });
    });

    // Adiciona (ou soma) comissões de produto
    productCommissions.forEach((pc) => {
      const barberId = pc._id.toString();
      if (commissionMap.has(barberId)) {
        // Barbeiro já existe (vendeu serviços), apenas adiciona os dados do produto
        const entry = commissionMap.get(barberId);
        entry.totalProductRevenue = pc.totalProductRevenue;
        entry.totalProductCommission = pc.totalProductCommission;
        entry.totalProductsSold = pc.totalProductsSold;
        entry.products = pc.products;
      } else {
        // Barbeiro só vendeu produtos (não prestou serviços)
        commissionMap.set(barberId, {
          _id: pc._id,
          barberName: pc.barberName,
          barberImage: pc.barberImage,
          // Inicia serviços como zero
          serviceCommissionRate: 0,
          totalServiceRevenue: 0,
          totalServiceCommission: 0,
          totalServices: 0,
          services: [],
          // Adiciona dados do produto
          totalProductRevenue: pc.totalProductRevenue,
          totalProductCommission: pc.totalProductCommission,
          totalProductsSold: pc.totalProductsSold,
          products: pc.products,
        });
      }
    });

    // --- 5. Calcular totais e formatar saída ---
    const finalCommissions = Array.from(commissionMap.values()).map((entry) => {
      const totalCommission = entry.totalServiceCommission + entry.totalProductCommission;
      return {
        ...entry,
        totalCommission, // Soma final
      };
    });

    // Ordena pelo total de comissão (maior primeiro)
    finalCommissions.sort((a, b) => b.totalCommission - a.totalCommission);

    res.json({
      success: true,
      data: finalCommissions,
      period: { month, year, startDate, endDate },
    });
  } catch (error) {
    console.error("Erro ao buscar comissões:", error);
    res.status(500).json({ error: "Erro ao calcular comissões" });
  }
});

// GET /api/barbershops/:barbershopId/analytics/commissions/summary
router.get("/summary", protectAdmin, async (req, res) => {
  try {
    const { barbershopId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(barbershopId)) {
      return res.status(400).json({ error: "ID da barbearia inválido." });
    }

    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();
    const barbershopMongoId = new mongoose.Types.ObjectId(barbershopId);

    // Define o período do ano inteiro
    const startDate = new Date(currentYear, 0, 1); // 1º de Janeiro
    const endDate = new Date(currentYear, 11, 31, 23, 59, 59); // 31 de Dezembro

    // 1. Vamos buscar as 3 fontes de receita em paralelo
    const [serviceRevenue, planRevenue, productRevenue] = await Promise.all([
      // Agregação 1: Receita de Serviços (Bookings)
      Booking.aggregate([
        {
          $match: {
            barbershop: barbershopMongoId,
            status: "completed",
            // IMPORTANTE: Ignora receita de planos e prêmios
            paymentStatus: { $nin: ["plan_credit", "loyalty_reward"] },
            time: { $gte: startDate, $lte: endDate },
          },
        },
        { $lookup: { from: "services", localField: "service", foreignField: "_id", as: "serviceInfo" } },
        { $unwind: "$serviceInfo" },
        {
          $group: {
            _id: { month: { $month: "$time" } },
            totalRevenue: { $sum: "$serviceInfo.price" },
          },
        },
      ]),

      // Agregação 2: Receita de Planos (Subscriptions)
      Subscription.aggregate([
        {
          $match: {
            barbershop: barbershopMongoId,
            createdAt: { $gte: startDate, $lte: endDate }, // Data da VENDA do plano
          },
        },
        { $lookup: { from: "plans", localField: "plan", foreignField: "_id", as: "planDetails" } },
        { $unwind: "$planDetails" },
        {
          $group: {
            _id: { month: { $month: "$createdAt" } },
            totalRevenue: { $sum: "$planDetails.price" },
          },
        },
      ]),

      // Agregação 3: Receita de Produtos (StockMovements)
      StockMovement.aggregate([
        {
          $match: {
            barbershop: barbershopMongoId,
            type: "venda", // Apenas vendas
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "productDetails" } },
        { $unwind: "$productDetails" },
        {
          $group: {
            _id: { month: { $month: "$createdAt" } },
            // Faturamento Bruto (Preço de Venda * Qtd)
            totalRevenue: { $sum: { $multiply: ["$quantity", "$productDetails.price.sale"] } },
          },
        },
      ]),
    ]);

    // 2. Combinar os resultados em um array de 12 meses
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    // Inicializa o array do gráfico com 12 meses zerados
    const monthlySummary = months.map((monthName, index) => ({
      month: index + 1, // 1 para Jan, 2 para Fev...
      name: monthName,
      totalRevenue: 0,
    }));

    // Função auxiliar para somar os resultados no array 'monthlySummary'
    const combineRevenue = (results) => {
      results.forEach((item) => {
        const monthIndex = item._id.month - 1; // Mês da agregação é 1-based
        if (monthlySummary[monthIndex]) {
          monthlySummary[monthIndex].totalRevenue += item.totalRevenue;
        }
      });
    };

    // Combina as 3 fontes de receita
    combineRevenue(serviceRevenue);
    combineRevenue(planRevenue);
    combineRevenue(productRevenue);

    res.json({
      success: true,
      data: monthlySummary, // Array final pronto para o gráfico
      year: currentYear,
    });
  } catch (error) {
    console.error("Erro ao buscar resumo de faturamento mensal:", error);
    res.status(500).json({ error: "Erro ao buscar resumo" });
  }
});

export default router;
