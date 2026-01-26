// src/services/whatsappInstanceService.js
import axios from "axios";

const WAHA_API_URL = process.env.WAHA_API_URL;
const WAHA_API_KEY = process.env.WAHA_API_KEY;
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || process.env.BACKEND_URL || "https://api.barbeariagendamento.com.br";

const api = axios.create({
  baseURL: WAHA_API_URL,
  headers: {
    "Content-Type": "application/json",
    "X-Api-Key": WAHA_API_KEY,
  },
  timeout: 30000,
});

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
 * Cria uma nova sessao do WhatsApp na WAHA
 * @param {string} barbershopId - ID da barbearia
 * @returns {Promise<{instanceName: string, status: string, qrcode?: string}>}
 */
export async function createInstance(barbershopId) {
  try {
    const instanceName = `barbershop_${barbershopId}`;
    const webhookUrl = `${WEBHOOK_BASE_URL}/api/whatsapp/webhook/${instanceName}`;

    console.log(`[WhatsApp] Criando sessao WAHA: ${instanceName}`);
    console.log(`[WhatsApp] URL da API: ${WAHA_API_URL}`);

    // Primeiro, tenta deletar a sessao se ja existir
    try {
      await api.delete(`/api/sessions/${instanceName}`);
      console.log(`[WhatsApp] Sessao anterior deletada: ${instanceName}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (deleteError) {
      console.log(`[WhatsApp] Nenhuma sessao anterior para deletar`);
    }

    // Cria a nova sessao com webhook configurado na criacao
    const createResponse = await api.post("/api/sessions", {
      name: instanceName,
      start: true,
      config: {
        webhooks: [
          {
            url: webhookUrl,
            events: ["session.status", "message"],
          },
        ],
      },
    });

    console.log(`[WhatsApp] Resposta da criacao:`, JSON.stringify(createResponse.data, null, 2));

    // Aguarda a sessao inicializar para obter o QR code
    let qrcode = null;

    console.log(`[WhatsApp] Aguardando inicializacao da sessao para obter QR code...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      const qrResult = await getQRCode(instanceName);
      qrcode = qrResult.qrcode;
    } catch (qrError) {
      console.error(`[WhatsApp] Erro ao obter QR code:`, qrError.message);
      // Tenta uma segunda vez
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        const qrResult = await getQRCode(instanceName);
        qrcode = qrResult.qrcode;
      } catch (retryError) {
        console.error(`[WhatsApp] Segunda tentativa de QR code tambem falhou:`, retryError.message);
      }
    }

    console.log(`[WhatsApp] Sessao criada com sucesso: ${instanceName}`);
    console.log(`[WhatsApp] QR code obtido: ${qrcode ? "SIM" : "NAO"}`);

    return {
      instanceName,
      instanceId: createResponse.data?.name,
      status: createResponse.data?.status || "created",
      qrcode,
      pairingCode: null,
      data: createResponse.data,
    };
  } catch (error) {
    console.error("[WhatsApp] Erro ao criar sessao:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      code: error.code,
    });

    let errorMessage = error.message;
    if (error.response?.data) {
      if (typeof error.response.data === "object") {
        errorMessage = error.response.data.message || error.response.data.error || JSON.stringify(error.response.data);
      } else {
        errorMessage = error.response.data;
      }
    }

    throw new Error(`Falha ao criar sessao: ${errorMessage}`);
  }
}

/**
 * Obtem o QR Code para conectar o WhatsApp via WAHA
 * @param {string} instanceName - Nome da sessao
 * @returns {Promise<{qrcode: string, pairingCode?: string}>}
 */
export async function getQRCode(instanceName) {
  try {
    console.log(`[WhatsApp] Obtendo QR Code para: ${instanceName}`);

    const response = await api.get(`/api/${instanceName}/auth/qr`, {
      headers: {
        Accept: "application/json",
      },
    });

    console.log(`[WhatsApp] Resposta do QR:`, JSON.stringify(response.data, null, 2));

    const data = response.data;
    let qrcode = null;

    // WAHA retorna { value: "data:image/png;base64,..." } ou similar
    if (data?.value) {
      qrcode = data.value;
    } else if (data?.data) {
      qrcode = data.data;
    } else if (typeof data === "string") {
      qrcode = data;
    }

    if (qrcode && !qrcode.startsWith("data:image")) {
      qrcode = `data:image/png;base64,${qrcode}`;
    }

    if (!qrcode) {
      console.error("[WhatsApp] QR Code nao encontrado na resposta:", data);
      throw new Error("QR Code nao disponivel na resposta da API");
    }

    console.log(`[WhatsApp] QR Code extraido com sucesso`);

    return {
      qrcode,
      pairingCode: null,
    };
  } catch (error) {
    console.error("[WhatsApp] Erro ao obter QR Code:", error.response?.data || error.message);

    if (error.response?.status === 400 || error.response?.status === 404) {
      throw new Error("Sessao nao esta aguardando QR Code. Verifique o status da conexao.");
    }

    throw new Error(`Falha ao obter QR Code: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Verifica o status da conexao da sessao WAHA
 * @param {string} instanceName - Nome da sessao
 * @returns {Promise<{status: string, connectedNumber?: string, instance?: object}>}
 */
export async function getConnectionStatus(instanceName) {
  try {
    console.log(`[WhatsApp] Verificando status da sessao: ${instanceName}`);

    const response = await api.get(`/api/sessions/${instanceName}`);
    console.log(`[WhatsApp] Resposta status:`, JSON.stringify(response.data, null, 2));

    const data = response.data;
    const wahaStatus = data?.status;
    const status = mapWahaStatus(wahaStatus);

    // Numero conectado vem em data.me.id no formato "55...@c.us"
    let connectedNumber = null;
    if (data?.me?.id) {
      connectedNumber = data.me.id.split("@")[0];
    }

    console.log(`[WhatsApp] Status mapeado: ${status}, Numero: ${connectedNumber}`);

    return {
      status,
      connectedNumber,
      instance: data,
    };
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`[WhatsApp] Sessao ${instanceName} nao existe (404)`);
      return {
        status: "disconnected",
        connectedNumber: null,
      };
    }

    console.error("[WhatsApp] Erro ao verificar status:", {
      status: error.response?.status,
      error: error.response?.data?.error || error.message,
      response: error.response?.data,
    });

    throw new Error(`Falha ao verificar status: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Desconecta a sessao do WhatsApp (logout) via WAHA
 * @param {string} instanceName - Nome da sessao
 * @returns {Promise<{message: string}>}
 */
export async function disconnectInstance(instanceName) {
  try {
    console.log(`[WhatsApp] Desconectando sessao: ${instanceName}`);

    await api.post(`/api/sessions/${instanceName}/logout`);

    console.log(`[WhatsApp] Sessao desconectada: ${instanceName}`);

    return {
      message: "Desconectado com sucesso",
    };
  } catch (error) {
    console.error("[WhatsApp] Erro ao desconectar:", error.response?.data || error.message);

    if (error.response?.status === 404 || error.response?.status === 400) {
      return {
        message: "Sessao ja estava desconectada",
      };
    }

    throw new Error(`Falha ao desconectar: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Configura webhook de uma sessao (no-op na WAHA - webhook configurado na criacao)
 * @param {string} instanceName - Nome da sessao
 * @returns {Promise<{message: string}>}
 */
export async function setWebhook(instanceName) {
  // Na WAHA, o webhook e configurado na criacao da sessao
  console.log(`[WhatsApp] setWebhook chamado para ${instanceName} - no-op (webhook configurado na criacao)`);
  return {
    message: "Webhook ja configurado na criacao da sessao",
  };
}

/**
 * Reinicia uma sessao via WAHA (stop + start)
 * @param {string} instanceName - Nome da sessao
 * @returns {Promise<{message: string}>}
 */
export async function restartInstance(instanceName) {
  try {
    console.log(`[WhatsApp] Reiniciando sessao: ${instanceName}`);

    // WAHA: stop e depois start
    await api.post(`/api/sessions/${instanceName}/stop`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await api.post(`/api/sessions/${instanceName}/start`);

    console.log(`[WhatsApp] Sessao reiniciada: ${instanceName}`);

    return {
      message: "Sessao reiniciada com sucesso",
    };
  } catch (error) {
    console.error("[WhatsApp] Erro ao reiniciar sessao:", error.response?.data || error.message);

    if (error.response?.status === 404) {
      throw new Error("Sessao nao encontrada");
    }

    throw new Error(`Falha ao reiniciar: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Deleta completamente a sessao via WAHA
 * @param {string} instanceName - Nome da sessao
 * @returns {Promise<{message: string}>}
 */
export async function deleteInstance(instanceName) {
  try {
    console.log(`[WhatsApp] Deletando sessao: ${instanceName}`);

    await api.delete(`/api/sessions/${instanceName}`);

    console.log(`[WhatsApp] Sessao deletada: ${instanceName}`);

    return {
      message: "Sessao deletada com sucesso",
    };
  } catch (error) {
    console.error("[WhatsApp] Erro ao deletar sessao:", error.response?.data || error.message);

    if (error.response?.status === 404) {
      return {
        message: "Sessao nao encontrada (ja deletada)",
      };
    }

    throw new Error(`Falha ao deletar sessao: ${error.response?.data?.message || error.message}`);
  }
}
