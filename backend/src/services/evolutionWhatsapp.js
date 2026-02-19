import "dotenv/config";
import axios from "axios";

// --- Circuit Breaker Avançado com Backoff Exponencial ---
// Protege o sistema contra falhas cascata quando a Evolution API cai.
// Estados: CLOSED (normal) -> OPEN (bloqueado) -> HALF_OPEN (testando)
const circuitBreaker = {
  state: "CLOSED",
  failures: 0,
  consecutiveFailures: 0,
  totalBlockedRequests: 0,

  // Thresholds
  failureThreshold: 5, // Abre o circuito após 5 falhas consecutivas
  maxLogFailures: 10, // Para de logar após 10 falhas para não poluir

  // Backoff exponencial
  baseDelayMs: 60000, // Começa com 60 segundos
  maxDelayMs: 3600000, // Máximo de 1 hora (3600000ms)
  currentDelayMs: 60000,
  backoffMultiplier: 2,

  lastFailureTime: null,
  lastLogTime: null,
  logIntervalMs: 300000, // Log a cada 5 minutos quando bloqueado

  recordFailure() {
    this.failures++;
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    // Abre o circuito se atingir o threshold
    if (this.consecutiveFailures >= this.failureThreshold && this.state !== "OPEN") {
      this.state = "OPEN";
      this.currentDelayMs = this.baseDelayMs;

      if (this.failures <= this.maxLogFailures) {
        console.warn(
          `[CircuitBreaker] 🔴 ABERTO - Evolution API falhou ${this.consecutiveFailures}x consecutivas. ` +
          `Pausando por ${this.currentDelayMs / 1000}s. ` +
          `Sistema continuará funcionando normalmente sem WhatsApp.`
        );
      }
    }
    // Se já está aberto, aumenta o delay exponencialmente
    else if (this.state === "OPEN") {
      this.currentDelayMs = Math.min(
        this.currentDelayMs * this.backoffMultiplier,
        this.maxDelayMs
      );

      // Log periódico apenas
      const shouldLog = !this.lastLogTime ||
                       (Date.now() - this.lastLogTime) >= this.logIntervalMs;

      if (shouldLog && this.failures <= this.maxLogFailures * 2) {
        console.warn(
          `[CircuitBreaker] ⏳ Evolution API ainda indisponível. ` +
          `Próxima tentativa em ${Math.round(this.currentDelayMs / 1000)}s. ` +
          `Total de falhas: ${this.failures} | Bloqueadas: ${this.totalBlockedRequests}`
        );
        this.lastLogTime = Date.now();
      }
    }
    // Log reduzido após muitas falhas
    else if (this.failures <= this.maxLogFailures) {
      console.error(
        `[CircuitBreaker] ⚠️  Falha ${this.consecutiveFailures}/${this.failureThreshold} - ` +
        `Evolution API instável`
      );
    }
  },

  recordSuccess() {
    const wasOpen = this.state === "OPEN";
    const previousFailures = this.failures;

    this.consecutiveFailures = 0;
    this.state = "CLOSED";
    this.currentDelayMs = this.baseDelayMs;

    if (wasOpen || previousFailures > 0) {
      console.log(
        `[CircuitBreaker] ✅ RECUPERADO - Evolution API respondendo normalmente. ` +
        `Falhas anteriores: ${previousFailures} | Requisições bloqueadas: ${this.totalBlockedRequests}`
      );
      // Reseta apenas o contador de bloqueios após recuperação
      this.totalBlockedRequests = 0;
    }
  },

  canRequest() {
    // Circuito fechado - tudo normal
    if (this.state === "CLOSED") return true;

    // Circuito aberto - verifica se o delay passou
    const timeSinceLastFailure = Date.now() - this.lastFailureTime;

    if (timeSinceLastFailure >= this.currentDelayMs) {
      this.state = "HALF_OPEN";
      console.log(
        `[CircuitBreaker] 🔄 HALF_OPEN - Testando Evolution API após ` +
        `${Math.round(timeSinceLastFailure / 1000)}s de espera...`
      );
      return true;
    }

    // Ainda bloqueado
    this.totalBlockedRequests++;
    return false;
  },

  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      consecutiveFailures: this.consecutiveFailures,
      totalBlockedRequests: this.totalBlockedRequests,
      currentDelayMs: this.currentDelayMs,
      nextRetryIn: this.lastFailureTime
        ? Math.max(0, this.currentDelayMs - (Date.now() - this.lastFailureTime))
        : 0,
    };
  },
};

export function getCircuitBreakerState() {
  return circuitBreaker.getStatus();
}

// --- Utilitário: sleep ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Utilitário: formata telefone para a Evolution API ---
// Garante que o número tenha o DDI 55 sem duplicar
function buildEvolutionNumber(rawPhone) {
  const cleaned = rawPhone.replace(/\D/g, "");
  // Se já começa com 55 e tem 12 ou 13 dígitos (55 + DDD + número)
  if (cleaned.startsWith("55") && (cleaned.length === 12 || cleaned.length === 13)) {
    return cleaned;
  }
  return `55${cleaned}`;
}

// --- Classificação de erros para decidir se deve tentar novamente ---
function isRetryableError(error) {
  // Erros de rede (sem resposta do servidor) — sempre retentável
  if (!error.response) {
    return ["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "ENOTFOUND", "EAI_AGAIN"].includes(error.code);
  }

  const status = error.response.status;

  // 429 Too Many Requests — retentável (rate limit)
  // 5xx Erros de servidor — retentável
  if (status === 429 || (status >= 500 && status < 600)) return true;

  // 4xx de cliente (exceto 429) — não retentável (dados inválidos, não autorizado etc.)
  return false;
}

/**
 * Tenta enviar uma requisição HTTP com retry + backoff exponencial.
 * @param {Function} requestFn - Função async que executa a requisição
 * @param {object} options
 * @param {number} options.maxAttempts - Número máximo de tentativas (default: 3)
 * @param {number} options.initialDelayMs - Delay inicial em ms (default: 2000)
 * @param {number} options.maxDelayMs - Delay máximo em ms (default: 30000)
 * @param {string} options.label - Label para logs
 */
async function withRetry(requestFn, { maxAttempts = 3, initialDelayMs = 2000, maxDelayMs = 30000, label = "Request" } = {}) {
  let lastError;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await requestFn();
      if (attempt > 1) {
        console.log(`[Retry] ✅ ${label} - Sucesso na tentativa ${attempt}/${maxAttempts}`);
      }
      return result;
    } catch (error) {
      lastError = error;

      const retryable = isRetryableError(error);
      const isLast = attempt === maxAttempts;

      if (!retryable || isLast) {
        // Não retentável OU esgotou as tentativas
        if (attempt > 1) {
          console.error(`[Retry] ❌ ${label} - Falha definitiva após ${attempt} tentativa(s): ${error.message}`);
        }
        throw error;
      }

      // Adiciona jitter para evitar thundering herd (±20%)
      const jitter = delayMs * 0.2 * (Math.random() * 2 - 1);
      const waitMs = Math.min(Math.round(delayMs + jitter), maxDelayMs);

      console.warn(
        `[Retry] ⚠️  ${label} - Tentativa ${attempt}/${maxAttempts} falhou ` +
        `(${error.code || error.response?.status || error.message}). ` +
        `Aguardando ${waitMs}ms antes de tentar novamente...`
      );

      await sleep(waitMs);
      delayMs = Math.min(delayMs * 2, maxDelayMs); // Backoff exponencial
    }
  }

  throw lastError;
}

export async function sendWhatsAppConfirmation(customerPhone, message) {
  const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
  const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
  const INSTANCE_NAME = "teste";

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    console.error(
      "ERRO DE CONFIGURACAO: As variaveis de ambiente EVOLUTION_API_URL e EVOLUTION_API_KEY sao necessarias."
    );
    return { success: false, error: "Configuracao ausente" };
  }

  // Circuit breaker: se o circuito está aberto, nem tenta
  if (!circuitBreaker.canRequest()) {
    // Não loga cada request bloqueado para não poluir - apenas conta
    return {
      success: false,
      error: "Evolution API temporariamente indisponível",
      blocked: true,
      retryIn: Math.round(circuitBreaker.getStatus().nextRetryIn / 1000),
    };
  }

  const number = buildEvolutionNumber(customerPhone);
  const url = `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`;

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
        maxDelayMs: 20000,
        label: `WA-DEFAULT→${number}`,
      }
    );

    circuitBreaker.recordSuccess();
    return { success: true };
  } catch (error) {
    // Registra a falha no circuit breaker
    circuitBreaker.recordFailure();

    // Log detalhado apenas nas primeiras falhas
    if (circuitBreaker.failures <= circuitBreaker.maxLogFailures) {
      console.error(
        `[WhatsApp] ❌ Falha ao enviar mensagem para ${number} (${circuitBreaker.consecutiveFailures}/${circuitBreaker.failureThreshold}):`
      );

      if (error.response) {
        if (error.response.status === 400) {
          console.error(`   Status: 400 - Dados inválidos (Telefone: ${number})`);
        } else {
          console.error(`   Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
      } else if (error.code === "ECONNREFUSED") {
        console.error(`   Erro: Conexão recusada - Evolution API pode estar offline`);
      } else if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
        console.error(`   Erro: Timeout - Evolution API não respondeu em 15s`);
      } else {
        console.error(`   Erro: ${error.message}`);
      }
    }

    return {
      success: false,
      error: error.response?.data?.message || error.message || "Erro desconhecido",
      status: error.response?.status,
      code: error.code,
    };
  }
}
