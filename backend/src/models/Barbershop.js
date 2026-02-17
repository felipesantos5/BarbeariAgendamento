// src/models/Barbershop.ts
import mongoose from "mongoose";

const AddressSchema = new mongoose.Schema({
  cep: { type: String, default: "" },
  estado: { type: String, default: "" },
  cidade: { type: String, default: "" },
  bairro: { type: String, default: "" },
  rua: { type: String, default: "" },
  numero: { type: String, default: "" },
  complemento: { type: String },
});

const BarbershopSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    address: { type: AddressSchema, required: true },
    logoUrl: { type: String },
    contact: { type: String },
    instagram: { type: String },
    slug: { type: String, required: true, unique: true },
    workingHours: [
      {
        day: { type: String, required: true },
        start: { type: String, required: true },
        end: { type: String, required: true },
      },
    ],
    themeColor: {
      type: String,
      trim: true,
      uppercase: true, // Opcional: armazenar sempre em maiúsculas
      match: [/^#[0-9A-F]{6}$/i, "Formato de cor inválido (ex: #RRGGBB)"], // Validação básica de formato HEX
      default: "#000000", // Uma cor padrão, ex: um vermelho/vinho (ajuste conforme sua preferência)
    },
    LogoBackgroundColor: {
      type: String,
      trim: true,
      uppercase: true,
      match: [/^#[0-9A-F]{6}$/i, "Formato de cor inválido (ex: #RRGGBB)"],
      default: "#000000",
    },
    mercadoPagoAccessToken: { type: String, trim: true },
    mercadoPagoWebhookSecret: { type: String, trim: true },
    paymentsEnabled: { type: Boolean, default: false },
    requireOnlinePayment: {
      type: Boolean,
      default: false,
    },
    loyaltyProgram: {
      enabled: {
        type: Boolean,
        default: false,
      },
      targetCount: {
        type: Number,
        default: 5,
        min: 1,
      },
      // A "recompensa"
      rewardDescription: {
        type: String,
        trim: true,
        default: "1 Corte Grátis",
      },
      returnReminder: {
        enabled: {
          type: Boolean,
          default: false,
        },
      },
    },
    // Trial account fields
    isTrial: {
      type: Boolean,
      default: false,
    },
    trialEndsAt: {
      type: Date,
    },
    accountStatus: {
      type: String,
      enum: ["active", "trial", "inactive"],
      default: "active",
    },
    whatsappConfig: {
      enabled: { type: Boolean, default: false },
      instanceName: { type: String, default: null },
      connectionStatus: {
        type: String,
        enum: ["disconnected", "connecting", "connected"],
        default: "disconnected"
      },
      connectedNumber: { type: String, default: null },
      connectedAt: { type: Date, default: null },
      lastCheckedAt: { type: Date, default: null },
      morningReminderTime: { type: String, default: "08:00" },
      afternoonReminderTime: { type: String, default: "13:00" }
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    taxInfo: {
      regime: {
        type: String,
        enum: ["MEI", "Simples Nacional", "Lucro Presumido", "Não Informado"],
        default: "Não Informado",
      },
      cnpj: { type: String, trim: true },
      municipalRegistration: { type: String, trim: true },
      cnae: { type: String, trim: true },
      simplesNacionalRate: {
        type: Number,
        default: 6, // Alíquota base comum de 6%
        min: 0,
      },
    },
  },
  { timestamps: true }
);

BarbershopSchema.index({ "whatsappConfig.morningReminderTime": 1 });
BarbershopSchema.index({ "whatsappConfig.afternoonReminderTime": 1 });

export default mongoose.model("Barbershop", BarbershopSchema);
