import express from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import { timingSafeCompare } from "../utils/security.js";


const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;
const SUPER_ADMIN_COOKIE_NAME = "superAdminAuthToken";

// Rate limiter estrito para login do super admin (5 tentativas por 15 minutos)
const superAdminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 5,
  message: {
    error: "Muitas tentativas de login. Tente novamente em 15 minutos.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});





// POST /api/auth/superadmin/login
router.post("/login", superAdminLoginLimiter, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "Senha é obrigatória." });
    }

    if (!ROOT_PASSWORD) {
      console.error("ROOT_PASSWORD não configurada no ambiente");
      return res.status(500).json({ error: "Erro de configuração do servidor." });
    }

    // Comparação timing-safe
    const isValid = timingSafeCompare(password, ROOT_PASSWORD);

    if (!isValid) {
      return res.status(401).json({ error: "Senha incorreta." });
    }

    // Gera token JWT com 8 horas de expiração
    const token = jwt.sign(
      {
        isSuperAdmin: true,
        role: "superadmin",
      },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    // Define cookie HttpOnly
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie(SUPER_ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 8 * 60 * 60 * 1000, // 8 horas
    });

    res.json({
      message: "Login realizado com sucesso.",
      token,
    });
  } catch (error) {
    console.error("Erro no login do super admin:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// POST /api/auth/superadmin/logout
router.post("/logout", (req, res) => {
  res.clearCookie(SUPER_ADMIN_COOKIE_NAME);
  res.json({ message: "Logout realizado com sucesso." });
});

export default router;
