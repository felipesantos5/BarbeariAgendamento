import jwt from "jsonwebtoken";
import Customer from "../models/Customer.js"; // Importe o modelo do Cliente

/**
 * Middleware para proteger rotas que exigem autenticação de um cliente.
 * Verifica o token JWT e anexa o usuário encontrado a `req.customer`.
 */
export const protectCustomer = async (req, res, next) => {
  let token;

  // 1. Verifica se o cabeçalho de autorização existe e começa com "Bearer"
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      // 2. Extrai o token do cabeçalho (formato: "Bearer TOKEN")
      token = req.headers.authorization.split(" ")[1];

      // 3. Verifica e decodifica o token usando o seu segredo
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 4. Busca o cliente no banco de dados pelo ID contido no token
      // O '.select("-password")' é uma boa prática caso você adicione senha no futuro
      req.customer = await Customer.findById(decoded.id).select("-password");

      if (!req.customer) {
        return res.status(401).json({ error: "Não autorizado, usuário não encontrado." });
      }

      // 5. Continua para a próxima função (a rota principal)
      next();
    } catch (error) {
      // Log apenas erros que não sejam token expirado (é esperado e normal)
      if (error.name !== "TokenExpiredError") {
        console.error("Erro na autenticação do token do cliente:", error);
      }
      return res.status(401).json({ error: "Não autorizado, token inválido." });
    }
  }

  if (!token) {
    return res.status(401).json({ error: "Não autorizado, nenhum token fornecido." });
  }
};
