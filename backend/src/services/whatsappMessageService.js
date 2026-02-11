import Barbershop from "../models/Barbershop.js";
import { sendWhatsAppConfirmation } from "./evolutionWhatsapp.js";
import axios from "axios";
import { sendDiscordNotification, createReminderLogEmbed } from "./discordService.js";
import { getRedisClient } from "../config/redis.js";

const DISCORD_LOGS_WEBHOOK_URL = process.env.DISCORD_LOGS_WEBHOOK_URL;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

/**
 * Envia mensagem WhatsApp usando instância da barbearia se disponível,
 * caso contrário usa instância padrão
 */
export async function sendWhatsAppMessage(barbershopId, customerPhone, message) {
  try {
    // Buscar configuração WhatsApp da barbearia
    const barbershop = await Barbershop.findById(barbershopId).select("whatsappConfig");

    // Verificar se barbearia tem WhatsApp próprio conectado
    const hasOwnWhatsApp =
      barbershop?.whatsappConfig?.enabled === true &&
      barbershop?.whatsappConfig?.connectionStatus === "connected" &&
      barbershop?.whatsappConfig?.instanceName;

    let result;
    if (hasOwnWhatsApp) {
      // Usar instância da barbearia
      result = await sendViaInstance(
        barbershop.whatsappConfig.instanceName,
        customerPhone,
        message,
        barbershopId
      );
    } else {
      // Fallback: usar instância padrão
      result = await sendWhatsAppConfirmation(customerPhone, message);
    }

    // Incrementar estatísticas no Redis (Task em background)
    getRedisClient().then(redis => {
      if (redis) {
        redis.incr("stats:daily:whatsapp_attempts");
        if (result && result.success) {
          redis.incr("stats:daily:whatsapp_successes");
        }
      }
    }).catch(err => console.error("[Stats] Erro ao atualizar Redis:", err.message));

    return result;
  } catch (error) {
    console.error("[WhatsAppRouter] Erro ao rotear mensagem:", error);
    
    // Incrementar falha no Redis
    getRedisClient().then(redis => {
      if (redis) redis.incr("stats:daily:whatsapp_attempts");
    }).catch(() => {});

    // Log de erro no Discord (mantido apenas para erros críticos de roteamento)
    if (DISCORD_LOGS_WEBHOOK_URL) {
      sendDiscordNotification(DISCORD_LOGS_WEBHOOK_URL, createReminderLogEmbed(
        "⚠️ Erro Crítico ao Rotear WhatsApp",
        15548997, // Red
        [
          { name: "Erro", value: error.message, inline: false },
          { name: "Telefone", value: customerPhone, inline: true }
        ]
      )).catch(() => {});
    }

    // Em caso de erro, tenta fallback para instância padrão
    return await sendWhatsAppConfirmation(customerPhone, message);
  }
}

/**
 * Envia mensagem via instância específica (barbearia)
 */
async function sendViaInstance(instanceName, customerPhone, message, barbershopId) {
  const cleanPhone = customerPhone.replace(/\D/g, "");
  const url = `${EVOLUTION_API_URL}/message/sendText/${instanceName}`;

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
    await axios.post(url, payload, { headers, timeout: 10000 });
    return { success: true, via: "barbershop" };
  } catch (error) {
    console.error(`[WhatsApp] Erro ao enviar via instância ${instanceName}:`, error.message);

    // Se instância não existe mais (404/401), marcar como desconectada e usar fallback
    if (error.response?.status === 404 || error.response?.status === 401) {
      await Barbershop.findByIdAndUpdate(barbershopId, {
        "whatsappConfig.connectionStatus": "disconnected",
        "whatsappConfig.lastCheckedAt": new Date()
      });
      console.warn(`[WhatsApp] Instância ${instanceName} desconectada. Usando fallback.`);
      return await sendWhatsAppConfirmation(customerPhone, message);
    }

    throw error;
  }
}
