import 'dotenv/config';
import { sendDiscordNotification, createReminderLogEmbed } from '../services/discordService.js';

const DISCORD_LOGS_WEBHOOK_URL = process.env.DISCORD_LOGS_WEBHOOK_URL;

async function test() {
  console.log('--- Iniciando Teste de Webhook do Discord ---');
  console.log(`Webhook URL: ${DISCORD_LOGS_WEBHOOK_URL ? 'Configurada' : 'NÃO CONFIGURADA'}`);

  if (!DISCORD_LOGS_WEBHOOK_URL) {
    console.error('ERRO: DISCORD_LOGS_WEBHOOK_URL não encontrada no .env');
    return;
  }

  const testEmbed = createReminderLogEmbed(
    '🧪 Teste de Integração - Logs de Lembretes',
    3447003, // Blue
    [
      { name: 'Status', value: 'Teste de conexão bem-sucedido', inline: true },
      { name: 'Ambiente', value: 'Desenvolvimento', inline: true }
    ]
  );

  console.log('Enviando notificação de teste...');
  await sendDiscordNotification(DISCORD_LOGS_WEBHOOK_URL, testEmbed);
  console.log('Se nenhuma mensagem de erro apareceu acima, o envio foi processado.');
  console.log('--- Fim do Teste ---');
}

test();
