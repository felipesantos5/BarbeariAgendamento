import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Customer from "../models/Customer.js";
import { sendWhatsAppConfirmation } from "../services/evolutionWhatsapp.js";
import { otpLimiter, loginLimiter } from "../middleware/rateLimiting.js";

const router = express.Router();

// ROTA: POST /api/auth/customer/request-otp
// O cliente solicita um código de acesso
router.post("/request-otp", otpLimiter, async (req, res) => {
  try {
    const { phone, name } = req.body;
    if (!phone) {
      return res.status(400).json({ error: "O número de telefone é obrigatório." });
    }

    // Primeiro, verifica se o cliente já existe
    let customer = await Customer.findOne({ phone });

    if (!customer) {
      // Novo cliente: o nome é obrigatório
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "O nome é obrigatório para novos clientes." });
      }
      customer = new Customer({ phone, name: name.trim() });
    } else if (name && name.trim()) {
      // Cliente existente: atualiza o nome se um novo for fornecido
      customer.name = name.trim();
    }

    // Gera o OTP (o método já hasheia e define a expiração internamente)
    const otpToSend = customer.getOtp();
    await customer.save();

    // Envia o OTP via WhatsApp
    const message = `Olá! Seu código de acesso para a BarbeariAgendamento é: *${otpToSend}*`;
    await sendWhatsAppConfirmation(phone, message);

    res.status(200).json({
      success: true,
      message: "Código de acesso enviado para seu WhatsApp.",
    });
  } catch (error) {
    console.error("Erro ao solicitar OTP:", error);
    res.status(500).json({ error: "Erro interno ao solicitar código." });
  }
});

// ROTA: POST /api/auth/customer/verify-otp
// O cliente envia o código para fazer o login
router.post("/verify-otp", loginLimiter, async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ error: "Telefone e código são obrigatórios." });
    }

    // Encontra o cliente e verifica se o token não expirou
    const customer = await Customer.findOne({
      phone,
      otpExpires: { $gt: Date.now() }, // $gt = greater than (maior que agora)
    });

    if (!customer) {
      return res.status(401).json({ error: "Código inválido ou expirado. Tente novamente." });
    }

    // Compara o código enviado com o código hasheado no banco
    const isMatch = await bcrypt.compare(otp, customer.otpCode);
    if (!isMatch) {
      return res.status(401).json({ error: "Código inválido ou expirado. Tente novamente." });
    }

    // Limpa o OTP do banco para que não possa ser usado novamente
    customer.otpCode = undefined;
    customer.otpExpires = undefined;
    await customer.save();

    // Cria o token de acesso JWT para o cliente
    const payload = { id: customer._id, type: "customer" };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "90d", // Token de longa duração, como solicitado
    });

    // --- INÍCIO DA MELHORIA: ADICIONAR COOKIE HttpOnly ---
    const AUTH_COOKIE_NAME = "customerAuthToken"; // Nome diferente do cookie de admin

    const cookieOptions = {
      httpOnly: true, // Impede acesso via JavaScript no navegador
      secure: process.env.NODE_ENV === "production", // Usa 'secure' (HTTPS) apenas em produção
      sameSite: "Lax", // Proteção CSRF
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 dias
      path: "/", // Cookie acessível em todo o site
    };
    res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);

    res.status(200).json({
      success: true,
      message: "Login realizado com sucesso!",
      token,
      customer: {
        _id: customer._id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
      },
    });
  } catch (error) {
    console.error("Erro ao verificar OTP:", error);
    res.status(500).json({ error: "Erro interno ao verificar o código." });
  }
});

// ROTA: GET /api/auth/customer/me
// Retorna os dados completos do cliente autenticado
import { protectCustomer } from "../middleware/authCustomerMiddleware.js";

router.get("/me", protectCustomer, async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer._id);
    if (!customer) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }
    res.status(200).json(customer);
  } catch (error) {
    console.error("Erro ao buscar dados do cliente:", error);
    res.status(500).json({ error: "Erro interno ao buscar dados." });
  }
});

// ROTA: PUT /api/auth/customer/update-profile
// Permite ao cliente atualizar seus dados (email e data de nascimento)
router.put("/update-profile", protectCustomer, async (req, res) => {
  try {
    const { email, birthDate, name } = req.body;
    const customer = await Customer.findById(req.customer._id);

    if (!customer) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    if (email !== undefined) {
      const normalizedEmail = email.trim().toLowerCase();
      
      // Verifica se o email já está em uso por outro cliente
      if (normalizedEmail !== "") {
        const existingCustomer = await Customer.findOne({ 
          email: normalizedEmail,
          _id: { $ne: req.customer._id } 
        });

        if (existingCustomer) {
          return res.status(400).json({ error: "Este e-mail já está sendo usado por outra conta." });
        }
      }
      
      customer.email = normalizedEmail;
    }

    if (name !== undefined) customer.name = name.trim();
    if (birthDate !== undefined) customer.birthDate = birthDate;

    await customer.save();

    res.status(200).json({
      success: true,
      message: "Perfil atualizado com sucesso!",
      customer: {
        _id: customer._id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        birthDate: customer.birthDate,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar perfil do cliente:", error);
    res.status(500).json({ error: "Erro interno ao atualizar perfil." });
  }
});

export default router;
