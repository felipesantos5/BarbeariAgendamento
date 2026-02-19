import Barbershop from "../models/Barbershop.js";
import { sendWhatsAppConfirmation } from "./evolutionWhatsapp.js";
import axios from "axios";
import { sendDiscordNotification, createReminderLogEmbed } from "./discordService.js";
import { getRedisClient } from "../config/redis.js";

const DISCORD_LOGS_WEBHOOK_URL = process.env.DISCORD_LOGS_WEBHOOK_URL;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

// --- Utilitário: sleep ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Formata o telefone para a Evolution API (sem duplicar o DDI 55) ---
function buildEvolutionNumber(rawPhone) {
  const cleaned = rawPhone.replace(/\D/g, "");
  if (cleaned.startsWith("55") && (cleaned.length === 12 || cleaned.length === 13)) {
    return cleaned;
  }
  return `55${cleaned}`;
}

// --- Classifica se o erro é retentável ---
function isRetryableError(error) {
  if (!error.response) {
    // Erros de rede sem resposta do servidor
    return ["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "ENOTFOUND", "EAI_AGAIN"].includes(error.code);
  }
  const status = error.response.status;
  // 429 (rate limit) e 5xx (servidor) são retentáveis
  return status === 429 || (status >= 500 && status < 600);
}

// --- Classifica se erro indica instância desconectada/inexistente ---
function isInstanceGoneError(error) {
  if (!error.response) return false;
  return [401, 403, 404].includes(error.response.status);
}

/**
 * Retry com backoff exponencial + jitter para evitar thundering herd
 */
async function withRetry(requestFn, { maxAttempts = 3, initialDelayMs = 3000, maxDelayMs = 25000, label = "" } = {}) {
  let lastError;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await requestFn();
      if (attempt > 1) {
        console.log(`[Retry] ✅ ${label} — sucesso na tentativa ${attempt}/${maxAttempts}`);
      }
      return result;
    } catch (error) {
      lastError = error;

      const retryable = isRetryableError(error);
      const isLast = attempt === maxAttempts;

      if (!retryable || isLast) {
        throw error;
      }

      const jitter = delayMs * 0.2 * (Math.random() * 2 - 1);
      const waitMs = Math.min(Math.round(delayMs + jitter), maxDelayMs);

      console.warn(
        `[Retry] ⚠️  ${label} — tentativa ${attempt}/${maxAttempts} falhou ` +
        `(${error.code || error.response?.status}). Aguardando ${waitMs}ms...`
      );

      await sleep(waitMs);
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Envia mensagem WhatsApp usando instância da barbearia se disponível,
 * caso contrário usa instância padrão.
 *
 * Estratégia de resiliência:
 * 1. Tenta instância da barbearia com retry (3 tentativas)
 * 2. Se instância sumir (404/401/403) → fallback imediato para instância padrão
 * 3. Se erro retentável persistir → fallback para instância padrão
 * 4. Se não tem instância própria → instância padrão com retry (via evolutionWhatsapp)
 */
export async function sendWhatsAppMessage(barbershopId, customerPhone, message) {
  let result;

  try {
    // Buscar configuração WhatsApp da barbearia
    const barbershop = await Barbershop.findById(barbershopId).select("whatsappConfig");

    // Verificar se barbearia tem WhatsApp próprio conectado
    const hasOwnWhatsApp =
      barbershop?.whatsappConfig?.enabled === true &&
      barbershop?.whatsappConfig?.connectionStatus === "connected" &&
      barbershop?.whatsappConfig?.instanceName;

    if (hasOwnWhatsApp) {
      // Tentar instância própria (com retry + fallback automático)
      result = await sendViaInstance(
        barbershop.whatsappConfig.instanceName,
        customerPhone,
        message,
        barbershopId
      );
    } else {
      // Sem instância própria → vai direto para instância padrão
      result = await sendWhatsAppConfirmation(customerPhone, message);
    }
  } catch (error) {
    // Erro inesperado na camada de roteamento (ex: erro de DB na busca da barbearia)
    console.error("[WhatsAppRouter] Erro crítico ao rotear mensagem:", error.message);

    // Incrementar falha no Redis (não bloqueia)
    getRedisClient().then(redis => {
      if (redis) redis.incr("stats:daily:whatsapp_attempts");
    }).catch(() => {});

    if (DISCORD_LOGS_WEBHOOK_URL) {
      sendDiscordNotification(DISCORD_LOGS_WEBHOOK_URL, createReminderLogEmbed(
        "⚠️ Erro Crítico ao Rotear WhatsApp",
        15548997,
        [
          { name: "Erro", value: error.message.slice(0, 200), inline: false },
          { name: "Telefone", value: customerPhone, inline: true }
        ]
      )).catch(() => {});
    }

    // Último recurso: tenta instância padrão
    try {
      result = await sendWhatsAppConfirmation(customerPhone, message);
    } catch (fallbackError) {
      console.error("[WhatsAppRouter] Fallback também falhou:", fallbackError.message);
      result = { success: false, error: fallbackError.message };
    }
  }

  // Atualizar estatísticas no Redis (não bloqueia)
  getRedisClient().then(redis => {
    if (redis) {
      redis.incr("stats:daily:whatsapp_attempts");
      if (result?.success) {
        redis.incr("stats:daily:whatsapp_successes");
      }
    }
  }).catch(err => console.error("[Stats] Erro ao atualizar Redis:", err.message));

  return result;
}

/**
 * Envia mensagem via instância específica (barbearia) com retry + fallback.
 * - Tenta até 3 vezes em caso de erros de rede/5xx
 * - Em caso de 401/403/404 → marca como desconectada + fallback imediato
 * - Em caso de falha persistente mesmo com retry → fallback para instância padrão
 */
async function sendViaInstance(instanceName, customerPhone, message, barbershopId) {
  const number = buildEvolutionNumber(customerPhone);
  const url = `${EVOLUTION_API_URL}/message/sendText/${instanceName}`;

  const payload = {
    number,
    linkPreview: false,
    text: message,
  };

  const headers = {
    "Content-Type": "application/json",
    apikey: EVOLUTION_API_KEY,
  };

  try {
    await withRetry(
      () => axios.post(url, payload, { headers, timeout: 15000 }),
      {
        maxAttempts: 3,
        initialDelayMs: 3000,
        maxDelayMs: 25000,
        label: `WA-INSTANCE(${instanceName})→${number}`,
      }
    );
    return { success: true, via: "barbershop" };
  } catch (error) {
    const logPrefix = `[WhatsApp] Instância ${instanceName}`;

    if (isInstanceGoneError(error)) {
      // Instância sumiu ou não autorizada → atualiza status no banco e usa fallback
      console.warn(
        `${logPrefix} retornou ${error.response.status}. ` +
        `Marcando como desconectada e usando fallback para instância padrão.`
      );

      // Atualiza status em background (não bloqueia o envio)
      Barbershop.findByIdAndUpdate(barbershopId, {
        "whatsappConfig.connectionStatus": "disconnected",
        "whatsappConfig.lastCheckedAt": new Date(),
      }).catch(dbErr =>
        console.error(`${logPrefix} Erro ao atualizar status no banco:`, dbErr.message)
      );

      return await sendWhatsAppConfirmation(customerPhone, message);
    }

    // Para outros erros (rede, timeout etc.) que persistiram após retry,
    // tenta o fallback antes de desistir
    console.warn(
      `${logPrefix} falhou após retries (${error.code || error.response?.status || error.message}). ` +
      `Tentando fallback para instância padrão...`
    );

    return await sendWhatsAppConfirmation(customerPhone, message);
  }
}
