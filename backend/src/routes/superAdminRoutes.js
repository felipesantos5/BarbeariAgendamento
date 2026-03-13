import express from "express";
import Barbershop from "../models/Barbershop.js";
import Booking from "../models/Booking.js";
import AdminUser from "../models/AdminUser.js";
import Barber from "../models/Barber.js";
import Service from "../models/Service.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import { BarbershopCreationSchema } from "../validations/barbershopValidation.js";
import { z } from "zod";
import "dotenv/config";
import { timingSafeCompare } from "../utils/security.js";

const router = express.Router();
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;


// Calcula qual dia do trial a barbearia está
function calcularDiaDoTrial(trialEndsAt) {
  if (!trialEndsAt) return null;

  // Normaliza para início do dia (meia-noite) para cálculo consistente
  const agora = new Date();
  agora.setHours(0, 0, 0, 0);

  const fim = new Date(trialEndsAt);
  fim.setHours(0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  const diasRestantes = Math.round((fim - agora) / msPerDay);

  if (diasRestantes <= 0) return null; // expirado
  if (diasRestantes > 7) return 1; // edge case

  return 8 - diasRestantes; // Dia 1 a 7
}

// POST /api/superadmin/barbershops - Criar nova barbearia
router.post("/barbershops", async (req, res) => {
  try {
    // 1. Valida os dados usando o schema
    const data = BarbershopCreationSchema.parse(req.body);

    // 2. Separa os dados do admin dos dados da barbearia
    const { adminEmail, adminPassword, ...barbershopData } = data;

    // 3. Verifica se o email do admin já não está em uso
    const existingAdmin = await AdminUser.findOne({ email: adminEmail });
    if (existingAdmin) {
      return res.status(409).json({ error: "O email fornecido para o admin já está em uso." });
    }

    // 4. Cria a barbearia
    const newBarbershop = await Barbershop.create(barbershopData);
    
    // Converte para objeto e remove campos sensíveis antes de enviar ao front
    const barbershopResponse = newBarbershop.toObject();
    delete barbershopResponse.stripeAccountId;

    // 5. Cria o usuário Admin (dono)
    const adminData = {
      email: adminEmail,
      barbershop: newBarbershop._id,
      role: "admin",
    };

    if (adminPassword) {
      adminData.password = adminPassword; // A senha será hasheada pelo hook 'pre-save' do modelo
      adminData.status = "active";
    } else {
      adminData.status = "pending"; // Sem senha — usuário criará na primeira vez que logar
    }

    const newAdmin = await AdminUser.create(adminData);

    // 6. Responde com sucesso (omitindo dados sensíveis)
    res.status(201).json({
      barbershop: barbershopResponse,
      admin: {
        _id: newAdmin._id,
        email: newAdmin.email,
        role: newAdmin.role,
      },
    });
  } catch (e) {
    // Trata erros de validação do Zod
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: "Dados inválidos.", details: e.errors });
    }
    // Trata outros erros (ex: slug duplicado)
    res.status(400).json({ error: e.message || "Erro ao criar barbearia" });
  }
});

// GET /api/superadmin/barbershops-overview
router.get("/barbershops-overview", async (req, res) => {
  try {
    // Data de 7 dias atrás para agendamentos semanais
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const barbershops = await Barbershop.find({})
      .select("name slug accountStatus isTrial trialEndsAt createdAt isArchived")
      .sort({ createdAt: -1 })
      .lean();

    // Busca admins (role: admin) de cada barbearia para pegar o email
    const adminUsers = await AdminUser.find({ role: "admin" })
      .select("barbershop email")
      .lean();

    // Cria um mapa de barbershopId -> email do admin
    const adminEmailMap = {};
    for (const admin of adminUsers) {
      if (admin.barbershop) {
        adminEmailMap[admin.barbershop.toString()] = admin.email;
      }
    }

    // Agregação para contar agendamentos por barbearia (total e semanal)
    const bookingStats = await Booking.aggregate([
      {
        $group: {
          _id: "$barbershop",
          totalBookings: { $sum: 1 },
          weeklyBookings: {
            $sum: {
              $cond: [{ $gte: ["$time", sevenDaysAgo] }, 1, 0],
            },
          },
        },
      },
    ]);

    // Cria mapa de stats
    const statsMap = {};
    for (const stat of bookingStats) {
      statsMap[stat._id.toString()] = {
        totalBookings: stat.totalBookings,
        weeklyBookings: stat.weeklyBookings,
      };
    }

    // Monta resposta
    const barbershopsWithMetrics = barbershops.map((shop) => {
      const shopId = shop._id.toString();
      const stats = statsMap[shopId] || { totalBookings: 0, weeklyBookings: 0 };

      return {
        _id: shop._id,
        name: shop.name,
        slug: shop.slug,
        accountStatus: shop.accountStatus,
        isTrial: shop.isTrial,
        trialEndsAt: shop.trialEndsAt,
        isArchived: shop.isArchived || false,
        trialDayNumber: shop.isTrial ? calcularDiaDoTrial(shop.trialEndsAt) : null,
        createdAt: shop.createdAt,
        adminEmail: adminEmailMap[shopId] || null,
        metrics: {
          totalBookings: stats.totalBookings,
          weeklyBookings: stats.weeklyBookings,
        },
      };
    });

    // Calcula totais (Excluindo arquivadas)
    const activeShops = barbershops.filter(s => !s.isArchived);
    
    const totalBarbershops = activeShops.length;
    const totalBookings = bookingStats.reduce((acc, s) => acc + s.totalBookings, 0);
    const activeTrials = activeShops.filter(
      (s) => s.isTrial && s.accountStatus === "trial"
    ).length;
    const inactiveAccounts = activeShops.filter(
      (s) => s.accountStatus === "inactive"
    ).length;
    const totalArchived = barbershops.filter(s => s.isArchived).length;

    res.json({
      totalBarbershops,
      totalBookings,
      activeTrials,
      inactiveAccounts,
      totalArchived,
      barbershops: barbershopsWithMetrics,
    });
  } catch (error) {
    console.error("Erro ao buscar overview de barbearias:", error);
    res.status(500).json({ error: "Erro ao buscar dados das barbearias." });
  }
});

// DELETE /api/superadmin/barbershops/:barbershopId
router.delete("/barbershops/:barbershopId", async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "A senha do Super Admin é necessária para exclusão permanentemente." });
    }

    // Verifica a senha root
    const isValid = timingSafeCompare(password, ROOT_PASSWORD);
    if (!isValid) {
      return res.status(401).json({ error: "Senha do Super Admin incorreta. Operação cancelada." });
    }

    // Verifica se a barbearia existe
    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }

    // Proteção extra: não deletar se não estiver arquivada primeiro (opcional, mas recomendado)
    if (!barbershop.isArchived) {
      return res.status(400).json({ error: "Para deletar uma barbearia permanentemente, ela deve ser arquivada primeiro como medida de segurança." });
    }

    // Deleta todos os dados relacionados
    await Promise.all([
      Booking.deleteMany({ barbershop: barbershopId }),
      Barber.deleteMany({ barbershop: barbershopId }),
      Service.deleteMany({ barbershop: barbershopId }),
      Plan.deleteMany({ barbershop: barbershopId }),
      Subscription.deleteMany({ barbershop: barbershopId }),
      AdminUser.deleteMany({ barbershop: barbershopId }),
    ]);

    // Deleta a barbearia
    await Barbershop.findByIdAndDelete(barbershopId);

    res.json({ message: "Barbearia e todos os dados relacionados foram deletados permanentemente." });
  } catch (error) {
    console.error("Erro ao deletar barbearia:", error);
    res.status(500).json({ error: "Erro ao deletar barbearia." });
  }
});


// PATCH /api/superadmin/barbershops/:barbershopId/status - Gerenciar status e trial
router.patch("/barbershops/:barbershopId/status", async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { status, trialDays } = req.body;

    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }

    if (status === "trial") {
      const days = parseInt(trialDays);
      if (isNaN(days) || days <= 0) {
        return res.status(400).json({ error: "Número de dias de trial inválido." });
      }

      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + days);
      trialEndsAt.setHours(23, 59, 59, 999);

      barbershop.accountStatus = "trial";
      barbershop.isTrial = true;
      barbershop.trialEndsAt = trialEndsAt;
    } else if (status === "active") {
      barbershop.accountStatus = "active";
      barbershop.isTrial = false;
      barbershop.trialEndsAt = null;
    } else if (status === "inactive") {
      barbershop.accountStatus = "inactive";
    } else {
      return res.status(400).json({ error: "Status inválido." });
    }

    await barbershop.save();

    res.json({
      message: "Status atualizado com sucesso.",
      barbershop: {
        _id: barbershop._id,
        name: barbershop.name,
        accountStatus: barbershop.accountStatus,
        isTrial: barbershop.isTrial,
        trialEndsAt: barbershop.trialEndsAt,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar status da barbearia:", error);
    res.status(500).json({ error: "Erro ao atualizar status da barbearia." });
  }
});

// Mantém o toggle-status antigo por compatibilidade, mas agora ele apenas alterna entre active e inactive
router.patch("/barbershops/:barbershopId/toggle-status", async (req, res) => {
  try {
    const { barbershopId } = req.params;

    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }

    const newStatus = barbershop.accountStatus === "active" ? "inactive" : "active";
    
    barbershop.accountStatus = newStatus;
    if (newStatus === "active") {
      barbershop.isTrial = false;
      barbershop.trialEndsAt = null;
    }
    
    await barbershop.save();

    res.json({ 
      message: `Barbearia ${newStatus === "active" ? "ativada" : "desativada"} com sucesso.`,
      barbershop: {
        _id: barbershop._id,
        name: barbershop.name,
        accountStatus: barbershop.accountStatus,
      }
    });
  } catch (error) {
    console.error("Erro ao alterar status da barbearia:", error);
    res.status(500).json({ error: "Erro ao alterar status da barbearia." });
  }
});

// PATCH /api/superadmin/barbershops/:barbershopId/archive - Arquivar/Desarquivar barbearia
router.patch("/barbershops/:barbershopId/archive", async (req, res) => {
  try {
    const { barbershopId } = req.params;

    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }

    barbershop.isArchived = !barbershop.isArchived;
    await barbershop.save();

    res.json({
      message: `Barbearia ${barbershop.isArchived ? "arquivada" : "restaurada"} com sucesso.`,
      barbershop: {
        _id: barbershop._id,
        isArchived: barbershop.isArchived,
      },
    });
  } catch (error) {
    console.error("Erro ao arquivar barbearia:", error);
    res.status(500).json({ error: "Erro ao processar arquivamento." });
  }
});

export default router;
