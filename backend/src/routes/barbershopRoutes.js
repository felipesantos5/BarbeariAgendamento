import express from "express";
import Barbershop from "../models/Barbershop.js";
import { BarbershopCreationSchema, BarbershopUpdateSchema } from "../validations/barbershopValidation.js";
import AdminUser from "../models/AdminUser.js";
import { requireRole } from "../middleware/authAdminMiddleware.js";
import { protectAdmin } from "../middleware/authAdminMiddleware.js";
import qrcode from "qrcode";
import { z } from "zod";

const router = express.Router();

// CRIAÇÃO
router.post("/", async (req, res) => {
  try {
    // 1. Usa o novo schema que valida os dados do admin
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

    // 5. Cria o usuário Admin (dono)
    const newAdmin = await AdminUser.create({
      email: adminEmail,
      password: adminPassword, // A senha será hasheada pelo hook 'pre-save' do modelo
      barbershop: newBarbershop._id, // Associa o admin à barbearia
      role: "admin", // Define a permissão
      status: "active", // Já define como ativo, pois a senha foi criada
    });

    // 6. Responde com sucesso (omitindo dados sensíveis)
    res.status(201).json({
      barbershop: newBarbershop,
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
    res.status(400).json({ error: e.errors || e.message });
  }
});

// LISTAR TODAS
router.get("/", async (_req, res) => {
  res.json(await Barbershop.find());
});

// ROTA POR SLUG
router.get("/slug/:slug", async (req, res) => {
  try {
    const barbershop = await Barbershop.findOne({ slug: req.params.slug });
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada" });
    }
    
    // Verifica se a conta está inativa
    if (barbershop.accountStatus === "inactive") {
      return res.status(403).json({ 
        error: "Esta barbearia está temporariamente indisponível",
        accountStatus: "inactive"
      });
    }
    
    res.json(barbershop);
  } catch (e) {
    res.status(400).json({ error: "Erro na busca pela barbearia" });
  }
});

// LISTAR POR ID
router.get("/:id", async (req, res) => {
  try {
    const barbershop = await Barbershop.findById(req.params.id);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada" });
    }
    res.json(barbershop);
  } catch (e) {
    res.status(400).json({ error: "ID inválido" });
  }
});

// EDITAR (PUT)
router.put("/:id", protectAdmin, requireRole("admin"), async (req, res) => {
  try {
    const data = BarbershopUpdateSchema.parse(req.body);
    const updated = await Barbershop.findByIdAndUpdate(req.params.id, { $set: data }, { new: true, runValidators: true });
    if (!updated) {
      return res.status(404).json({ error: "Barbearia não encontrada" });
    }
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.errors || e.message });
  }
});

// DELETAR POR ID
router.delete("/:id", protectAdmin, requireRole("admin"), async (req, res) => {
  try {
    const deleted = await Barbershop.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Barbearia não encontrada" });
    }
    res.json({ message: "Barbearia removida com sucesso" });
  } catch (e) {
    res.status(400).json({ error: "ID inválido" });
  }
});

router.get("/:barbershopId/location", async (req, res) => {
  try {
    const { barbershopId } = req.params;

    // 1. Busca a barbearia pelo ID
    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop) {
      return res.status(404).send("Barbearia não encontrada.");
    }

    // 2. Monta o endereço completo a partir dos dados do banco
    const { rua, numero, bairro, cidade, estado } = barbershop.address;
    const fullAddress = `${rua}, ${numero}, ${bairro}, ${cidade}, ${estado}`;

    // 3. Cria o link do Google Maps
    const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

    // 4. Redireciona o usuário para o Google Maps
    res.redirect(302, googleMapsLink);
  } catch (error) {
    console.error("Erro ao redirecionar para localização:", error);
    res.status(500).send("Erro ao processar sua solicitação.");
  }
});

router.get("/:barbershopId/qrcode", async (req, res) => {
  try {
    const { barbershopId } = req.params;

    // Busca a barbearia para obter o slug
    const barbershop = await Barbershop.findById(barbershopId).lean();

    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }

    // Monta a URL que será embutida no QR Code
    const urlToEncode = `https://www.barbeariagendamento.com.br/${barbershop.slug}`;

    // Gera o QR Code como um buffer de imagem PNG
    const qrCodeBuffer = await qrcode.toBuffer(urlToEncode, {
      type: "png",
      errorCorrectionLevel: "H", // Alta correção de erros, bom para impressão
      margin: 2,
      color: {
        dark: "#000000", // Cor dos pontos
        light: "#FFFFFF", // Cor do fundo
      },
    });

    // Envia a imagem diretamente como resposta da API
    res.setHeader("Content-Type", "image/png");
    res.send(qrCodeBuffer);
  } catch (error) {
    console.error("Erro ao gerar QR Code:", error);
    res.status(500).json({ error: "Falha ao gerar QR Code." });
  }
});

export default router;
