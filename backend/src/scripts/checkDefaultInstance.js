// Script para verificar o status da sessao padrao "default" na WAHA
import "dotenv/config";
import axios from "axios";

const WAHA_API_URL = process.env.WAHA_API_URL;
const WAHA_API_KEY = process.env.WAHA_API_KEY;

async function checkDefaultInstance() {
  const sessionName = "default";

  console.log("=== DIAGNOSTICO DA SESSAO PADRAO (WAHA) ===\n");
  console.log(`WAHA API URL: ${WAHA_API_URL}`);
  console.log(`Sessao: ${sessionName}\n`);

  const api = axios.create({
    baseURL: WAHA_API_URL,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": WAHA_API_KEY,
    },
    timeout: 10000,
  });

  try {
    // 1. Verifica se a sessao existe
    console.log("1. Verificando se a sessao existe...");
    const statusResponse = await api.get(`/api/sessions/${sessionName}`);
    console.log("Sessao existe!");
    console.log("Status:", JSON.stringify(statusResponse.data, null, 2));
    console.log("");

    // 2. Verifica conexao
    const status = statusResponse.data?.status;
    if (status === "WORKING") {
      console.log("Sessao CONECTADA e pronta para enviar mensagens\n");
    } else {
      console.log(`Sessao NAO CONECTADA (estado: ${status})`);
      console.log("Para conectar, acesse o dashboard WAHA e escaneie o QR code.\n");
    }

    // 3. Testa envio de mensagem (numero de teste)
    console.log("3. Testando envio de mensagem...");
    console.log("Pulando teste de envio (configure um numero de teste se necessario)\n");

    // 4. Lista todas as sessoes
    console.log("4. Listando todas as sessoes...");
    try {
      const sessionsResponse = await api.get("/api/sessions?all=true");
      const sessions = Array.isArray(sessionsResponse.data)
        ? sessionsResponse.data
        : [sessionsResponse.data];

      console.log(`\nTotal de sessoes: ${sessions.length}`);
      sessions.forEach((sess, index) => {
        console.log(`\n--- Sessao ${index + 1} ---`);
        console.log(`Nome: ${sess.name}`);
        console.log(`Status: ${sess.status}`);
        console.log(`Numero: ${sess.me?.id || "N/A"}`);
      });
    } catch (listError) {
      console.log("Erro ao listar sessoes:", listError.message);
    }

    console.log("\n=== DIAGNOSTICO CONCLUIDO ===");
    process.exit(0);

  } catch (error) {
    console.error("\nERRO NO DIAGNOSTICO:");

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Erro: ${error.response.data?.error || error.response.statusText}`);
      console.error(`Detalhes:`, JSON.stringify(error.response.data, null, 2));

      if (error.response.status === 404) {
        console.log("\nA sessao 'default' NAO EXISTE!");
        console.log("\nPara criar a sessao 'default', execute:");
        console.log(`curl -X POST "${WAHA_API_URL}/api/sessions" \\`);
        console.log(`  -H "Content-Type: application/json" \\`);
        console.log(`  -H "X-Api-Key: <SUA_CHAVE>" \\`);
        console.log(`  -d '{"name":"default","start":true}'`);
      }
    } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      console.error("TIMEOUT: A WAHA API nao respondeu em 10 segundos");
      console.error("Verifique se o servico esta rodando e acessivel.");
    } else {
      console.error("Codigo:", error.code);
      console.error("Mensagem:", error.message);
    }

    console.log("\n=== DIAGNOSTICO FALHOU ===");
    process.exit(1);
  }
}

checkDefaultInstance();
