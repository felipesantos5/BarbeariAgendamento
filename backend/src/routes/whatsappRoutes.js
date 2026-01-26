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

const router = express.Router();

// Armazena temporariamente os QR codes atualizados por instancia
const qrCodeCache = new Map();

/**
 * Mapeia status WAHA para formato interno
 */
function mapWahaStatus(wahaStatus) {
  switch (wahaStatus) {
    case "WORKING":
      return "connected";
    case "SCAN_QR_CODE":
    case "STARTING":
      return "connecting";
    case "STOPPED":
    case "FAILED":
    default:
      return "disconnected";
  }
}

/**
 * POST /api/whatsapp/webhook/:instanceName
 * Webhook para receber eventos da WAHA API
 */
router.post("/webhook/:instanceName", async (req, res) => {
  try {
    const { instanceName } = req.params;
    const event = req.body;

    console.log(`[WhatsApp Webhook] Evento recebido para ${instanceName}:`, JSON.stringify(event, null, 2));

    // Extrai o barbershopId do nome da instancia (formato: barbershop_{id})
    const barbershopId = instanceName.replace("barbershop_", "");

    // Busca a barbearia
    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop) {
      console.log(`[WhatsApp Webhook] Barbearia nao encontrada: ${barbershopId}`);
      return res.status(200).json({ received: true });
    }

    // Processa diferentes tipos de eventos WAHA
    const eventType = event.event;

    if (eventType === "session.status") {
      await handleConnectionUpdate(barbershop, event, barbershopId);
    }
    // WAHA nao envia QR code via webhook - QR code e obtido via polling GET /api/{session}/auth/qr

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[WhatsApp Webhook] Erro ao processar evento:", error);
    res.status(200).json({ received: true, error: error.message });
  }
});

/**
 * Processa evento de atualizacao de conexao (WAHA session.status)
 */
async function handleConnectionUpdate(barbershop, event, barbershopId) {
  // WAHA payload: { event: "session.status", session: "...", payload: { status: "WORKING" }, me: { id: "55...@c.us" } }
  const wahaStatus = event.payload?.status;
  const newStatus = mapWahaStatus(wahaStatus);

  console.log(`[WhatsApp Webhook] Session Status - WAHA: ${wahaStatus}, Mapeado: ${newStatus}`);

  let connectedNumber = null;

  if (newStatus === "connected") {
    // Extrai numero conectado de event.me.id
    if (event.me?.id) {
      connectedNumber = event.me.id.split("@")[0];
    }
  }

  // Atualiza o banco de dados
  barbershop.whatsappConfig.connectionStatus = newStatus;
  barbershop.whatsappConfig.lastCheckedAt = new Date();

  if (newStatus === "connected" && connectedNumber) {
    barbershop.whatsappConfig.connectedNumber = connectedNumber;
    const isFirstConnection = !barbershop.whatsappConfig.connectedAt;

    if (isFirstConnection) {
      barbershop.whatsappConfig.connectedAt = new Date();
      // Na WAHA, webhook ja esta configurado na criacao da sessao (no-op)
      try {
        await setWebhook(barbershop.whatsappConfig.instanceName);
      } catch (webhookError) {
        console.error(`[WhatsApp Webhook] Erro ao configurar webhook (nao critico):`, webhookError.message);
      }
    }
  } else if (newStatus === "disconnected") {
    qrCodeCache.delete(barbershop.whatsappConfig.instanceName);
    barbershop.whatsappConfig.connectedAt = null;
  } else if (newStatus === "connecting" && wahaStatus === "SCAN_QR_CODE") {
    // Quando status = SCAN_QR_CODE, busca QR code via API e envia via SSE
    try {
      const { qrcode } = await getQRCode(barbershop.whatsappConfig.instanceName);
      if (qrcode) {
        qrCodeCache.set(barbershop.whatsappConfig.instanceName, {
          qrcode,
          pairingCode: null,
          timestamp: Date.now(),
        });

        sendEventToBarbershop(barbershopId, "whatsapp_qrcode", {
          qrcode,
          pairingCode: null,
        });

        console.log(`[WhatsApp Webhook] QR Code obtido via polling e enviado via SSE`);
      }
    } catch (qrError) {
      console.error(`[WhatsApp Webhook] Erro ao obter QR code via polling:`, qrError.message);
    }
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
 * GET /api/whatsapp/qrcode-cache/:instanceName
 * Obtem o QR code mais recente do cache (recebido via webhook)
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

    res.status(404).json({ error: "QR Code nao encontrado no cache" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/barbershops/:id/whatsapp/events
 * Endpoint SSE para receber eventos do WhatsApp em tempo real
 */
router.get("/:id/whatsapp/events", protectAdmin, (req, res) => {
  const { id } = req.params;
  const userBarbershopId = req.adminUser?.barbershopId;

  // Verifica se o usuario tem permissao
  if (userBarbershopId !== id) {
    return res.status(403).json({ error: "Nao autorizado a escutar eventos desta barbearia." });
  }

  // Configura headers para SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Adiciona o cliente a lista
  addClient(id, res);

  // Envia evento de conexao confirmada
  res.write(`event: connected\ndata: ${JSON.stringify({ message: "Conectado ao stream de WhatsApp!" })}\n\n`);

  // Ping periodico para manter a conexao viva
  const keepAliveInterval = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 20000);

  // Lida com desconexao
  req.on("close", () => {
    clearInterval(keepAliveInterval);
    removeClient(id, res);
    res.end();
  });
});

/**
 * POST /api/barbershops/:id/whatsapp/connect
 * Conecta o WhatsApp da barbearia (cria sessao e retorna QR code)
 */
router.post("/:id/whatsapp/connect", protectAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Busca a barbearia
    const barbershop = await Barbershop.findById(id);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia nao encontrada" });
    }

    // Verifica se ja tem uma instancia conectada
    if (
      barbershop.whatsappConfig?.connectionStatus === "connected" &&
      barbershop.whatsappConfig?.instanceName
    ) {
      return res.status(400).json({
        error: "WhatsApp ja esta conectado. Desconecte primeiro para reconectar.",
      });
    }

    // Se ja existe uma instancia mas nao conectada, deleta ela primeiro
    if (barbershop.whatsappConfig?.instanceName) {
      try {
        await deleteInstance(barbershop.whatsappConfig.instanceName);
      } catch (err) {
        console.log("[WhatsApp] Erro ao deletar instancia anterior (ignorando):", err.message);
      }
    }

    // Cria nova sessao (ja retorna o QR code)
    const { instanceName, qrcode, pairingCode } = await createInstance(id);

    // Atualiza o banco de dados
    barbershop.whatsappConfig = {
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
 * GET /api/barbershops/:id/whatsapp/status
 * Verifica o status da conexao do WhatsApp
 */
router.get("/:id/whatsapp/status", protectAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const barbershop = await Barbershop.findById(id);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia nao encontrada" });
    }

    // Se nao tem instanceName, retorna desconectado
    if (!barbershop.whatsappConfig?.instanceName) {
      return res.json({
        status: "disconnected",
        enabled: false,
        connectedNumber: null,
        instanceName: null,
      });
    }

    // Verifica o status na WAHA API
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
 * GET /api/barbershops/:id/whatsapp/qrcode
 * Obtem um novo QR Code (util se o anterior expirou)
 */
router.get("/:id/whatsapp/qrcode", protectAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const barbershop = await Barbershop.findById(id);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia nao encontrada" });
    }

    if (!barbershop.whatsappConfig?.instanceName) {
      return res.status(400).json({
        error: "Nenhuma sessao criada. Use o endpoint /connect primeiro.",
      });
    }

    // Obtem novo QR Code via WAHA
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
 * DELETE /api/barbershops/:id/whatsapp/disconnect
 * Desconecta e deleta a sessao do WhatsApp
 */
router.delete("/:id/whatsapp/disconnect", protectAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const barbershop = await Barbershop.findById(id);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia nao encontrada" });
    }

    if (!barbershop.whatsappConfig?.instanceName) {
      return res.status(400).json({
        error: "Nenhuma sessao conectada.",
      });
    }

    const instanceName = barbershop.whatsappConfig.instanceName;

    // Desconecta a sessao
    try {
      await disconnectInstance(instanceName);
    } catch (err) {
      console.log("[WhatsApp] Erro ao desconectar (ignorando):", err.message);
    }

    // Deleta a sessao
    try {
      await deleteInstance(instanceName);
    } catch (err) {
      console.log("[WhatsApp] Erro ao deletar (ignorando):", err.message);
    }

    // Limpa os dados no banco
    barbershop.whatsappConfig = {
      enabled: false,
      instanceName: null,
      connectionStatus: "disconnected",
      connectedNumber: null,
      connectedAt: null,
      lastCheckedAt: new Date(),
    };

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

export default router;
