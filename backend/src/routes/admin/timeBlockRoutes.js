import express from "express";
import TimeBlock from "../../models/TimeBlock.js";
import Booking from "../../models/Booking.js";
import { protectAdmin } from "../../middleware/authAdminMiddleware.js";

const router = express.Router({ mergeParams: true });
router.use(protectAdmin); // Protege todas as rotas deste arquivo

// Rota para CRIAR um novo bloqueio
router.post("/", async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { title, startTime, endTime, barberId } = req.body;

    if (!startTime || !endTime || !barberId) {
      return res
        .status(400)
        .json({ error: "Os campos de horário e profissional são obrigatórios." });
    }

    const startBlock = new Date(startTime);
    const endBlock = new Date(endTime);

    const conflictingBookings = await Booking.find({
      barber: barberId,
      status: { $nin: ["canceled"] },
      time: { $lt: endBlock },
    }).populate("service", "duration");

    for (const booking of conflictingBookings) {
      const duration = booking.service?.duration || 60;
      const bookingEndTime = new Date(
        new Date(booking.time).getTime() + duration * 60000
      );
      if (bookingEndTime > startBlock) {
        return res
          .status(409)
          .json({ error: `Conflito: já existe um agendamento neste período.` });
      }
    }

    const newBlock = await TimeBlock.create({
      title,
      startTime: startBlock,
      endTime: endBlock,
      barber: barberId,
      barbershop: barbershopId,
    });
    res.status(201).json(newBlock);
  } catch (error) {
    console.error("Erro ao criar bloqueio:", error);
    res.status(500).json({ error: "Falha ao criar bloqueio." });
  }
});

// Rota para LISTAR todos os bloqueios (geralmente por período, para a agenda)
router.get("/", async (req, res) => {
  try {
    const { barbershopId } = req.params;
    // Busca bloqueios para a barbearia inteira. O frontend filtrará por barbeiro se necessário.
    const blocks = await TimeBlock.find({ barbershop: barbershopId });
    res.status(200).json(blocks);
  } catch (error) {
    res.status(500).json({ error: "Falha ao buscar bloqueios." });
  }
});

// Rota para DELETAR um bloqueio
router.delete("/:blockId", async (req, res) => {
  try {
    await TimeBlock.findByIdAndDelete(req.params.blockId);
    res.status(200).json({ success: true, message: "Bloqueio removido." });
  } catch (error) {
    res.status(500).json({ error: "Falha ao remover bloqueio." });
  }
});

export default router;
