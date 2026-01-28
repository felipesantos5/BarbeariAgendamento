import express from "express";
import mongoose from "mongoose";
import { getCircuitBreakerState } from "../services/evolutionWhatsapp.js";

const router = express.Router();

router.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const dbOk = dbState === 1;

  const circuitBreaker = getCircuitBreakerState();

  // Sistema está OK se o DB estiver conectado
  // WhatsApp pode estar offline mas o sistema continua funcionando
  const status = dbOk ? "healthy" : "unhealthy";
  const httpCode = dbOk ? 200 : 503;

  const response = {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    services: {
      database: {
        status: dbOk ? "connected" : "disconnected",
        readyState: dbState,
      },
      whatsapp: {
        status: circuitBreaker.state.toLowerCase(),
        healthy: circuitBreaker.state === "CLOSED",
        failures: circuitBreaker.failures,
        consecutiveFailures: circuitBreaker.consecutiveFailures,
        blockedRequests: circuitBreaker.totalBlockedRequests,
        ...(circuitBreaker.state !== "CLOSED" && {
          nextRetryInSeconds: Math.round(circuitBreaker.nextRetryIn / 1000),
          currentDelaySeconds: Math.round(circuitBreaker.currentDelayMs / 1000),
        }),
      },
    },
  };

  res.status(httpCode).json(response);
});

export default router;
