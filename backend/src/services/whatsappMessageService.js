import Barbershop from "../models/Barbershop.js";
import { sendWhatsAppConfirmation } from "./evolutionWhatsapp.js";
import axios from "axios";

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

    if (hasOwnWhatsApp) {
      // Usar instância da barbearia
      return await sendViaInstance(
        barbershop.whatsappConfig.instanceName,
        customerPhone,
        message,
        barbershopId
      );
    } else {
      // Fallback: usar instância padrão
      return await sendWhatsAppConfirmation(customerPhone, message);
    }
  } catch (error) {
    console.error("[WhatsAppRouter] Erro ao rotear mensagem:", error);
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
