import Redis from "ioredis";
import "dotenv/config";

let redisClient = null;

const createRedisClient = () => {
  const client = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) {
        console.log("⚠️ Redis: Máximo de tentativas alcançado. Cache desabilitado.");
        return null;
      }
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  client.on("connect", () => {
    console.log("✅ Redis conectado");
  });

  client.on("ready", () => {
    console.log("✅ Redis pronto para uso");
  });

  client.on("error", (err) => {
    console.error("❌ Redis error:", err.message);
  });

  client.on("close", () => {
    console.log("🔌 Redis desconectado");
  });

  return client;
};

export const getRedisClient = async () => {
  if (!redisClient) {
    redisClient = createRedisClient();
    try {
      await redisClient.connect();
    } catch (err) {
      console.error("❌ Falha ao conectar Redis:", err.message);
      console.log("⚠️ App continuará sem cache");
      redisClient = null;
    }
  }
  return redisClient;
};

export const cacheService = {
  async get(key) {
    if (!redisClient) return null;
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error(`❌ Erro ao buscar cache [${key}]:`, err.message);
      return null;
    }
  },

  async set(key, value, ttlSeconds = 300) {
    if (!redisClient) return false;
    try {
      await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(`❌ Erro ao salvar cache [${key}]:`, err.message);
      return false;
    }
  },

  async del(key) {
    if (!redisClient) return false;
    try {
      await redisClient.del(key);
      return true;
    } catch (err) {
      console.error(`❌ Erro ao deletar cache [${key}]:`, err.message);
      return false;
    }
  },

  async delPattern(pattern) {
    if (!redisClient) return false;
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
      return true;
    } catch (err) {
      console.error(`❌ Erro ao deletar padrão [${pattern}]:`, err.message);
      return false;
    }
  },
};

export default { getRedisClient, cacheService };
