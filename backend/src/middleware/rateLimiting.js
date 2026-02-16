import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import Redis from "ioredis";

// Configuração do cliente Redis para o Rate Limit
const redisClient = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
});

/**
 * Limite Global para proteger contra ataques DDoS
 * 100 requisições a cada 1 minuto por IP.
 */
export const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  limit: 250, // Máximo de 300 requisições (Seguro para humanos, trava robôs)
  message: {
    error: "Muitas requisições. Por favor, aguarde um momento.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  }),
});

/**
 * Limita tentativas de agendamento
 * 15 tentativas a cada 15 minutos por IP.
 */
export const appointmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  limit: 15,
  message: {
    error: "Limite de criação de agendamentos atingido. Por favor, aguarde 15 minutos.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:appointment:",
  }),
});

/**
 * Limita tentativas de login
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  message: {
    error: "Muitas tentativas de login. Por favor, tente novamente após 15 minutos.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:login:",
  }),
});

/**
 * Limita solicitações de OTP
 */
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  message: {
    error: "Muitas solicitações de código. Por favor, tente novamente após 10 minutos.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:otp:",
  }),
});
