import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import "dotenv/config";
import { fileURLToPath } from "url";
import path from "path";
import mongoose from "mongoose";

import connectDB from "./config/db.js";
import { getRedisClient } from "./config/redis.js";
import helmet from "helmet";
import barbershopRoutes from "./routes/barbershopRoutes.js";
import barberRoutes from "./routes/barberRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import authAdminRoutes from "./routes/authAdminRoutes.js";
import commissionRoutes from "./routes/commission.js";
import blockedDayRoutes from "./routes/blockedDayRoutes.js";
import authCustomerRoutes from "./routes/authCustomerRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import healthcheckRoutes from "./routes/healtcheck.js";
import planRoutes from "./routes/planRoutes.js";
import timeBlockRoutes from "./routes/admin/timeBlockRoutes.js";
import customerAdminRoutes from "./routes/admin/customerRoutes.js";
import productRoutes from "./routes/products.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import dashboardRoutes from "./routes/admin/dashboardRoutes.js";
import barberPerformanceRoutes from "./routes/admin/barberPerformanceRoutes.js";
import manualBookingRoutes from "./routes/admin/manualBookingRoute.js";
import operationalCostRoutes from "./routes/admin/operationalCostRoutes.js";
import leadRoutes from "./routes/form/lead.routes.js";
import authSuperAdminRoutes from "./routes/authSuperAdminRoutes.js";
import superAdminRoutes from "./routes/superAdminRoutes.js";
import subscriptionPaymentRoutes from "./routes/subscriptionPaymentRoutes.js";

import { protectAdmin, checkAccountStatus } from "./middleware/authAdminMiddleware.js";
import { protectSuperAdmin } from "./middleware/authSuperAdminMiddleware.js";

import { stopAllCronJobs } from "./services/schedulerService.js";

import "./models/Barbershop.js";
import "./models/Barber.js";
import "./models/Service.js";
import "./models/Booking.js";

// Para obter o __dirname em projetos com ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

connectDB();
getRedisClient();

const app = express();

app.set("trust proxy", 1);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "https://barbeariagendamento.com.br",
  "https://admin.barbeariagendamento.com.br",
  "https://www.admin.barbeariagendamento.com.br",
  "http://31.97.30.228:8088",
  "https://www.barbeariagendamento.com.br",
  "https://barbeariagendamento.com.br/",
  "https://formulario.barbeariagendamento.com.br",
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permite requisicoes sem 'origin' (como Postman) ou de origens na lista
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Nao permitido pela politica de CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

app.use(helmet());
app.use(cookieParser());
app.use(express.json());

app.use(express.static("public"));

app.use("/api", healthcheckRoutes);

// --- Montando as Rotas ---
app.use("/barbershops", barbershopRoutes);

// O :barbershopId sera acessivel em barberRoutes via req.params.barbershopId se mergeParams=true
app.use("/barbershops/:barbershopId/barbers", barberRoutes);
app.use("/barbershops/:barbershopId/services", serviceRoutes);
app.use("/barbershops/:barbershopId/bookings", bookingRoutes);
app.use("/api/upload", protectAdmin, checkAccountStatus, uploadRoutes);
app.use("/barbershops/:barbershopId/analytics", protectAdmin, checkAccountStatus, analyticsRoutes);
app.use("/barbershops/:barbershopId/commissions", protectAdmin, checkAccountStatus, commissionRoutes);
app.use("/api/barbershops/:barbershopId/blocked-days", protectAdmin, checkAccountStatus, blockedDayRoutes);
app.use("/api/barbershops/:barbershopId/reviews", reviewRoutes);
app.use("/api/barbershops/:barbershopId/plans", planRoutes);

app.use("/api/auth/customer", customerRoutes);

app.use("/api/auth/customer", authCustomerRoutes);

app.use("/api/auth/admin", authAdminRoutes);
app.use("/api/barbershops/:barbershopId/admin/customers", protectAdmin, checkAccountStatus, customerAdminRoutes);
app.use("/api/barbershops/:barbershopId/products", productRoutes);

// admin

app.use("/api/barbershops/:barbershopId/time-blocks", protectAdmin, checkAccountStatus, timeBlockRoutes);
app.use("/api/barbershops/:barbershopId/bookings", paymentRoutes);
app.use("/api/barbershops/:barbershopId/subscriptions", subscriptionPaymentRoutes);
app.use("/api/barbershops/:barbershopId/dashboard-metrics", protectAdmin, checkAccountStatus, dashboardRoutes);
app.use("/api/barbershops/:barbershopId/barber-performance", protectAdmin, checkAccountStatus, barberPerformanceRoutes);
app.use("/api/barbershops/:barbershopId/admin/bookings", protectAdmin, checkAccountStatus, manualBookingRoutes);
app.use("/api/barbershops/:barbershopId/admin/operational-costs", operationalCostRoutes);

// Form
app.use('/api/leads', leadRoutes);

// Super Admin
app.use("/api/auth/superadmin", authSuperAdminRoutes);
app.use("/api/superadmin", protectSuperAdmin, superAdminRoutes);

// --- Global Error Handler ---
// Captura qualquer erro nao tratado nas rotas e retorna 500 limpo
// sem derrubar o processo.
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.message || err);

  // Erro de CORS
  if (err.message && err.message.includes("CORS")) {
    return res.status(403).json({ error: "Bloqueado pela politica de CORS" });
  }

  // Erro de JSON malformado
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON invalido no corpo da requisicao" });
  }

  // Erro generico - nunca expoe stack trace em producao
  res.status(err.status || 500).json({
    error: "Erro interno do servidor",
  });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});

// --- Graceful Shutdown ---
// Quando o Docker envia SIGTERM (ou SIGINT), fecha tudo corretamente
// para que o container reinicie limpo.
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[SHUTDOWN] Sinal ${signal} recebido. Iniciando shutdown graceful...`);

  // 1. Para de aceitar novas conexoes
  server.close(() => {
    console.log("[SHUTDOWN] Servidor HTTP fechado.");
  });

  // 2. Para todos os cron jobs
  stopAllCronJobs();
  console.log("[SHUTDOWN] Cron jobs parados.");

  // 3. Fecha Redis
  getRedisClient().then((redisClient) => {
    if (redisClient) {
      redisClient.disconnect();
      console.log("[SHUTDOWN] Redis desconectado.");
    }
  });

  // 4. Fecha conexao com MongoDB
  mongoose.connection.close(false).then(() => {
    console.log("[SHUTDOWN] MongoDB desconectado.");
    process.exit(0);
  }).catch((err) => {
    console.error("[SHUTDOWN] Erro ao fechar MongoDB:", err);
    process.exit(1);
  });

  // 5. Timeout de seguranca - se nao fechar em 10s, forca o exit
  setTimeout(() => {
    console.error("[SHUTDOWN] Timeout! Forcando encerramento.");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// --- Tratamento de erros fatais ---
// Loga e faz shutdown limpo para o Docker reiniciar o container
process.on("uncaughtException", (error) => {
  console.error("[FATAL] Uncaught Exception:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[FATAL] Unhandled Rejection:", reason);
  // Nao faz shutdown aqui - apenas loga.
  // Unhandled rejections geralmente nao corrompem o estado do processo.
});
