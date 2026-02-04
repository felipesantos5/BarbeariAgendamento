import jwt from "jsonwebtoken";
import Barbershop from "../models/Barbershop.js";
import "dotenv/config";

const JWT_SECRET = process.env.JWT_SECRET;
const AUTH_COOKIE_NAME = "adminAuthToken";

export const protectAdmin = (req, res, next) => {
  let token = null;

  // 1. Tenta pegar o token do Header Authorization
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  // 2. Se não encontrou no header, tenta pegar do Cookie
  //    (req.cookies só existe por causa do middleware cookie-parser)
  if (!token && req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
    token = req.cookies[AUTH_COOKIE_NAME];
  }

  // 3. Se encontrou o token (seja no header ou no cookie), verifica
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.adminUser = decoded; // Adiciona os dados do token ao req

      // Verificação opcional do barbershopId (continua igual)
      if (req.params.barbershopId && req.adminUser.barbershopId !== req.params.barbershopId) {
        return res.status(403).json({ error: "Acesso não autorizado para esta barbearia." });
      }

      next(); // Tudo certo, continua para a rota
    } catch (error) {
      // Se a verificação falhar (token inválido/expirado)
      // Limpa o cookie inválido (se ele veio do cookie)
      if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
        res.clearCookie(AUTH_COOKIE_NAME);
      }
      return res.status(401).json({ error: "Token inválido ou expirado. Acesso não autorizado." });
    }
  } else {
    return res.status(401).json({ error: "Token não fornecido. Acesso não autorizado." });
  }
};

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    // Verifica se existe um usuário autenticado e se a role dele está na lista de roles permitidas
    if (req.adminUser && allowedRoles.includes(req.adminUser.role)) {
      next(); // Permite o acesso se a função do usuário for uma das permitidas
    } else {
      res.status(403).json({ error: "Acesso proibido: permissões insuficientes." });
    }
  };
};

// Middleware para verificar se a conta da barbearia está ativa
export const checkAccountStatus = async (req, res, next) => {
  try {
    // Pega o barbershopId do token JWT (adicionado pelo protectAdmin)
    const barbershopId = req.adminUser?.barbershopId;

    if (!barbershopId) {
      return res.status(401).json({ error: "Barbearia não identificada." });
    }

    // Busca a barbearia no banco
    const barbershop = await Barbershop.findById(barbershopId).select("accountStatus isTrial trialEndsAt");

    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada." });
    }

    // Verifica se a conta está inativa
    if (barbershop.accountStatus === "inactive") {
      // Permite requisições GET (leitura) mesmo com conta inativa
      if (req.method === "GET") {
        return next();
      }

      // Bloqueia POST, PUT, DELETE, PATCH (modificação)
      return res.status(403).json({
        error: "Conta inativa",
        message: "Sua conta de teste expirou. Entre em contato para reativar ou assinar um plano.",
        accountStatus: "inactive",
        isTrial: barbershop.isTrial,
      });
    }

    // Se tudo estiver ok, continua
    next();
  } catch (error) {
    console.error("Erro ao verificar status da conta:", error);
    return res.status(500).json({ error: "Erro ao verificar status da conta." });
  }
};
