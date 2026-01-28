import express from "express";
import mongoose from "mongoose";
import OperationalCost from "../../models/OperationalCost.js";
import { protectAdmin, checkAccountStatus, requireRole } from "../../middleware/authAdminMiddleware.js";

const router = express.Router({ mergeParams: true });

// GET /api/barbershops/:barbershopId/admin/operational-costs
// Listar todos os custos operacionais (com filtro opcional por período)
router.get("/", protectAdmin, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { startDate, endDate, type } = req.query;

    const filter = { barbershop: barbershopId };

    // Filtro de data
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // Filtro de tipo
    if (type && type !== "all") {
      filter.type = type;
    }

    const costs = await OperationalCost.find(filter).sort({ date: -1 });

    res.json(costs);
  } catch (error) {
    console.error("Erro ao listar custos operacionais:", error);
    res.status(500).json({ error: "Erro ao listar custos operacionais." });
  }
});

// POST /api/barbershops/:barbershopId/admin/operational-costs
// Criar um novo custo operacional
router.post("/", protectAdmin, checkAccountStatus, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { type, description, amount, date, isRecurring, notes } = req.body;

    // Validação
    if (!type || !description || amount === undefined || !date) {
      return res.status(400).json({ error: "Tipo, descrição, valor e data são obrigatórios." });
    }

    if (amount < 0) {
      return res.status(400).json({ error: "O valor não pode ser negativo." });
    }

    const newCost = await OperationalCost.create({
      barbershop: barbershopId,
      type,
      description,
      amount,
      date: new Date(date),
      isRecurring: isRecurring || false,
      notes: notes || "",
    });

    res.status(201).json(newCost);
  } catch (error) {
    console.error("Erro ao criar custo operacional:", error);
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Erro ao criar custo operacional." });
  }
});

// PUT /api/barbershops/:barbershopId/admin/operational-costs/:costId
// Atualizar um custo operacional
router.put("/:costId", protectAdmin, checkAccountStatus, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId, costId } = req.params;
    const { type, description, amount, date, isRecurring, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(costId)) {
      return res.status(400).json({ error: "ID do custo inválido." });
    }

    const updateData = {};
    if (type !== undefined) updateData.type = type;
    if (description !== undefined) updateData.description = description;
    if (amount !== undefined) {
      if (amount < 0) {
        return res.status(400).json({ error: "O valor não pode ser negativo." });
      }
      updateData.amount = amount;
    }
    if (date !== undefined) updateData.date = new Date(date);
    if (isRecurring !== undefined) updateData.isRecurring = isRecurring;
    if (notes !== undefined) updateData.notes = notes;

    const updatedCost = await OperationalCost.findOneAndUpdate(
      { _id: costId, barbershop: barbershopId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedCost) {
      return res.status(404).json({ error: "Custo não encontrado." });
    }

    res.json(updatedCost);
  } catch (error) {
    console.error("Erro ao atualizar custo operacional:", error);
    res.status(500).json({ error: "Erro ao atualizar custo operacional." });
  }
});

// DELETE /api/barbershops/:barbershopId/admin/operational-costs/:costId
// Deletar um custo operacional
router.delete("/:costId", protectAdmin, checkAccountStatus, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId, costId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(costId)) {
      return res.status(400).json({ error: "ID do custo inválido." });
    }

    const deletedCost = await OperationalCost.findOneAndDelete({
      _id: costId,
      barbershop: barbershopId,
    });

    if (!deletedCost) {
      return res.status(404).json({ error: "Custo não encontrado." });
    }

    res.json({ message: "Custo operacional deletado com sucesso." });
  } catch (error) {
    console.error("Erro ao deletar custo operacional:", error);
    res.status(500).json({ error: "Erro ao deletar custo operacional." });
  }
});

// GET /api/barbershops/:barbershopId/admin/operational-costs/summary
// Obter resumo de custos por tipo e período
router.get("/summary", protectAdmin, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { startDate, endDate } = req.query;

    const filter = { barbershop: new mongoose.Types.ObjectId(barbershopId) };

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const summary = await OperationalCost.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$type",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    const totalCosts = summary.reduce((sum, item) => sum + item.totalAmount, 0);

    res.json({
      summary,
      totalCosts,
    });
  } catch (error) {
    console.error("Erro ao obter resumo de custos:", error);
    res.status(500).json({ error: "Erro ao obter resumo de custos." });
  }
});

export default router;
