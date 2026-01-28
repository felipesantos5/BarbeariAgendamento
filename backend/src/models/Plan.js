import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "O nome do plano é obrigatório."],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "O preço do plano é obrigatório."],
    },
    durationInDays: {
      type: Number,
      required: [true, "A duração do plano em dias é obrigatória (ex: 30 para mensal)."],
    },
    totalCredits: {
      type: Number,
      required: [true, "O número de créditos (usos) do plano é obrigatório (ex: 4)."],
      min: [1, "O plano deve ter pelo menos 1 crédito."],
      default: 1,
    },
    useBarberCommission: {
      type: Boolean,
      default: false, // Se true, usa a comissão do barbeiro que vende
    },
    commissionRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0, // Usado apenas se useBarberCommission = false
    },
    barbershop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barbershop",
      required: true,
    },
  },
  { timestamps: true }
);

const Plan = mongoose.model("Plan", planSchema);

export default Plan;
