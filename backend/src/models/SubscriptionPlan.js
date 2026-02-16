// Modelo de Planos Base (Templates)
import mongoose from "mongoose";

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    monthlyPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    features: [
      {
        type: String,
        trim: true,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    // Características do plano
    maxBarbers: {
      type: Number,
      default: null, // null = ilimitado
    },
    maxServices: {
      type: Number,
      default: null, // null = ilimitado
    },
    hasWhatsAppIntegration: {
      type: Boolean,
      default: false,
    },
    hasLoyaltyProgram: {
      type: Boolean,
      default: false,
    },
    hasPaymentIntegration: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("SubscriptionPlan", SubscriptionPlanSchema);
