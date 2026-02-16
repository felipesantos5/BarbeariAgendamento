// src/routes/whatsappRoutes.js
import express from "express";
import {protectAdmin} from "../middleware/authAdminMiddleware.js";
import {
  createInstance,
  getQRCode,
  getConnectionStatus,
  disconnectInstance,
  deleteInstance,
  restartInstance,
  setWebhook,
} from "../services/whatsappInstanceService.js";
import Barbershop from "../models/Barbershop.js";
import { addClient, removeClient, sendEventToBarbershop } from "../services/sseService.js";

const router = express.Router({ mergeParams: true });

// Armazena temporariamente os QR codes atualizados por instância
const qrCodeCache = new Map();

/**
 * POST /api/whatsapp/webhook/:instanceName
 * Webhook para receber eventos do Evolution API
 */
router.post("/webhook/:instanceName", async (req, res) => {
  try {
    const { instanceName } = req.params;
    const event = req.body;
    const eventType = event.event;

    // Log apenas do tipo de evento para não poluir
    console.log(`[WhatsApp Webhook] Evento recebido: ${eventType} para ${instanceName}`);

    // Extrai o barbershopId do nome da instância (formato: barbershop_{id})
    const barbershopId = instanceName.replace("barbershop_", "");

    // Busca a barbearia
    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop) {
      console.log(`[WhatsApp Webhook] Barbearia não encontrada: ${barbershopId}`);
      return res.status(200).json({ received: true });
    }

    // Processa diferentes tipos de eventos

    if (eventType === "connection.update" || eventType === "CONNECTION_UPDATE") {
      await handleConnectionUpdate(barbershop, event, barbershopId);
    } else if (eventType === "qrcode.updated" || eventType === "QRCODE_UPDATED") {
      await handleQRCodeUpdate(barbershop, event, instanceName, barbershopId);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[WhatsApp Webhook] Erro ao processar evento:", error);
    res.status(200).json({ received: true, error: error.message });
  }
});

/**
 * Processa evento de atualização de conexão
 */
async function handleConnectionUpdate(barbershop, event, barbershopId) {
  const data = event.data || event;
  const state = data.state || data.connection || data.status;
  const statusReason = data.statusReason;

  let newStatus = "disconnected";
  let connectedNumber = null;

  // Mapeia os estados do Evolution API
  if (state === "open" || state === "connected") {
    newStatus = "connected";
    // Tenta extrair o número conectado
    connectedNumber = data.ownerJid || data.wuid || data.owner;
    if (connectedNumber && connectedNumber.includes("@")) {
      connectedNumber = connectedNumber.split("@")[0];
    }
  } else if (state === "connecting" || state === "qr") {
    newStatus = "connecting";
  } else if (state === "close" || state === "disconnected" || statusReason === 401) {
    newStatus = "disconnected";
  }

  // Atualiza o banco de dados
  barbershop.whatsappConfig.connectionStatus = newStatus;
  barbershop.whatsappConfig.lastCheckedAt = new Date();

  if (newStatus === "connected" && connectedNumber) {
    barbershop.whatsappConfig.connectedNumber = connectedNumber;
    const isFirstConnection = !barbershop.whatsappConfig.connectedAt;

    if (isFirstConnection) {
      barbershop.whatsappConfig.connectedAt = new Date();

      // Configura webhook apenas na PRIMEIRA conexão bem-sucedida
      try {
        console.log(`[WhatsApp Webhook] Primeira conexão detectada. Configurando webhook para: ${barbershop.whatsappConfig.instanceName}`);
        await setWebhook(barbershop.whatsappConfig.instanceName);
      } catch (webhookError) {
        console.error(`[WhatsApp Webhook] Erro ao configurar webhook (não crítico):`, webhookError.message);
      }
    }
  } else if (newStatus === "disconnected") {
    // Limpa QR code cache e reseta connectedAt quando desconecta
    // Isso permite reconfigurar webhook na próxima conexão
    qrCodeCache.delete(barbershop.whatsappConfig.instanceName);
    barbershop.whatsappConfig.connectedAt = null;
  }

  await barbershop.save();

  // Envia evento SSE para o frontend
  sendEventToBarbershop(barbershopId, "whatsapp_status", {
    status: newStatus,
    connectedNumber: barbershop.whatsappConfig.connectedNumber,
    instanceName: barbershop.whatsappConfig.instanceName,
  });

  console.log(`[WhatsApp Webhook] Status atualizado para: ${newStatus}`);
}

/**
 * Processa evento de atualização de QR Code
 */
async function handleQRCodeUpdate(barbershop, event, instanceName, barbershopId) {
  const data = event.data || event;
  let qrcode = data.qrcode?.base64 || data.base64 || data.qrcode;

  if (qrcode) {
    // Formata o QR code se necessário
    if (!qrcode.startsWith("data:image")) {
      qrcode = `data:image/png;base64,${qrcode}`;
    }

    // Armazena no cache
    qrCodeCache.set(instanceName, {
      qrcode,
      pairingCode: data.pairingCode || data.code,
      timestamp: Date.now(),
    });

    sendEventToBarbershop(barbershopId, "whatsapp_qrcode", {
      qrcode,
      pairingCode: data.pairingCode || data.code,
    });
  }
}

/**
 * GET /api/whatsapp/qrcode-cache/:instanceName
 * Obtém o QR code mais recente do cache (recebido via webhook)
 */
router.get("/qrcode-cache/:instanceName", async (req, res) => {
  try {
    const { instanceName } = req.params;
    const cached = qrCodeCache.get(instanceName);

    if (cached && Date.now() - cached.timestamp < 60000) {
      return res.json({
        qrcode: cached.qrcode,
        pairingCode: cached.pairingCode,
        cached: true,
      });
    }

    res.status(404).json({ error: "QR Code não encontrado no cache" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/barbershops/:barbershopId/whatsapp/events
 * Endpoint SSE para receber eventos do WhatsApp em tempo real
 */
router.get("/events", protectAdmin, (req, res) => {
  const { barbershopId } = req.params;
  const id = barbershopId;
  const userBarbershopId = req.adminUser?.barbershopId;

  // Verifica se o usuário tem permissão
  if (userBarbershopId !== id) {
    return res.status(403).json({ error: "Não autorizado a escutar eventos desta barbearia." });
  }

  // Configura headers para SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Adiciona o cliente à lista
  addClient(id, res);

  // Envia evento de conexão confirmada
  res.write(`event: connected\ndata: ${JSON.stringify({ message: "Conectado ao stream de WhatsApp!" })}\n\n`);

  // Ping periódico para manter a conexão viva
  const keepAliveInterval = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 20000);

  // Lida com desconexão
  req.on("close", () => {
    clearInterval(keepAliveInterval);
    removeClient(id, res);
    res.end();
  });
});

/**
 * POST /api/barbershops/:barbershopId/whatsapp/connect
 * Conecta o WhatsApp da barbearia (cria instância e retorna QR code)
 */
router.post("/connect", protectAdmin, async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const id = barbershopId;

    // Busca a barbearia
    const barbershop = await Barbershop.findById(id);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada" });
    }

    // Verifica se já tem uma instância conectada
    if (
      barbershop.whatsappConfig?.connectionStatus === "connected" &&
      barbershop.whatsappConfig?.instanceName
    ) {
      return res.status(400).json({
        error: "WhatsApp já está conectado. Desconecte primeiro para reconectar.",
      });
    }

    // Se já existe uma instância mas não conectada, deleta ela primeiro
    if (barbershop.whatsappConfig?.instanceName) {
      try {
        await deleteInstance(barbershop.whatsappConfig.instanceName);
      } catch (err) {
        // Silencioso
      }
    }

    // Cria nova instância (já retorna o QR code)
    const { instanceName, qrcode, pairingCode } = await createInstance(id);

    // Atualiza o banco de dados preservando configurações existentes
    barbershop.whatsappConfig = {
      ...barbershop.whatsappConfig,
      enabled: true,
      instanceName,
      connectionStatus: "connecting",
      connectedNumber: null,
      connectedAt: null,
      lastCheckedAt: new Date(),
    };

    await barbershop.save();

    res.json({
      qrcode,
      pairingCode,
      instanceName,
      message: "QR Code gerado. Escaneie com seu WhatsApp para conectar.",
    });
  } catch (error) {
    console.error("[WhatsApp] Erro ao conectar:", error);
    res.status(500).json({
      error: "Erro ao conectar WhatsApp",
      message: error.message,
    });
  }
});

/**
 * GET /api/barbershops/:barbershopId/whatsapp/status
 * Verifica o status da conexão do WhatsApp
 */
router.get("/status", protectAdmin, async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const id = barbershopId;

    const barbershop = await Barbershop.findById(id);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada" });
    }

    // Se não tem instanceName, retorna desconectado
    if (!barbershop.whatsappConfig?.instanceName) {
      return res.json({
        status: "disconnected",
        enabled: barbershop.whatsappConfig?.enabled || false,
        connectedNumber: null,
        instanceName: null,
        morningReminderTime: barbershop.whatsappConfig?.morningReminderTime || "08:00",
        afternoonReminderTime: barbershop.whatsappConfig?.afternoonReminderTime || "13:00",
      });
    }

    // Verifica o status na Evolution API
    const { status, connectedNumber } = await getConnectionStatus(
      barbershop.whatsappConfig.instanceName
    );

    // Atualiza o banco de dados
    barbershop.whatsappConfig.connectionStatus = status;
    barbershop.whatsappConfig.lastCheckedAt = new Date();

    if (status === "connected" && connectedNumber) {
      barbershop.whatsappConfig.connectedNumber = connectedNumber;
      if (!barbershop.whatsappConfig.connectedAt) {
        barbershop.whatsappConfig.connectedAt = new Date();
      }
    }

    await barbershop.save();

    res.json({
      status,
      enabled: barbershop.whatsappConfig.enabled,
      connectedNumber: barbershop.whatsappConfig.connectedNumber,
      instanceName: barbershop.whatsappConfig.instanceName,
      connectedAt: barbershop.whatsappConfig.connectedAt,
      lastCheckedAt: barbershop.whatsappConfig.lastCheckedAt,
      morningReminderTime: barbershop.whatsappConfig.morningReminderTime || "08:00",
      afternoonReminderTime: barbershop.whatsappConfig.afternoonReminderTime || "13:00",
    });
  } catch (error) {
    console.error("[WhatsApp] Erro ao verificar status:", error);
    res.status(500).json({
      error: "Erro ao verificar status",
      message: error.message,
    });
  }
});

/**
 * GET /api/barbershops/:barbershopId/whatsapp/qrcode
 * Obtém um novo QR Code (útil se o anterior expirou)
 */
router.get("/qrcode", protectAdmin, async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const id = barbershopId;

    const barbershop = await Barbershop.findById(id);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada" });
    }

    if (!barbershop.whatsappConfig?.instanceName) {
      return res.status(400).json({
        error: "Nenhuma instância criada. Use o endpoint /connect primeiro.",
      });
    }

    // Obtém novo QR Code
    const { qrcode, pairingCode } = await getQRCode(barbershop.whatsappConfig.instanceName);

    res.json({
      qrcode,
      pairingCode,
      instanceName: barbershop.whatsappConfig.instanceName,
    });
  } catch (error) {
    console.error("[WhatsApp] Erro ao obter QR Code:", error);
    res.status(500).json({
      error: "Erro ao obter QR Code",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/barbershops/:barbershopId/whatsapp/disconnect
 * Desconecta e deleta a instância do WhatsApp
 */
router.delete("/disconnect", protectAdmin, async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const id = barbershopId;

    const barbershop = await Barbershop.findById(id);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada" });
    }

    if (!barbershop.whatsappConfig?.instanceName) {
      return res.status(400).json({
        error: "Nenhuma instância conectada.",
      });
    }

    const instanceName = barbershop.whatsappConfig.instanceName;

    // Desconecta a instância
    try {
      await disconnectInstance(instanceName);
    } catch (err) {
      // Silencioso
    }

    // Deleta a instância
    try {
      await deleteInstance(instanceName);
    } catch (err) {
      // Silencioso
    }

    // Limpa os dados de conexão no banco, mas PRESERVA as configurações de horário
    barbershop.whatsappConfig.enabled = false;
    barbershop.whatsappConfig.instanceName = null;
    barbershop.whatsappConfig.connectionStatus = "disconnected";
    barbershop.whatsappConfig.connectedNumber = null;
    barbershop.whatsappConfig.connectedAt = null;
    barbershop.whatsappConfig.lastCheckedAt = new Date();
    // morningReminderTime e afternoonReminderTime são preservados automaticamente pois não estamos sobrescrevendo o objeto todo

    await barbershop.save();

    res.json({
      message: "WhatsApp desconectado com sucesso",
    });
  } catch (error) {
    console.error("[WhatsApp] Erro ao desconectar:", error);
    res.status(500).json({
      error: "Erro ao desconectar WhatsApp",
      message: error.message,
    });
  }
});

/**
 * PUT /api/barbershops/:barbershopId/whatsapp/settings
 * Atualiza as configurações de lembrete do WhatsApp
 */
router.put("/settings", protectAdmin, async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { morningReminderTime, afternoonReminderTime } = req.body;

    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada" });
    }

    if (!barbershop.whatsappConfig) {
      barbershop.whatsappConfig = {};
    }

    if (morningReminderTime) {
      barbershop.set("whatsappConfig.morningReminderTime", morningReminderTime);
    }
    
    if (afternoonReminderTime) {
      barbershop.set("whatsappConfig.afternoonReminderTime", afternoonReminderTime);
    }

    await barbershop.save();

    res.json({
      message: "Configurações de WhatsApp atualizadas com sucesso",
      morningReminderTime: barbershop.whatsappConfig.morningReminderTime,
      afternoonReminderTime: barbershop.whatsappConfig.afternoonReminderTime,
    });
  } catch (error) {
    console.error("[WhatsApp] Erro ao atualizar configurações:", error);
    res.status(500).json({
      error: "Erro ao atualizar configurações",
      message: error.message,
    });
  }
});

export default router;
