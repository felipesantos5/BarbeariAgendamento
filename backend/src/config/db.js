import mongoose from "mongoose";
import "dotenv/config";

const connectDB = () => {
  console.log("Tentando conectar ao MongoDB...");

  const dbOptions = {
    serverSelectionTimeoutMS: 5000, // Tenta por 5s antes de dar erro
    socketTimeoutMS: 45000, // Fecha sockets inativos após 45s
    maxPoolSize: 50,        // Pool de 50 conexões simultâneas
    minPoolSize: 10,        // 10 conexões sempre abertas
    maxIdleTimeMS: 30000,   // Fecha idle após 30s
    compressors: ['zlib'],  // Compressão de documentos grandes
    zlibCompressionLevel: 6,
  };

  mongoose
    .connect(process.env.MONGODB_URI, dbOptions)
    .then(() => {
      console.log("✅ Conexão com MongoDB estabelecida com sucesso!");
      console.log(`📊 MongoDB pool size: ${dbOptions.maxPoolSize}`);
    })
    .catch((err) => console.error("❌ Erro inicial de conexão com o MongoDB:", err.message));
};

// --- LÓGICA DE RECONEXÃO ---
const db = mongoose.connection;

db.on("error", console.error.bind(console, "❌ Erro de conexão com o MongoDB:"));
db.on("disconnected", () => {
  console.log("🔌 MongoDB desconectado. Tentando reconectar...");
  // O Mongoose tentará reconectar automaticamente por padrão.
  // Você pode adicionar lógicas customizadas aqui se necessário.
});
db.on("reconnected", () => {
  console.log("✅ MongoDB reconectado!");
});

export default connectDB;
