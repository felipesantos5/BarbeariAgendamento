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
  failureThreshold: 3, // Abre o circuito após 3 falhas consecutivas
  maxLogFailures: 10, // Para de logar após 10 falhas para não poluir

  // Backoff exponencial
  baseDelayMs: 30000, // Começa com 30 segundos
  maxDelayMs: 3600000, // Máximo de 1 hora (3600000ms)
  currentDelayMs: 30000,
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

  const cleanPhone = customerPhone.replace(/\D/g, "");

  const url = `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`;

  const payload = {
    number: `55${cleanPhone}`,
    linkPreview: false,
    text: message,
  };

  const headers = {
    "Content-Type": "application/json",
    apikey: EVOLUTION_API_KEY,
  };

  try {
    await axios.post(url, payload, {
      headers,
      timeout: 10000, // Timeout de 10s para não travar o processo
    });

    circuitBreaker.recordSuccess();
    return { success: true };
  } catch (error) {
    // Registra a falha no circuit breaker
    circuitBreaker.recordFailure();

    // Log detalhado apenas nas primeiras falhas
    if (circuitBreaker.failures <= circuitBreaker.maxLogFailures) {
      console.error(
        `[WhatsApp] ❌ Falha ao enviar mensagem (${circuitBreaker.consecutiveFailures}/${circuitBreaker.failureThreshold}):`
      );

      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Resposta:`, error.response.data);

        if (error.response.status === 400) {
          console.error(`   Telefone: 55${cleanPhone}`);
          console.error(`   Instância: ${INSTANCE_NAME}`);
        }
      } else if (error.code === "ECONNREFUSED") {
        console.error(`   Erro: Conexão recusada - Evolution API pode estar offline`);
      } else if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
        console.error(`   Erro: Timeout - Evolution API não respondeu em 10s`);
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
