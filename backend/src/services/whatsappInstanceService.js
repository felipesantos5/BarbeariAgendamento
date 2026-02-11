// src/services/whatsappInstanceService.js
import axios from "axios";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
// WEBHOOK_BASE_URL é usado pela Evolution API para chamar o webhook (precisa ser acessível do container)
// Em Docker: http://backend:3001, em produção: https://api.barbeariagendamento.com.br
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || process.env.BACKEND_URL || "https://api.barbeariagendamento.com.br";
const BACKEND_URL = process.env.BACKEND_URL || "https://api.barbeariagendamento.com.br";

console.log(`[WhatsApp] Inicializando serviço com URL: ${EVOLUTION_API_URL}`);
const api = axios.create({
  baseURL: EVOLUTION_API_URL,
  headers: {
    "Content-Type": "application/json",
    apikey: EVOLUTION_API_KEY,
  },
  timeout: 30000, // 30 segundos de timeout padrão
});

/**
 * Formata o QR code base64 para exibição
 * @param {string|object} base64 - String base64 do QR code ou objeto com base64
 * @returns {string} - Base64 formatado com prefixo data:image
 */
function formatQRCodeBase64(base64) {
  if (!base64) return null;

  // Se for um objeto, tenta extrair a string base64
  if (typeof base64 === 'object') {
    base64 = base64.base64 || base64.code || base64.qrcode || JSON.stringify(base64);
  }

  // Garante que agora é uma string
  if (typeof base64 !== 'string') {
    console.error('[WhatsApp] QR code não é string nem objeto válido:', typeof base64);
    return null;
  }

  // Se já tem o prefixo data:image, retorna como está
  if (base64.startsWith("data:image")) {
    return base64;
  }

  // Adiciona o prefixo para imagem PNG
  return `data:image/png;base64,${base64}`;
}

/**
 * Cria uma nova instância do WhatsApp na Evolution API
 * @param {string} barbershopId - ID da barbearia
 * @returns {Promise<{instanceName: string, status: string}>}
 */
export async function createInstance(barbershopId) {
  try {
    const instanceName = `barbershop_${barbershopId}`;

    // Primeiro, tenta deletar a instância se já existir
    try {
      await api.delete(`/instance/delete/${instanceName}`);
      // Aguarda um pouco para garantir que foi deletada
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (deleteError) {
      // Ignora erro se a instância não existir
    }

    const payload = {
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      rejectCall: false,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
    };

    console.log(`[WhatsApp] Enviando payload de criação para ${instanceName}:`, JSON.stringify(payload, null, 2));

    const createResponse = await api.post("/instance/create", payload);

    // Verifica se o QR code veio na resposta de criação
    let qrcode = null;
    let pairingCode = null;

    if (createResponse.data?.qrcode) {
      const qrcodeData = createResponse.data.qrcode;

      // Tenta extrair base64 de diferentes estruturas possíveis
      let base64String = null;

      if (typeof qrcodeData === 'string') {
        // Se já veio como string
        base64String = qrcodeData;
      } else if (typeof qrcodeData === 'object') {
        // Se veio como objeto, tenta diferentes propriedades
        base64String = qrcodeData.base64 || qrcodeData.code || qrcodeData.qrcode;
      }

      qrcode = formatQRCodeBase64(base64String);

      // Extrai pairing code se disponível
      if (typeof qrcodeData === 'object') {
        pairingCode = qrcodeData.pairingCode || qrcodeData.code || null;
      }
    }

    // Se não veio QR code na criação, busca via endpoint connect
    if (!qrcode) {
      // Aguarda tempo suficiente para o Baileys inicializar (3-5 segundos)
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        const connectResult = await getQRCode(instanceName);
        qrcode = connectResult.qrcode;
        pairingCode = connectResult.pairingCode;
      } catch (qrError) {
        // Tenta uma segunda vez após mais 2 segundos
        await new Promise(resolve => setTimeout(resolve, 2000));
        const connectResult = await getQRCode(instanceName);
        qrcode = connectResult.qrcode;
        pairingCode = connectResult.pairingCode;
      }
    }

    console.log(`[WhatsApp] Instância criada com sucesso: ${instanceName}`);

    return {
      instanceName,
      instanceId: createResponse.data?.instance?.instanceId,
      status: createResponse.data?.instance?.status || "created",
      qrcode,
      pairingCode,
      data: createResponse.data,
    };
  } catch (error) {
    console.error("[WhatsApp] Erro ao criar instância:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      code: error.code
    });

    let errorMessage = error.message;

    // Tenta extrair mensagem mais descritiva do erro
    if (error.response?.data) {
      if (typeof error.response.data === 'object') {
        errorMessage = error.response.data.message ||
                      error.response.data.error ||
                      JSON.stringify(error.response.data);
      } else {
        errorMessage = error.response.data;
      }
    }

    throw new Error(`Falha ao criar instância: ${errorMessage}`);
  }
}

/**
 * Obtém o QR Code para conectar o WhatsApp
 * @param {string} instanceName - Nome da instância
 * @returns {Promise<{qrcode: string, pairingCode?: string}>}
 */
export async function getQRCode(instanceName) {
  try {
    console.log(`[WhatsApp] Obtendo QR Code para: ${instanceName}`);

    const response = await api.get(`/instance/connect/${instanceName}`);

    // Na Evolution API v2, o QR code pode vir em diferentes formatos:
    // 1. { base64: "...", code: "...", pairingCode: "..." }
    // 2. { qrcode: { base64: "...", code: "..." } }
    // 3. { qrcode: "string_base64" }
    // 4. "string_base64" direto
    const data = response.data;

    let base64 = null;
    let pairingCode = null;

    // Tenta extrair de diferentes estruturas possíveis
    if (data?.base64) {
      base64 = data.base64;
      pairingCode = data.pairingCode || data.code;
    } else if (data?.qrcode) {
      // qrcode pode ser string ou objeto
      if (typeof data.qrcode === 'string') {
        base64 = data.qrcode;
        pairingCode = data.pairingCode || data.code;
      } else if (typeof data.qrcode === 'object') {
        base64 = data.qrcode.base64 || data.qrcode.code || data.qrcode.qrcode;
        pairingCode = data.qrcode.pairingCode || data.qrcode.code;
      }
    } else if (typeof data === "string") {
      base64 = data;
    }

    if (!base64) {
      console.error("[WhatsApp] QR Code não encontrado na resposta:", data);
      throw new Error("QR Code não disponível na resposta da API");
    }

    const qrcode = formatQRCodeBase64(base64);

    return {
      qrcode,
      pairingCode,
    };
  } catch (error) {
    console.error("[WhatsApp] Erro ao obter QR Code:", error.response?.data || error.message);

    // Se a instância não está em estado de espera de QR, pode ser que já esteja conectada
    if (error.response?.status === 400 || error.response?.status === 404) {
      throw new Error("Instância não está aguardando QR Code. Verifique o status da conexão.");
    }

    throw new Error(`Falha ao obter QR Code: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Verifica o status da conexão da instância
 * @param {string} instanceName - Nome da instância
 * @returns {Promise<{status: string, connectedNumber?: string, instance?: object}>}
 */
export async function getConnectionStatus(instanceName) {
  try {

    // Tenta primeiro o endpoint fetchInstances que retorna informações mais completas
    let data = null;
    let state = null;
    let connectedNumber = null;

    try {
      const fetchResponse = await api.get(`/instance/fetchInstances`, {
        params: { instanceName },
      });

      // fetchInstances retorna um array, pegamos a instância correspondente
      const instances = Array.isArray(fetchResponse.data) ? fetchResponse.data : [fetchResponse.data];
      const instance = instances.find((i) => i.name === instanceName || i.instanceName === instanceName) || instances[0];

      if (instance) {
        state = instance.connectionStatus || instance.state || instance.status;
        connectedNumber = instance.ownerJid || instance.owner || instance.number;
        data = instance;
      }
    } catch (fetchError) {
      console.log(`[WhatsApp] fetchInstances falhou, tentando connectionState...`);
    }

    // Se não conseguiu com fetchInstances, tenta connectionState
    if (!state) {
      const response = await api.get(`/instance/connectionState/${instanceName}`);

      data = response.data;
      state = data?.state || data?.instance?.state || data?.connectionState;
      connectedNumber = data?.instance?.owner || data?.instance?.wuid || data?.owner || data?.wuid;
    }

    let status = "disconnected";

    // Mapeia os estados da Evolution API para nosso formato
    // Estados possíveis: open, close, connecting, qr, connected
    if (state === "open" || state === "connected") {
      status = "connected";
    } else if (state === "connecting" || state === "qr") {
      status = "connecting";
    } else if (state === "close" || state === "disconnected") {
      status = "disconnected";
    }

    // Remove o sufixo @s.whatsapp.net se existir
    if (connectedNumber && connectedNumber.includes("@")) {
      connectedNumber = connectedNumber.split("@")[0];
    }

    return {
      status,
      connectedNumber,
      instance: data,
    };
  } catch (error) {
    // Se o erro for 404, a instância não existe - apenas loga em nível de info
    if (error.response?.status === 404) {
      console.log(`[WhatsApp] Instância ${instanceName} não existe (404)`);
      return {
        status: "disconnected",
        connectedNumber: null,
      };
    }

    // Para outros erros, loga como erro
    console.error("[WhatsApp] Erro ao verificar status:", {
      status: error.response?.status,
      error: error.response?.data?.error || error.message,
      response: error.response?.data
    });

    throw new Error(`Falha ao verificar status: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Desconecta a instância do WhatsApp (logout)
 * @param {string} instanceName - Nome da instância
 * @returns {Promise<{message: string}>}
 */
export async function disconnectInstance(instanceName) {
  try {
    console.log(`[WhatsApp] Desconectando instância: ${instanceName}`);

    await api.delete(`/instance/logout/${instanceName}`);

    console.log(`[WhatsApp] Instância desconectada: ${instanceName}`);

    return {
      message: "Desconectado com sucesso",
    };
  } catch (error) {
    console.error("[WhatsApp] Erro ao desconectar:", error.response?.data || error.message);

    // Não lançar erro se a instância já estiver desconectada
    if (error.response?.status === 404 || error.response?.status === 400) {
      return {
        message: "Instância já estava desconectada",
      };
    }

    throw new Error(`Falha ao desconectar: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Configura ou atualiza o webhook de uma instância existente
 * @param {string} instanceName - Nome da instância
 * @returns {Promise<{message: string}>}
 */
export async function setWebhook(instanceName) {
  try {
    const webhookUrl = `${WEBHOOK_BASE_URL}/api/whatsapp/webhook/${instanceName}`;
    console.log(`[WhatsApp] Configurando webhook para: ${instanceName}`);
    console.log(`[WhatsApp] Webhook URL: ${webhookUrl}`);

    const response = await api.post(`/webhook/set/${instanceName}`, {
      enabled: true,
      url: webhookUrl,
      webhookByEvents: false,
      webhookBase64: true,
      events: [
        "CONNECTION_UPDATE",
        "QRCODE_UPDATED",
        "MESSAGES_UPSERT",
      ],
    });

    return {
      message: "Webhook configurado com sucesso",
      data: response.data,
    };
  } catch (error) {
    console.error("[WhatsApp] Erro ao configurar webhook:", error.response?.data || error.message);
    throw new Error(`Falha ao configurar webhook: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Reinicia uma instância (útil para reconexão)
 * @param {string} instanceName - Nome da instância
 * @returns {Promise<{message: string}>}
 */
export async function restartInstance(instanceName) {
  try {
    console.log(`[WhatsApp] Reiniciando instância: ${instanceName}`);

    const response = await api.post(`/instance/restart/${instanceName}`);

    return {
      message: "Instância reiniciada com sucesso",
      data: response.data,
    };
  } catch (error) {
    console.error("[WhatsApp] Erro ao reiniciar instância:", error.response?.data || error.message);

    // Se erro 404, a instância não existe
    if (error.response?.status === 404) {
      throw new Error("Instância não encontrada");
    }

    throw new Error(`Falha ao reiniciar: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Deleta completamente a instância
 * @param {string} instanceName - Nome da instância
 * @returns {Promise<{message: string}>}
 */
export async function deleteInstance(instanceName) {
  try {
    console.log(`[WhatsApp] Deletando instância: ${instanceName}`);

    await api.delete(`/instance/delete/${instanceName}`);

    console.log(`[WhatsApp] Instância deletada: ${instanceName}`);

    return {
      message: "Instância deletada com sucesso",
    };
  } catch (error) {
    console.error("[WhatsApp] Erro ao deletar instância:", error.response?.data || error.message);

    // Não lançar erro se a instância não existir
    if (error.response?.status === 404) {
      return {
        message: "Instância não encontrada (já deletada)",
      };
    }

    throw new Error(`Falha ao deletar instância: ${error.response?.data?.message || error.message}`);
  }
}
