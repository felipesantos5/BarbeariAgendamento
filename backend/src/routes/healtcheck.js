import express from "express";
import mongoose from "mongoose";
import { getCircuitBreakerState } from "../services/evolutionWhatsapp.js";

const router = express.Router();

router.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const dbOk = dbState === 1;

  const circuitBreaker = getCircuitBreakerState();

  const status = dbOk ? "ok" : "degraded";
  const httpCode = dbOk ? 200 : 503;

  res.status(httpCode).json({
    status,
    database: dbOk ? "connected" : "disconnected",
    whatsapp: circuitBreaker.state,
    uptime: Math.floor(process.uptime()),
  });
});

export default router;
