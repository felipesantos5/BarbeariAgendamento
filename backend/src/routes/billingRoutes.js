import express from "express";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import BarbershopSubscription from "../models/BarbershopSubscription.js";
import Barbershop from "../models/Barbershop.js";
import Expense from "../models/Expense.js";

const router = express.Router();

// Função auxiliar para calcular meses entre duas datas
function getMonthsBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let months = (end.getFullYear() - start.getFullYear()) * 12;
  months -= start.getMonth();
  months += end.getMonth();
  
  // Se o dia final é menor que o dia inicial, não conta o mês completo
  if (end.getDate() < start.getDate()) {
    months--;
  }
  
  return Math.max(0, months + 1); // +1 para incluir o mês inicial
}

// ============= PLANOS BASE =============

// GET - Listar todos os planos base
router.get("/plans", async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ monthlyPrice: 1 });
    res.json(plans);
  } catch (error) {
    console.error("Erro ao buscar planos:", error);
    res.status(500).json({ error: "Erro ao buscar planos." });
  }
});

// POST - Criar novo plano base
router.post("/plans", async (req, res) => {
  try {
    const plan = await SubscriptionPlan.create(req.body);
    res.status(201).json(plan);
  } catch (error) {
    console.error("Erro ao criar plano:", error);
    res.status(400).json({ error: error.message || "Erro ao criar plano." });
  }
});

// PUT - Atualizar plano base
router.put("/plans/:planId", async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(
      req.params.planId,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!plan) {
      return res.status(404).json({ error: "Plano não encontrado." });
    }
    
    res.json(plan);
  } catch (error) {
    console.error("Erro ao atualizar plano:", error);
    res.status(400).json({ error: error.message || "Erro ao atualizar plano." });
  }
});

// DELETE - Deletar plano base
router.delete("/plans/:planId", async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndDelete(req.params.planId);
    
    if (!plan) {
      return res.status(404).json({ error: "Plano não encontrado." });
    }
    
    res.json({ message: "Plano deletado com sucesso." });
  } catch (error) {
    console.error("Erro ao deletar plano:", error);
    res.status(500).json({ error: "Erro ao deletar plano." });
  }
});

// ============= ASSINATURAS DE BARBEARIAS =============

// GET - Listar todas as assinaturas com dados das barbearias
router.get("/subscriptions", async (req, res) => {
  try {
    const subscriptions = await BarbershopSubscription.find()
      .populate("barbershop", "name slug accountStatus")
      .populate("basePlan", "name")
      .sort({ nextBillingDate: 1 });
    
    res.json(subscriptions);
  } catch (error) {
    console.error("Erro ao buscar assinaturas:", error);
    res.status(500).json({ error: "Erro ao buscar assinaturas." });
  }
});

// GET - Buscar assinatura de uma barbearia específica
router.get("/subscriptions/barbershop/:barbershopId", async (req, res) => {
  try {
    const subscription = await BarbershopSubscription.findOne({
      barbershop: req.params.barbershopId,
    })
      .populate("barbershop")
      .populate("basePlan");
    
    if (!subscription) {
      return res.status(404).json({ error: "Assinatura não encontrada." });
    }
    
    res.json(subscription);
  } catch (error) {
    console.error("Erro ao buscar assinatura:", error);
    res.status(500).json({ error: "Erro ao buscar assinatura." });
  }
});

// POST - Criar assinatura para uma barbearia
router.post("/subscriptions", async (req, res) => {
  try {
    const { barbershopId, basePlanId, monthlyPrice, startDate, customPlanName } = req.body;
    
    // Verifica se a barbearia existe
    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }
    
    // Verifica se já existe assinatura para esta barbearia
    const existingSubscription = await BarbershopSubscription.findOne({
      barbershop: barbershopId,
    });
    
    if (existingSubscription) {
      return res.status(409).json({ error: "Esta barbearia já possui uma assinatura." });
    }
    
    let planName;
    let price = monthlyPrice;
    
    // Se tem plano base, usa os dados dele
    if (basePlanId) {
      const basePlan = await SubscriptionPlan.findById(basePlanId);
      if (!basePlan) {
        return res.status(404).json({ error: "Plano base não encontrado." });
      }
      planName = customPlanName || basePlan.name;
      if (!monthlyPrice) {
        price = basePlan.monthlyPrice;
      }
    } else {
      // Plano customizado
      if (!customPlanName || !monthlyPrice) {
        return res.status(400).json({ 
          error: "Para planos customizados, é necessário informar nome e valor." 
        });
      }
      planName = customPlanName;
    }
    
    // Calcula próxima data de cobrança (1 mês após a data de início)
    const start = startDate ? new Date(startDate) : new Date();
    const nextBilling = new Date(start);
    nextBilling.setMonth(nextBilling.getMonth() + 1);
    
    const subscription = await BarbershopSubscription.create({
      barbershop: barbershopId,
      basePlan: basePlanId || null,
      planName,
      monthlyPrice: price,
      startDate: start,
      nextBillingDate: nextBilling,
      status: "active",
    });
    
    const populatedSubscription = await BarbershopSubscription.findById(subscription._id)
      .populate("barbershop")
      .populate("basePlan");
    
    res.status(201).json(populatedSubscription);
  } catch (error) {
    console.error("Erro ao criar assinatura:", error);
    res.status(400).json({ error: error.message || "Erro ao criar assinatura." });
  }
});

// PUT - Atualizar assinatura
router.put("/subscriptions/:subscriptionId", async (req, res) => {
  try {
    const subscription = await BarbershopSubscription.findByIdAndUpdate(
      req.params.subscriptionId,
      req.body,
      { new: true, runValidators: true }
    )
      .populate("barbershop")
      .populate("basePlan");
    
    if (!subscription) {
      return res.status(404).json({ error: "Assinatura não encontrada." });
    }
    
    res.json(subscription);
  } catch (error) {
    console.error("Erro ao atualizar assinatura:", error);
    res.status(400).json({ error: error.message || "Erro ao atualizar assinatura." });
  }
});

// POST - Adicionar pagamento a uma assinatura
router.post("/subscriptions/:subscriptionId/payment", async (req, res) => {
  try {
    const { amount, status, notes } = req.body;
    
    const subscription = await BarbershopSubscription.findById(req.params.subscriptionId);
    
    if (!subscription) {
      return res.status(404).json({ error: "Assinatura não encontrada." });
    }
    
    await subscription.addPayment(amount, status, notes);
    
    const updatedSubscription = await BarbershopSubscription.findById(subscription._id)
      .populate("barbershop")
      .populate("basePlan");
    
    res.json(updatedSubscription);
  } catch (error) {
    console.error("Erro ao adicionar pagamento:", error);
    res.status(400).json({ error: error.message || "Erro ao adicionar pagamento." });
  }
});

// DELETE - Deletar assinatura
router.delete("/subscriptions/:subscriptionId", async (req, res) => {
  try {
    const subscription = await BarbershopSubscription.findByIdAndDelete(
      req.params.subscriptionId
    );
    
    if (!subscription) {
      return res.status(404).json({ error: "Assinatura não encontrada." });
    }
    
    res.json({ message: "Assinatura deletada com sucesso." });
  } catch (error) {
    console.error("Erro ao deletar assinatura:", error);
    res.status(500).json({ error: "Erro ao deletar assinatura." });
  }
});

// ============= DASHBOARD DE FATURAMENTO =============

// GET - Visão geral
router.get("/overview", async (req, res) => {
  try {
    const { month, year } = req.query;
    
    // Data alvo: fim do mês selecionado
    const targetDate = new Date();
    if (month !== undefined && year !== undefined) {
      targetDate.setFullYear(parseInt(year), parseInt(month), 1);
      targetDate.setMonth(targetDate.getMonth() + 1);
      targetDate.setDate(0);
      targetDate.setHours(23, 59, 59, 999);
    } else {
      targetDate.setHours(23, 59, 59, 999);
    }

    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();

    // Busca todas as assinaturas e despesas
    const [subscriptions, expenses] = await Promise.all([
      BarbershopSubscription.find().populate("barbershop", "name slug accountStatus createdAt").lean(),
      Expense.find().lean()
    ]);
    
    // 1. Receita Bruta do Mês Selecionado
    let periodRevenue = 0;
    subscriptions.forEach((sub) => {
      const startDate = new Date(sub.startDate);
      // Consideramos que se a assinatura começou antes ou durante o mês, e não está cancelada
      // Simplificação: se for ativa hoje ou se o histórico de pagamentos indicar atividade
      if (startDate <= targetDate && sub.status !== "cancelled") {
        periodRevenue += sub.monthlyPrice;
      }
    });

    // 2. Faturamento Bruto Total (Até o targetDate)
    let totalBilledUntil = 0;
    subscriptions.forEach((sub) => {
      const startDate = new Date(sub.startDate);
      if (startDate <= targetDate) {
        const monthsActive = getMonthsBetween(sub.startDate, targetDate);
        totalBilledUntil += monthsActive * sub.monthlyPrice;
      }
    });
    
    // 3. Despesas do Mês Selecionado
    let periodExpenses = 0;
    expenses.forEach((exp) => {
      if (!exp.isActive) return;
      
      if (exp.type === "one-time") {
        const expDate = new Date(exp.date);
        if (expDate.getFullYear() === targetYear && expDate.getMonth() === targetMonth) {
          periodExpenses += exp.amount;
        }
      } else {
        // Mensal
        const start = new Date(exp.startDate);
        const checkDate = new Date(targetYear, targetMonth, 1);
        if (checkDate >= start) {
          if (!exp.endDate || checkDate <= new Date(exp.endDate)) {
            periodExpenses += exp.amount;
          }
        }
      }
    });

    // 4. Despesas Totais Acumuladas (Até o targetDate)
    let totalExpensesUntil = 0;
    expenses.forEach((exp) => {
      if (!exp.isActive) return;

      if (exp.type === "one-time") {
        const expDate = new Date(exp.date);
        if (expDate <= targetDate) {
          totalExpensesUntil += exp.amount;
        }
      } else {
        // Mensal acumulado
        const start = new Date(exp.startDate);
        if (start <= targetDate) {
          const endLimit = exp.endDate ? new Date(exp.endDate) : targetDate;
          const actualEnd = endLimit < targetDate ? endLimit : targetDate;
          const monthsActive = getMonthsBetween(exp.startDate, actualEnd);
          totalExpensesUntil += monthsActive * exp.amount;
        }
      }
    });

    // 5. Lucro Líquido Acumulado (Valor Líquido)
    const totalNetValue = totalBilledUntil - totalExpensesUntil;

    // 6. Receita Anual Projetada (Baseada no faturamento mensal atual)
    const currentMonthlyRevenue = subscriptions
      .filter(s => s.status === "active")
      .reduce((sum, sub) => sum + sub.monthlyPrice, 0);
    const projectedAnnualRevenue = currentMonthlyRevenue * 12;

    const totalBarbershops = subscriptions.filter(s => s.status === "active").length;
    
    // Agrupa por plano (apenas ativos)
    const revenueByPlan = {};
    subscriptions.forEach((sub) => {
      if (sub.status !== "active") return;
      const planName = sub.planName;
      if (!revenueByPlan[planName]) {
        revenueByPlan[planName] = { count: 0, revenue: 0 };
      }
      revenueByPlan[planName].count += 1;
      revenueByPlan[planName].revenue += sub.monthlyPrice;
    });

    res.json({
      totalMonthlyRevenue: periodRevenue,
      projectedAnnualRevenue,
      totalBilled: totalBilledUntil,     // FATURADO (Gross Until Target)
      totalNetValue: totalNetValue,      // VALOR LÍQUIDO (Gross Until Target - Expenses Until Target)
      totalBarbershops,
      totalMonthlyExpenses: periodExpenses,
      monthlyProfit: periodRevenue - periodExpenses,
      revenueByPlan,
      filterPeriod: { month: targetMonth, year: targetYear },
      subscriptions: subscriptions.map((sub) => ({
        _id: sub._id,
        barbershop: {
          _id: sub.barbershop._id,
          name: sub.barbershop.name,
          slug: sub.barbershop.slug,
          accountStatus: sub.barbershop.accountStatus,
        },
        planName: sub.planName,
        monthlyPrice: sub.monthlyPrice,
        startDate: sub.startDate,
        nextBillingDate: sub.nextBillingDate,
        status: sub.status,
        paymentCount: getMonthsBetween(sub.startDate, targetDate),
      })),
    });
  } catch (error) {
    console.error("Erro ao buscar overview de faturamento:", error);
    res.status(500).json({ error: "Erro ao buscar dados de faturamento." });
  }
});


// ============= DESPESAS =============

// GET - Listar todas as despesas
router.get("/expenses", async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ createdAt: -1 }).lean();
    res.json(expenses);
  } catch (error) {
    console.error("Erro ao buscar despesas:", error);
    res.status(500).json({ error: "Erro ao buscar despesas." });
  }
});

// POST - Criar nova despesa
router.post("/expenses", async (req, res) => {
  try {
    const { name, amount, type, category, date, startDate } = req.body;

    // Validação básica de segurança
    if (!name || typeof amount !== "number" || amount < 0) {
      return res.status(400).json({ error: "Dados inválidos: Nome e Valor (positivo) são obrigatórios." });
    }

    if (type === "one-time" && !date) {
      return res.status(400).json({ error: "Data é obrigatória para despesas esporádicas." });
    }

    if (type === "monthly" && !startDate) {
      return res.status(400).json({ error: "Data de início é obrigatória para despesas mensais." });
    }

    const expense = await Expense.create(req.body);
    res.status(201).json(expense);
  } catch (error) {
    console.error("Erro ao criar despesa:", error);
    res.status(400).json({ error: error.message || "Erro ao criar despesa." });
  }
});

// PUT - Atualizar despesa
router.put("/expenses/:expenseId", async (req, res) => {
  try {
    const { name, amount } = req.body;

    // Validação básica se os campos estiverem presentes
    if (name !== undefined && !name) {
      return res.status(400).json({ error: "Nome não pode ser vazio." });
    }
    if (amount !== undefined && (typeof amount !== "number" || amount < 0)) {
      return res.status(400).json({ error: "Valor deve ser um número positivo." });
    }

    const expense = await Expense.findByIdAndUpdate(
      req.params.expenseId,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!expense) {
      return res.status(404).json({ error: "Despesa não encontrada." });
    }
    
    res.json(expense);
  } catch (error) {
    console.error("Erro ao atualizar despesa:", error);
    res.status(400).json({ error: error.message || "Erro ao atualizar despesa." });
  }
});

// DELETE - Deletar despesa
router.delete("/expenses/:expenseId", async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.expenseId);
    
    if (!expense) {
      return res.status(404).json({ error: "Despesa não encontrada." });
    }
    
    res.json({ message: "Despesa deletada com sucesso." });
  } catch (error) {
    console.error("Erro ao deletar despesa:", error);
    res.status(500).json({ error: "Erro ao deletar despesa." });
  }
});

// GET - Overview de despesas
router.get("/expenses/overview", async (req, res) => {
  try {
    const { month, year } = req.query;
    
    const targetDate = new Date();
    if (month !== undefined && year !== undefined) {
      targetDate.setFullYear(parseInt(year), parseInt(month), 1);
    } else {
      // Default to next month for projected views if not specified? 
      // Actually, user wants to see "selected month". Let's default to CURRENT month.
      targetDate.setDate(1); 
    }

    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();

    const expenses = await Expense.find({ isActive: true });
    
    // Calcula despesas do período selecionado
    let periodExpenses = 0;
    let monthlyExpenses = 0;
    let oneTimeExpenses = 0;
    
    expenses.forEach((expense) => {
      if (expense.isActiveInMonth(targetYear, targetMonth)) {
        periodExpenses += expense.amount;
      }
      
      if (expense.type === "monthly") {
        monthlyExpenses += expense.amount;
      } else {
        oneTimeExpenses += expense.amount;
      }
    });
    
    // Busca receita do período selecionado (assinaturas ativas)
    // Para simplificar, usamos assinaturas ativas atuais
    const subscriptions = await BarbershopSubscription.find({ status: "active" });
    const periodRevenue = subscriptions.reduce((sum, sub) => sum + sub.monthlyPrice, 0);
    
    // Calcula lucro do período
    const periodProfit = periodRevenue - periodExpenses;
    
    res.json({
      nextMonthRevenue: periodRevenue,   // Chamamos de nextMonth mas agora é periodRevenue
      nextMonthExpenses: periodExpenses, // periodExpenses
      projectedProfit: periodProfit,     // periodProfit
      monthlyExpenses,
      oneTimeExpenses,
      totalExpenses: expenses.length,
      filterPeriod: { month: targetMonth, year: targetYear },
      expenses: expenses.map((exp) => ({
        _id: exp._id,
        name: exp.name,
        description: exp.description,
        amount: exp.amount,
        type: exp.type,
        category: exp.category,
        date: exp.date,
        startDate: exp.startDate,
        endDate: exp.endDate,
        isActive: exp.isActive,
        notes: exp.notes,
        isActiveInPeriod: exp.isActiveInMonth(targetYear, targetMonth)
      })),
    });
  } catch (error) {
    console.error("Erro ao buscar overview de despesas:", error);
    res.status(500).json({ error: "Erro ao buscar dados de despesas." });
  }
});

export default router;
