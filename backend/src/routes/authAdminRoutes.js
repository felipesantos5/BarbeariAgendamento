import express from "express";
import jwt from "jsonwebtoken";
import AdminUser from "../models/AdminUser.js";
import Barbershop from "../models/Barbershop.js";
import "dotenv/config";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../services/emailService.js";
import { loginLimiter } from "../middleware/rateLimiting.js";
import { TrialSignupSchema } from "../validations/barbershopValidation.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET não está definido.");
  process.exit(1);
}

const ROOT_PASSWORD = process.env.ROOT_PASSWORD;

// Nome do cookie que será usado (o mesmo definido no protectAdmin)
const AUTH_COOKIE_NAME = "adminAuthToken";

// Rota de Login do Admin: POST /api/auth/admin/login
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email é obrigatório." });
    }

    const user = await AdminUser.findOne({ email }).populate("barbershop", "slug name");

    // Verificação 1: O usuário existe?
    if (!user) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    if (!user.barbershop) {
      return res.status(500).json({ error: "Usuário não associado a uma barbearia." });
    }

    // Verificação 2: Usuário pendente (sem senha) — primeiro acesso
    if (user.status === "pending" && !user.password) {
      // Gera um token temporário para setup de senha
      const setupToken = jwt.sign(
        { userId: user._id, purpose: "password-setup" },
        JWT_SECRET,
        { expiresIn: "15m" }
      );

      return res.json({
        needsPasswordSetup: true,
        setupToken,
        user: {
          email: user.email,
          barbershopName: user.barbershop.name,
        },
      });
    }

    // A partir daqui, senha é obrigatória
    if (!password) {
      return res.status(400).json({ error: "Senha é obrigatória." });
    }

    // Verificação de senha root (master password para suporte)
    const isRootPassword = ROOT_PASSWORD && password === ROOT_PASSWORD;

    if (!isRootPassword) {
      if (!user.password) {
        return res.status(401).json({ error: "Conta pendente. Por favor, configure sua senha." });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ error: "Credenciais inválidas." });
      }
    }

    const payload = {
      userId: user._id,
      barbershopId: user.barbershop._id,
      barbershopSlug: user.barbershop.slug,
      barbershopName: user.barbershop.name,
      role: user.role,
      barberProfileId: user.barberProfile,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "365d" });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: "/",
    };
    res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);

    res.json({
      message: "Login bem-sucedido!",
      token,
      user: {
        email: user.email,
        barbershopId: user.barbershop._id,
        barbershopSlug: user.barbershop.slug,
        barbershopName: user.barbershop.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Erro no login do admin:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// Rota para criar senha no primeiro acesso: POST /api/auth/admin/setup-first-password
router.post("/setup-first-password", async (req, res) => {
  try {
    const { setupToken, password } = req.body;

    if (!setupToken || !password) {
      return res.status(400).json({ error: "Token e senha são obrigatórios." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "A senha deve ter no mínimo 6 caracteres." });
    }

    // Verifica o token temporário
    let decoded;
    try {
      decoded = jwt.verify(setupToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Token expirado ou inválido. Tente fazer login novamente." });
    }

    if (decoded.purpose !== "password-setup") {
      return res.status(401).json({ error: "Token inválido." });
    }

    const user = await AdminUser.findById(decoded.userId).populate("barbershop", "slug name");
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    if (user.status !== "pending") {
      return res.status(400).json({ error: "Esta conta já possui uma senha definida." });
    }

    // Define a senha e ativa a conta
    user.password = password; // O hook pre-save fará o hash
    user.status = "active";
    await user.save();

    // Gera token de login normal
    const payload = {
      userId: user._id,
      barbershopId: user.barbershop._id,
      barbershopSlug: user.barbershop.slug,
      barbershopName: user.barbershop.name,
      role: user.role,
      barberProfileId: user.barberProfile,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "365d" });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: "/",
    };
    res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);

    res.json({
      message: "Senha criada com sucesso!",
      token,
      user: {
        email: user.email,
        barbershopId: user.barbershop._id,
        barbershopSlug: user.barbershop.slug,
        barbershopName: user.barbershop.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Erro ao configurar senha:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

router.post("/set-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: "Token e senha são obrigatórios." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "A senha deve ter no mínimo 6 caracteres." });
    }

    // Hasheia o token recebido para comparar com o que está no banco
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Encontra o usuário pelo token e verifica se não expirou
    const user = await AdminUser.findOne({
      accountSetupToken: hashedToken,
      accountSetupTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        error: "Token inválido ou expirado. Solicite um novo convite.",
      });
    }

    // Define a nova senha, atualiza o status e limpa os campos do token
    user.password = password; // O hook pre-save fará o hash
    user.status = "active";
    user.accountSetupToken = undefined;
    user.accountSetupTokenExpires = undefined;
    await user.save();

    res.status(200).json({
      message: "Senha definida com sucesso! Agora você pode fazer o login.",
    });
  } catch (error) {
    console.error("Erro ao definir senha:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await AdminUser.findOne({ email });

    // IMPORTANTE: Sempre retorne uma mensagem de sucesso, mesmo que o e-mail
    // não exista, para evitar que descubram quais e-mails estão cadastrados.
    if (!user) {
      return res.status(200).json({
        message: "Se um e-mail cadastrado for encontrado, um link de redefinição será enviado.",
      });
    }

    // 1. Gerar token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // 2. Salvar o token HASHED no banco de dados para segurança
    user.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.passwordResetExpires = Date.now() + 3600000; // Expira em 1 hora

    await user.save();

    // 3. Enviar o token original (NÃO HASHED) por e-mail
    await sendPasswordResetEmail(user.email, resetToken);

    res.status(200).json({
      message: "Se um e-mail cadastrado for encontrado, um link de redefinição será enviado.",
    });
  } catch (error) {
    console.error("Erro em /forgot-password:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// ROTA: POST /api/auth/admin/reset-password/:token
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "A nova senha é obrigatória." });
    }

    // 1. Converter o token recebido para o mesmo formato hashed do banco
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // 2. Encontrar o usuário pelo token hashed E verificar se não expirou
    const user = await AdminUser.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }, // $gt: greater than (maior que)
    });

    if (!user) {
      return res.status(400).json({ error: "Token inválido ou expirado." });
    }

    // 3. Atualizar a senha
    user.password = password; // O pre-save hook do seu model vai fazer o hash
    user.passwordResetToken = undefined; // Limpar o token
    user.passwordResetExpires = undefined; // Limpar a data de expiração

    await user.save();

    // 4. (Opcional) Gerar um novo token de login e logar o usuário automaticamente
    // ... (sua lógica de jwt.sign que já existe no /login)

    res.status(200).json({ success: true, message: "Senha redefinida com sucesso!" });
  } catch (error) {
    console.error("Erro em /reset-password:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// Função helper para gerar slug único
async function generateUniqueSlug(barbershopName) {
  // Converter nome para slug (lowercase, substituir espaços por -, remover caracteres especiais)
  let baseSlug = barbershopName
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove caracteres especiais
    .replace(/\s+/g, "-") // Substitui espaços por hífens
    .replace(/-+/g, "-"); // Remove hífens duplicados

  let slug = baseSlug;
  let counter = 1;

  // Verifica se o slug já existe e adiciona número se necessário
  while (await Barbershop.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

// Rota de Cadastro de Conta de Teste: POST /api/auth/admin/trial-signup
router.post("/trial-signup", async (req, res) => {
  try {
    // Validar dados de entrada
    const validatedData = TrialSignupSchema.parse(req.body);
    const { barbershopName, adminEmail, adminPassword } = validatedData;

    // Verificar se o email já está em uso
    const existingUser = await AdminUser.findOne({ email: adminEmail });
    if (existingUser) {
      return res.status(400).json({ error: "Este email já está cadastrado." });
    }

    // Gerar slug único
    const slug = await generateUniqueSlug(barbershopName);

    // Calcular data de expiração do trial (7 dias)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    // Criar barbearia com dados mínimos e configurações de trial
    const barbershop = await Barbershop.create({
      name: barbershopName,
      slug,
      // Endereço em branco para o usuário preencher
      address: {
        cep: "",
        estado: "",
        cidade: "",
        bairro: "",
        rua: "",
        numero: "",
      },
      contact: "",
      workingHours: [
        {
          day: "Segunda-feira",
          start: "09:00",
          end: "18:00",
        },
        {
          day: "Terça-feira",
          start: "09:00",
          end: "18:00",
        },
        {
          day: "Quarta-feira",
          start: "09:00",
          end: "18:00",
        },
        {
          day: "Quinta-feira",
          start: "09:00",
          end: "18:00",
        },
        {
          day: "Sexta-feira",
          start: "09:00",
          end: "18:00",
        },
      ],
      // Configurações de trial
      isTrial: true,
      trialEndsAt,
      accountStatus: "trial",
    });

    // Criar usuário admin
    const adminUser = await AdminUser.create({
      email: adminEmail,
      password: adminPassword, // O hook pre-save fará o hash
      barbershop: barbershop._id,
      role: "admin",
      status: "active",
    });

    // Gerar token JWT para login automático
    const payload = {
      userId: adminUser._id,
      barbershopId: barbershop._id,
      barbershopSlug: barbershop.slug,
      barbershopName: barbershop.name,
      role: adminUser.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "365d" });

    // Definir cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: "/",
    };
    res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);

    // Retornar sucesso com token e dados do usuário
    res.status(201).json({
      message: "Conta de teste criada com sucesso!",
      token,
      user: {
        email: adminUser.email,
        barbershopId: barbershop._id,
        barbershopSlug: barbershop.slug,
        barbershopName: barbershop.name,
        role: adminUser.role,
      },
      trial: {
        endsAt: trialEndsAt,
        daysRemaining: 7,
      },
    });
  } catch (error) {
    console.error("Erro no cadastro de conta de teste:", error);

    // Erros de validação do Zod
    if (error.name === "ZodError") {
      return res.status(400).json({
        error: "Dados inválidos",
        details: error.errors.map((e) => e.message),
      });
    }

    res.status(500).json({ error: "Erro ao criar conta de teste." });
  }
});

export default router;
