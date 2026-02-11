import axios from 'axios';

/**
 * Envia uma mensagem ou embed para um webhook do Discord
 * @param {string} webhookUrl - URL do Webhook do Discord
 * @param {object} payload - Corpo da mensagem (content ou embeds)
 */
export const sendDiscordNotification = async (webhookUrl, payload) => {
  if (!webhookUrl) {
    console.warn('[Discord] Webhook URL não configurada. Notificação ignorada.');
    return;
  }

  try {
    await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Discord] Erro ao enviar notificação:', error.message);
  }
};

/**
 * Cria um payload de log de lembretes para o Discord
 * @param {string} title - Título da mensagem
 * @param {number} color - Cor hexadecimal decimal
 * @param {Array} fields - Campos do embed
 * @returns {object} Payload formatado
 */
export const createReminderLogEmbed = (title, color, fields) => {
  return {
    embeds: [{
      title,
      color,
      fields,
      timestamp: new Date().toISOString()
    }]
  };
};
