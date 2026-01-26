import "dotenv/config";
import axios from "axios";

// --- Circuit Breaker ---
// Protege o sistema contra falhas cascata quando a Evolution API cai.
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
        `[CircuitBreaker] ABERTO - Evolution API falhou ${this.failures}x consecutivas. Pausando chamadas por ${this.cooldownMs / 1000}s.`
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
      console.log("[CircuitBreaker] HALF_OPEN - Testando Evolution API...");
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

  // Circuit breaker: se o circuito esta aberto, nem tenta
  if (!circuitBreaker.canRequest()) {
    console.warn(
      `[CircuitBreaker] Chamada bloqueada - Evolution API indisponivel. Mensagem para ${customerPhone} nao enviada.`
    );
    return { success: false, error: "Evolution API indisponivel (circuit breaker aberto)" };
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
      timeout: 10000, // Timeout de 10s para nao travar o processo
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
          console.error("- Numero do telefone:", `55${cleanPhone}`);
          console.error("- Tamanho da mensagem:", message.length);
          console.error("- Instancia:", INSTANCE_NAME);
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
