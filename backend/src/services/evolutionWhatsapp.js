import "dotenv/config";
import axios from "axios";

// --- Circuit Breaker ---
// Protege o sistema contra falhas cascata quando a WAHA API cai.
// Estados: CLOSED (normal) -> OPEN (bloqueado) -> HALF_OPEN (testando)
const circuitBreaker = {
  state: "CLOSED",
  failures: 0,
  failureThreshold: 5, // Abre o circuito apos 5 falhas consecutivas
  cooldownMs: 60000, // Espera 60s antes de tentar novamente
  lastFailureTime: null,

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      console.warn(
        `[CircuitBreaker] ABERTO - WAHA API falhou ${this.failures}x consecutivas. Pausando chamadas por ${this.cooldownMs / 1000}s.`
      );
    }
  },

  recordSuccess() {
    this.failures = 0;
    this.state = "CLOSED";
  },

  canRequest() {
    if (this.state === "CLOSED") return true;

    // Verifica se o cooldown passou
    if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
      this.state = "HALF_OPEN";
      console.log("[CircuitBreaker] HALF_OPEN - Testando WAHA API...");
      return true;
    }

    return false;
  },
};

export function getCircuitBreakerState() {
  return {
    state: circuitBreaker.state,
    failures: circuitBreaker.failures,
    lastFailureTime: circuitBreaker.lastFailureTime,
  };
}

/**
 * Gera delay aleatorio entre min e max milissegundos
 */
function randomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export async function sendWhatsAppConfirmation(customerPhone, message) {
  const WAHA_API_URL = process.env.WAHA_API_URL;
  const WAHA_API_KEY = process.env.WAHA_API_KEY;
  const SESSION_NAME = "default";

  if (!WAHA_API_URL || !WAHA_API_KEY) {
    console.error(
      "ERRO DE CONFIGURACAO: As variaveis de ambiente WAHA_API_URL e WAHA_API_KEY sao necessarias."
    );
    return { success: false, error: "Configuracao ausente" };
  }

  // Circuit breaker: se o circuito esta aberto, nem tenta
  if (!circuitBreaker.canRequest()) {
    console.warn(
      `[CircuitBreaker] Chamada bloqueada - WAHA API indisponivel. Mensagem para ${customerPhone} nao enviada.`
    );
    return { success: false, error: "WAHA API indisponivel (circuit breaker aberto)" };
  }

  const cleanPhone = customerPhone.replace(/\D/g, "");
  const chatId = `55${cleanPhone}@c.us`;

  const headers = {
    "Content-Type": "application/json",
    "X-Api-Key": WAHA_API_KEY,
  };

  try {
    // 1. Simula typing antes de enviar
    try {
      await axios.post(
        `${WAHA_API_URL}/api/${SESSION_NAME}/presence`,
        { chatId, presence: "typing" },
        { headers, timeout: 5000 }
      );
    } catch (typingError) {
      // Nao bloqueia o envio se o typing falhar
      console.warn("[WhatsApp] Erro ao simular typing (nao critico):", typingError.message);
    }

    // 2. Delay aleatorio de 2-3 segundos (simula digitacao humana)
    const delay = randomDelay(2000, 3000);
    await new Promise((resolve) => setTimeout(resolve, delay));

    // 3. Envia a mensagem
    const url = `${WAHA_API_URL}/api/sendText`;
    const payload = {
      session: SESSION_NAME,
      chatId,
      text: message,
    };

    await axios.post(url, payload, {
      headers,
      timeout: 10000,
    });

    circuitBreaker.recordSuccess();
    return { success: true };
  } catch (error) {
    circuitBreaker.recordFailure();

    // Log reduzido para nao poluir quando ha muitas falhas
    if (circuitBreaker.failures <= circuitBreaker.failureThreshold) {
      console.error("FALHA AO ENVIAR MENSAGEM WHATSAPP:");

      if (error.response) {
        console.error(
          "Detalhes do Erro:",
          error.response.data,
          error.response.status
        );

        if (error.response.status === 400) {
          console.error("Erro 400 - Verificar:");
          console.error("- ChatId:", chatId);
          console.error("- Tamanho da mensagem:", message.length);
          console.error("- Session:", SESSION_NAME);
        }
      } else {
        console.error("Erro de Conexao ou Timeout:", error.message);
      }
    }

    return {
      success: false,
      error: error.response?.data?.message || error.message || "Erro desconhecido",
      status: error.response?.status,
    };
  }
}
