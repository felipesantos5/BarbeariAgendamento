// src/routes/barberRoutes.js
import express from "express";
import mongoose from "mongoose";
import Barber from "../models/Barber.js";
import AdminUser from "../models/AdminUser.js";
import Booking from "../models/Booking.js";
import Service from "../models/Service.js";
import { barberCreationSchema, barberUpdateSchema } from "../validations/barberValidation.js";
import { z } from "zod";
import { startOfDay, endOfDay, parseISO, format as formatDateFns } from "date-fns";
import { protectAdmin, checkAccountStatus, requireRole } from "../middleware/authAdminMiddleware.js";
import { ptBR } from "date-fns/locale";
import crypto from "crypto";
import BlockedDay from "../models/BlockedDay.js";
import TimeBlock from "../models/TimeBlock.js";
import { sendAccountSetupEmail } from "../services/emailService.js";
import Barbershop from "../models/Barbershop.js";

import "dotenv/config";

const router = express.Router({ mergeParams: true }); // mergeParams é importante para acessar :barbershopId

const BRAZIL_TIMEZONE = "America/Sao_Paulo";

// Adicionar Barbeiro a uma Barbearia
// Rota: POST /barbershops/:barbershopId/barbers
router.post("/", protectAdmin, checkAccountStatus, requireRole("admin"), async (req, res) => {
  try {
    // ... (sua validação de autorização) ...
    const data = barberCreationSchema.parse(req.body);

    // Só verifica duplicidade de email se o email foi fornecido
    if (data.email) {
      const existingAdminUser = await AdminUser.findOne({ email: data.email });
      if (existingAdminUser) {
        return res.status(409).json({ error: "Este email já está em uso." });
      }
    }

    const newBarber = await Barber.create({
      name: data.name,
      image: data.image,
      availability: data.availability,
      break: data.break || {
        enabled: false,
        start: "12:00",
        end: "13:00",
        days: [],
      },
      commission: data.commission,
      barbershop: req.params.barbershopId,
    });

    // Se o email foi fornecido, cria a conta de login (AdminUser)
    if (data.email) {
      // ✅ GERAÇÃO DO TOKEN
      const setupToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(setupToken).digest("hex");

      // O token expira em, por exemplo, 72 horas
      const tokenExpiration = Date.now() + 72 * 60 * 60 * 1000;

      await AdminUser.create({
        email: data.email,
        role: "barber",
        barbershop: req.params.barbershopId,
        barberProfile: newBarber._id,
        status: "pending",
        accountSetupToken: hashedToken,
        accountSetupTokenExpires: new Date(tokenExpiration),
      });

      // ✅ Retorna o link de configuração para o admin frontend
      const setupLink = `${process.env.ADMIN_FRONTEND_URL}/configurar-senha/${setupToken}`;

      // 🆕 ENVIO AUTOMÁTICO DE EMAIL
      try {
        // Busca o nome da barbearia para personalizar o email
        const barbershop = await Barbershop.findById(req.params.barbershopId).select("name");
        const barbershopName = barbershop?.name || "nossa barbearia";

        // Envia o email com o link de configuração
        await sendAccountSetupEmail(data.email, setupToken, data.name, barbershopName);

        // Retorna sucesso com informação de que o email foi enviado
        res.status(201).json({
          barber: newBarber,
          setupLink: setupLink, // Mantém o link como fallback
          emailSent: true,
          message: `Funcionário criado com sucesso! Um email foi enviado para ${data.email} com instruções para configurar a senha.`,
        });
      } catch (emailError) {
        // Se o envio de email falhar, ainda retorna sucesso na criação do barbeiro
        // mas informa que o email não foi enviado
        console.error("⚠️ Erro ao enviar email, mas barbeiro foi criado:", emailError);

        res.status(201).json({
          barber: newBarber,
          setupLink: setupLink,
          emailSent: false,
          warning: "Funcionário criado, mas houve um erro ao enviar o email. Por favor, copie e envie o link manualmente.",
        });
      }
    } else {
      // Se não foi fornecido email, apenas cria o barbeiro sem conta de login
      res.status(201).json({
        barber: newBarber,
        message: "Funcionário criado com sucesso! Nenhuma conta de login foi criada pois o email não foi fornecido.",
      });
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: "Dados inválidos.", details: e.errors });
    }
    console.error("Erro ao criar funcionário:", e);
    res.status(500).json({ error: e.message || "Erro ao criar funcionário." });
  }
});

// Reenviar Email de Configuração de Senha
// Rota: POST /barbershops/:barbershopId/barbers/:barberId/resend-setup-email
router.post("/:barberId/resend-setup-email", protectAdmin, checkAccountStatus, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId, barberId } = req.params;

    // 1. Validação de Autorização
    if (req.adminUser.barbershopId !== barbershopId) {
      return res.status(403).json({
        error: "Não autorizado a reenviar email para funcionários desta barbearia.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(barberId)) {
      return res.status(400).json({ error: "ID do funcionário inválido." });
    }

    // 2. Buscar o barbeiro e verificar se existe
    const barber = await Barber.findOne({
      _id: barberId,
      barbershop: barbershopId,
    });

    if (!barber) {
      return res.status(404).json({ error: "Funcionário não encontrado nesta barbearia." });
    }

    // 3. Buscar a conta AdminUser associada
    const adminUser = await AdminUser.findOne({
      barberProfile: barberId,
      barbershop: barbershopId,
    });

    if (!adminUser) {
      return res.status(404).json({ error: "Conta de login não encontrada para este funcionário." });
    }

    // 4. Verificar se a conta já está ativa
    if (adminUser.status === "active") {
      return res.status(400).json({
        error: "Este funcionário já configurou sua senha e está com a conta ativa.",
        info: "Não é necessário reenviar o email de configuração.",
      });
    }

    // 5. Gerar novo token de configuração
    const setupToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(setupToken).digest("hex");
    const tokenExpiration = Date.now() + 72 * 60 * 60 * 1000; // 72 horas

    // 6. Atualizar o token no banco de dados
    adminUser.accountSetupToken = hashedToken;
    adminUser.accountSetupTokenExpires = new Date(tokenExpiration);
    await adminUser.save();

    // 7. Buscar o nome da barbearia para personalizar o email
    const barbershop = await Barbershop.findById(barbershopId).select("name");
    const barbershopName = barbershop?.name || "nossa barbearia";

    // 8. Enviar o email
    try {
      await sendAccountSetupEmail(adminUser.email, setupToken, barber.name, barbershopName);

      res.status(200).json({
        success: true,
        message: `Email de configuração reenviado com sucesso para ${adminUser.email}`,
        emailSent: true,
      });
    } catch (emailError) {
      console.error("⚠️ Erro ao reenviar email:", emailError);

      // Retorna o link como fallback
      const setupLink = `${process.env.ADMIN_FRONTEND_URL}/configurar-senha/${setupToken}`;

      res.status(200).json({
        success: true,
        message: "Novo token gerado, mas houve erro ao enviar o email.",
        emailSent: false,
        setupLink: setupLink,
        warning: "Por favor, copie e envie o link manualmente para o funcionário.",
      });
    }
  } catch (e) {
    console.error("Erro ao reenviar email de configuração:", e);
    res.status(500).json({ error: "Erro interno ao reenviar email de configuração." });
  }
});

// Listar Barbeiros de uma Barbearia
// Rota: GET /barbershops/:barbershopId/barbers
router.get("/", async (req, res) => {
  try {
    const barbershopId = new mongoose.Types.ObjectId(req.params.barbershopId);

    const barbers = await Barber.aggregate([
      // 1. Encontra todos os barbeiros que pertencem a esta barbearia
      {
        $match: { barbershop: barbershopId },
      },
      // 2. Faz o "JOIN" com a coleção 'adminusers'
      {
        $lookup: {
          from: "adminusers",
          localField: "_id",
          foreignField: "barberProfile",
          as: "loginInfo",
        },
      },
      {
        $unwind: {
          path: "$loginInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
    ]);

    // Sanitiza os dados dependendo da autenticação
    // Nota: protectAdmin não foi usado como middleware global, então verificamos o token manualmente se disponível
    // ou apenas removemos campos sensíveis por padrão para esta rota pública.
    
    const sanitizedBarbers = barbers.map(barber => {
      const baseInfo = {
        _id: barber._id,
        name: barber.name,
        image: barber.image,
        availability: barber.availability,
        break: barber.break
      };
      
      // Se você quiser que o admin veja mais, precisaria de uma lógica de auth aqui.
      // Por simplicidade e segurança total da rota pública, removemos sempre comissão e email.
      // Se o admin precisar desses dados, ele deve usar uma rota específica autenticada.
      return baseInfo;
    });

    res.json(sanitizedBarbers);
  } catch (e) {
    console.error("Erro ao buscar funcionários:", e);
    res.status(500).json({ error: "Erro ao buscar funcionários." });
  }
});

// Rota: GET /barbershops/:barbershopId/barbers/:barberId/free-slots
router.get("/:barberId/free-slots", async (req, res) => {
  try {
    const { date } = req.query;
    const serviceId = req.query.serviceId;

    const { barberId, barbershopId } = req.params;

    const requestedDate = new Date(date);
    // Adiciona o fuso horário para evitar problemas de "um dia antes"
    requestedDate.setMinutes(requestedDate.getMinutes() + requestedDate.getTimezoneOffset());

    const dayIsBlocked = await BlockedDay.findOne({
      barbershop: barbershopId,
      date: { $gte: startOfDay(requestedDate), $lte: endOfDay(requestedDate) },
      // Verifica se o dia está bloqueado para a loja toda (barber: null)
      // OU para este barbeiro específico ($in: [null, barberId])
      barber: { $in: [null, barberId] },
    });

    if (dayIsBlocked) {
      return res.json({
        isBlocked: true,
        reason: dayIsBlocked.reason || "Dia indisponível para agendamento.",
        slots: [],
      });
    }

    // Buscar o serviço para obter a duração
    const serviceDoc = await Service.findById(serviceId).lean();
    if (!serviceDoc) return res.status(404).json({ error: "Serviço não encontrado." });
    const serviceDuration = serviceDoc.duration;
    if (isNaN(serviceDuration) || serviceDuration <= 0) return res.status(400).json({ error: "Duração do serviço inválida." });

    const barber = await Barber.findById(barberId).lean();
    if (!barber || barber.barbershop.toString() !== barbershopId) {
      /* ... erro ... */
    }

    // selectedDateInput é "YYYY-MM-DD"
    // parseISO cria uma data UTC à meia-noite desse dia.
    // Ex: "2025-06-10" -> 2025-06-10T00:00:00.000Z
    const dateObjectFromQuery = parseISO(date);

    const tempDateForDayName = new Date(`${date}T12:00:00`);
    const dayOfWeekName = formatDateFns(tempDateForDayName, "EEEE", {
      locale: ptBR,
    });

    const workHours = barber.availability.find((a) => a.day.toLowerCase() === dayOfWeekName.toLowerCase());
    if (!workHours) return res.json([]);

    const allLocalSlots = [];
    const [startWorkHour, startWorkMinute] = workHours.start.split(":").map(Number);
    const [endWorkHour, endWorkMinute] = workHours.end.split(":").map(Number);
    const slotInterval = 15;

    let currentHour = startWorkHour;
    let currentMinute = startWorkMinute;

    while (true) {
      const slotEndHour = currentHour + Math.floor((currentMinute + serviceDuration - 1) / 60); // Hora que o serviço terminaria
      const slotEndMinute = ((currentMinute + serviceDuration - 1) % 60) + 1; // Minuto que o serviço terminaria

      // Verifica se o fim do serviço ultrapassa o fim do expediente
      if (slotEndHour > endWorkHour || (slotEndHour === endWorkHour && slotEndMinute > endWorkMinute)) {
        break;
      }

      const timeString = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;
      allLocalSlots.push(timeString);

      currentMinute += slotInterval;
      while (currentMinute >= 60) {
        // Use while para caso o intervalo seja > 60
        currentHour++;
        currentMinute -= 60;
      }
      // Para o loop se a próxima hora de início já ultrapassa o limite
      if (currentHour > endWorkHour || (currentHour === endWorkHour && currentMinute >= endWorkMinute)) {
        break;
      }
    }

    // Agendamentos existentes (armazenados em UTC)
    const existingBookings = await Booking.find({
      barber: barberId,
      barbershop: barbershopId,
      // Usamos dateObjectFromQuery que é meia-noite UTC para startOfDay e endOfDay
      time: {
        $gte: startOfDay(dateObjectFromQuery),
        $lt: endOfDay(dateObjectFromQuery),
      },
      status: { $ne: "canceled" },
    })
      .populate("service", "duration")
      .lean();

    const timeBlocks = await TimeBlock.find({
      barber: barberId,
      // A busca precisa encontrar blocos que *se sobrepõem* ao dia, não apenas que começam nele
      startTime: { $lt: endOfDay(dateObjectFromQuery) },
      endTime: { $gt: startOfDay(dateObjectFromQuery) },
    }).lean();

    // bookedIntervalsLocal: Array de objetos { start: string HH:mm, end: string HH:mm } no horário local
    const bookedIntervalsLocal = existingBookings.map((booking) => {
      // bookedTimeIsUTC é o objeto Date do banco (UTC)
      const bookedTimeIsUTC = booking.time;
      const localBookingStartTimeStr = new Date(bookedTimeIsUTC).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: BRAZIL_TIMEZONE,
      });

      const bookingDuration = booking.service?.duration || slotInterval;

      const [bookedStartH, bookedStartM] = localBookingStartTimeStr.split(":").map(Number);

      let bookedEndH = bookedStartH;
      let bookedEndM = bookedStartM + bookingDuration;
      while (bookedEndM >= 60) {
        bookedEndH++;
        bookedEndM -= 60;
      }
      // Garantir que a hora não passe de 23 (embora improvável para durações normais)
      bookedEndH = bookedEndH % 24;

      const localBookingEndTimeStr = `${String(bookedEndH).padStart(2, "0")}:${String(bookedEndM).padStart(2, "0")}`;

      return { start: localBookingStartTimeStr, end: localBookingEndTimeStr };
    });

    timeBlocks.forEach((block) => {
      // Converte o startTime (UTC) do bloqueio para uma string de hora local "HH:mm"
      const localBlockStartTimeStr = new Date(block.startTime).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: BRAZIL_TIMEZONE,
      });

      // Converte o endTime (UTC) do bloqueio para uma string de hora local "HH:mm"
      const localBlockEndTimeStr = new Date(block.endTime).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: BRAZIL_TIMEZONE,
      });

      // Adiciona o intervalo do bloqueio à lista de indisponíveis
      bookedIntervalsLocal.push({
        start: localBlockStartTimeStr,
        end: localBlockEndTimeStr,
      });
    });

    // ✅ NOVA LÓGICA: Adicionar horário de break se habilitado
    if (barber.break?.enabled && barber.break.days?.length > 0) {
      // Verifica se o dia atual está nos dias configurados para break
      const dayHasBreak = barber.break.days.some((breakDay) => breakDay.toLowerCase() === dayOfWeekName.toLowerCase());

      if (dayHasBreak) {
        // Adiciona o horário de break como um intervalo bloqueado
        bookedIntervalsLocal.push({
          start: barber.break.start,
          end: barber.break.end,
        });
      }
    }

    const slotsWithStatus = [];

    for (const potentialStartSlot of allLocalSlots) {
      // "09:00", "09:15", etc. (local)
      const [startSlotH, startSlotM] = potentialStartSlot.split(":").map(Number);

      let endSlotH = startSlotH;
      let endSlotM = startSlotM + serviceDuration;
      while (endSlotM >= 60) {
        endSlotH++;
        endSlotM -= 60;
      }
      endSlotH = endSlotH % 24;
      const potentialEndSlot = `${String(endSlotH).padStart(2, "0")}:${String(endSlotM).padStart(2, "0")}`;

      let hasConflict = false;
      for (const booked of bookedIntervalsLocal) {
        // Comparação de strings de horário "HH:mm"
        // Conflito se: (InícioSlot < FimBooked) E (FimSlot > InícioBooked)
        if (potentialStartSlot < booked.end && potentialEndSlot > booked.start) {
          hasConflict = true;
          break;
        }
      }

      if (!hasConflict) {
        slotsWithStatus.push({
          time: potentialStartSlot,
          isBooked: false,
        });
      }
    }

    res.json({
      slots: slotsWithStatus,
    });
  } catch (error) {
    console.error("Erro ao buscar status dos horários:", error);
    res.status(500).json({ error: "Erro interno ao processar a solicitação." });
  }
});

router.get("/bookings/barber", protectAdmin, checkAccountStatus, async (req, res) => {
  try {
    const { role, barberProfileId, barbershopId } = req.adminUser; // Dados do token JWT

    let query = { barbershop: new mongoose.Types.ObjectId(barbershopId) };

    // Se a função for 'barber', adiciona o filtro para pegar apenas os agendamentos dele
    if (role === "barber") {
      if (!barberProfileId || !mongoose.Types.ObjectId.isValid(barberProfileId)) {
        return res.status(400).json({
          error: "Perfil de barbeiro inválido ou não associado a este usuário.",
        });
      }
      query.barber = new mongoose.Types.ObjectId(barberProfileId);
    }
    // Se a função for 'admin', o query buscará todos os agendamentos da barbearia

    const bookings = await Booking.find(query)
      .populate("barber", "name")
      .populate("service", "name price")
      .populate("customer", "name phone whatsapp") // Incluindo 'whatsapp' se existir
      .sort({ time: 1 })
      .lean(); // Read-only query optimization

    res.json(bookings);
  } catch (error) {
    console.error("Erro ao buscar agendamentos do usuário:", error);
    res.status(500).json({ error: "Erro interno ao buscar agendamentos." });
  }
});

// Rota: PUT /barbershops/:barbershopId/barbers/:barberId
router.put("/:barberId", protectAdmin, checkAccountStatus, async (req, res) => {
  try {
    const { barbershopId, barberId } = req.params;

    // 1. Validação de Autorização
    if (req.adminUser.barbershopId !== barbershopId) {
      return res.status(403).json({
        error: "Não autorizado a modificar funcionários desta barbearia.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(barberId)) {
      return res.status(400).json({ error: "ID do funcionário inválido." });
    }

    // 2. Validação dos Dados Recebidos (agora inclui 'email')
    const validatedData = barberUpdateSchema.parse(req.body);

    // Separa o email dos outros dados do barbeiro
    const { email, ...barberData } = validatedData;

    // 3. Atualização do Modelo Barber (nome, comissão, horários, etc.)
    const updatedBarber = await Barber.findOneAndUpdate(
      { _id: barberId, barbershop: barbershopId }, // Condição
      barberData, // Atualiza apenas dados do barbeiro
      { new: true, runValidators: true }
    );

    if (!updatedBarber) {
      return res.status(404).json({ error: "Funcionário não encontrado nesta barbearia." });
    }

    let updatedEmail = undefined;

    // 4. Se um 'email' foi enviado no body, atualiza o AdminUser
    if (email) {
      // 4a. Verifica se o novo email já está em uso por OUTRO usuário
      const existingUser = await AdminUser.findOne({
        email: email,
        barberProfile: { $ne: barberId }, // $ne = "diferente de"
      });

      if (existingUser) {
        return res.status(409).json({ error: "Este email já está em uso por outra conta." });
      }

      // 4b. Atualiza o email na conta de login (AdminUser)
      const updatedAdminUser = await AdminUser.findOneAndUpdate(
        { barberProfile: barberId, barbershop: barbershopId },
        { $set: { email: email } },
        { new: true }
      );

      if (updatedAdminUser) {
        updatedEmail = updatedAdminUser.email;
      } else {
        // Isso é um estado inesperado (Barbeiro existe mas AdminUser não)
        console.warn(`[PUT /barberId] Barbeiro ${barberId} encontrado, mas AdminUser associado não.`);
      }
    }

    // 5. Busca o email final (seja o novo ou o antigo) para retornar ao frontend
    if (!updatedEmail) {
      const adminUser = await AdminUser.findOne({ barberProfile: barberId }).select("email").lean();
      updatedEmail = adminUser ? adminUser.email : undefined;
    }

    // Combina os dados atualizados do barbeiro com o email
    const response = {
      ...updatedBarber.toObject(),
      email: updatedEmail,
    };

    res.json(response);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({
        error: "Dados inválidos para atualização do funcionário.",
        details: e.errors,
      });
    }
    console.error("Erro ao atualizar funcionário:", e);
    res.status(500).json({ error: "Erro interno ao atualizar o funcionário." });
  }
});

// Rota: DELETE /barbershops/:barbershopId/barbers/:barberId
router.delete("/:barberId", protectAdmin, checkAccountStatus, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId, barberId } = req.params;

    // 1. Validação de Autorização
    if (req.adminUser.barbershopId !== barbershopId) {
      return res.status(403).json({
        error: "Não autorizado a deletar funcionários desta barbearia.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(barberId)) {
      return res.status(400).json({ error: "ID do funcionário inválido." });
    }

    // Opcional: Verificar se o barbeiro tem agendamentos futuros não cancelados antes de deletar
    const futureBookings = await Booking.findOne({
      barber: barberId,
      time: { $gte: new Date() },
      status: { $ne: "canceled" }, // Ignora agendamentos cancelados
    });

    if (futureBookings) {
      return res.status(400).json({
        error: "Não é possível deletar. Este funcionário possui agendamentos futuros não cancelados.",
      });
    }

    // 2. Deleção Segura no Banco
    const deletedBarber = await Barber.findOneAndDelete({
      _id: barberId,
      barbershop: barbershopId, // Garante que só deleta o funcionário da barbearia correta
    });

    if (!deletedBarber) {
      return res.status(404).json({ error: "Funcionário não encontrado nesta barbearia." });
    }

    // 3. ✅ IMPORTANTE: Deletar também o AdminUser associado para liberar o email
    try {
      const deletedAdminUser = await AdminUser.findOneAndDelete({
        barberProfile: barberId,
        barbershop: barbershopId,
      });
    } catch (adminUserError) {
      // Loga o erro mas não bloqueia a deleção do barbeiro
      console.error("⚠️ Erro ao deletar conta de login do barbeiro:", adminUserError);
    }

    res.json({
      message: "Funcionário deletado com sucesso.",
      barberId: deletedBarber._id,
    });
  } catch (e) {
    console.error("Erro ao deletar funcionário:", e);
    res.status(500).json({ error: "Erro interno ao deletar o funcionário." });
  }
});

export default router;
