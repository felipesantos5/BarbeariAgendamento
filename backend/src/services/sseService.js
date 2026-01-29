// Armazena as conexões SSE ativas, organizadas por barbershopId
const clients = new Map();
const clientMetadata = new Map(); // Stores connection metadata

const MAX_CONNECTIONS_PER_BARBERSHOP = 10;
const CONNECTION_TIMEOUT_MS = 3600000; // 1 hora

/**
 * Adiciona um novo cliente (conexão SSE) à lista para uma barbearia específica.
 * @param {string} barbershopId ID da barbearia.
 * @param {object} client A resposta (res) do Express que representa a conexão.
 */
function addClient(barbershopId, client) {
  if (!clients.has(barbershopId)) {
    clients.set(barbershopId, []);
  }

  const barbershopClients = clients.get(barbershopId);

  // Check connection limit
  if (barbershopClients.length >= MAX_CONNECTIONS_PER_BARBERSHOP) {
    // Remove oldest connection
    const oldestClient = barbershopClients.shift();
    const oldestMetadata = clientMetadata.get(oldestClient);
    if (oldestMetadata?.timeout) {
      clearTimeout(oldestMetadata.timeout);
    }
    clientMetadata.delete(oldestClient);
    try {
      oldestClient.end();
    } catch (err) {
      // Ignore errors when closing old connection
    }
    console.log(`[SSE] Limite atingido. Conexão mais antiga removida para barbershop ${barbershopId}`);
  }

  barbershopClients.push(client);

  // Set timeout for this connection
  const timeout = setTimeout(() => {
    console.log(`[SSE] Timeout de conexão para barbershop ${barbershopId}`);
    removeClient(barbershopId, client);
    try {
      client.end();
    } catch (err) {
      // Ignore errors
    }
  }, CONNECTION_TIMEOUT_MS);

  // Store metadata
  clientMetadata.set(client, {
    barbershopId,
    connectedAt: new Date(),
    timeout,
  });

  console.log(`[SSE] Cliente conectado. Total para barbershop ${barbershopId}: ${barbershopClients.length}`);
}

/**
 * Remove um cliente da lista (quando ele se desconecta).
 * @param {string} barbershopId ID da barbearia.
 * @param {object} client A resposta (res) do Express a ser removida.
 */
function removeClient(barbershopId, client) {
  const barbershopClients = clients.get(barbershopId);
  if (barbershopClients) {
    clients.set(
      barbershopId,
      barbershopClients.filter((c) => c !== client)
    );
    // Limpa o mapa se não houver mais clientes para essa barbearia
    if (clients.get(barbershopId).length === 0) {
      clients.delete(barbershopId);
    }
  }

  // Clear timeout and remove metadata
  const metadata = clientMetadata.get(client);
  if (metadata?.timeout) {
    clearTimeout(metadata.timeout);
  }
  clientMetadata.delete(client);

  console.log(`[SSE] Cliente desconectado de barbershop ${barbershopId}`);
}

/**
 * Envia um evento SSE para todos os clientes conectados a uma barbearia específica.
 * @param {string} barbershopId ID da barbearia para notificar.
 * @param {string} eventName Nome do evento (ex: 'new_booking').
 * @param {object} data Dados a serem enviados (opcional).
 */
function sendEventToBarbershop(barbershopId, eventName, data = {}) {
  const barbershopClients = clients.get(barbershopId);
  if (barbershopClients && barbershopClients.length > 0) {
    const message = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    console.log(`[SSE] Enviando evento '${eventName}' para ${barbershopClients.length} cliente(s) da barbershop ${barbershopId}`);

    // Send with error handling, removing dead connections
    const deadClients = [];
    barbershopClients.forEach((client) => {
      try {
        client.write(message);
      } catch (err) {
        console.error(`[SSE] Erro ao enviar mensagem, removendo cliente morto:`, err.message);
        deadClients.push(client);
      }
    });

    // Remove dead connections
    deadClients.forEach((client) => removeClient(barbershopId, client));
  }
}

/**
 * Get connection statistics
 * @returns {object} Statistics about active connections
 */
function getConnectionStats() {
  const totalBarbershops = clients.size;
  let totalConnections = 0;
  const connectionsByBarbershop = {};

  for (const [barbershopId, clientList] of clients.entries()) {
    totalConnections += clientList.length;
    connectionsByBarbershop[barbershopId] = clientList.length;
  }

  return {
    totalBarbershops,
    totalConnections,
    connectionsByBarbershop,
    maxPerBarbershop: MAX_CONNECTIONS_PER_BARBERSHOP,
  };
}

export { addClient, removeClient, sendEventToBarbershop, getConnectionStats };
