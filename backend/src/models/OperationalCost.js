import mongoose from "mongoose";

const operationalCostSchema = new mongoose.Schema(
  {
    barbershop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barbershop",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "rent", // Aluguel
        "electricity", // Luz/Energia
        "water", // Água
        "internet", // Internet
        "materials", // Materiais (produtos de limpeza, toalhas, etc)
        "maintenance", // Manutenção
        "marketing", // Marketing/Publicidade
        "salary", // Salários fixos
        "bonus", // Extras/Bônus para barbeiros
        "taxes", // Impostos
        "insurance", // Seguro
        "equipment", // Equipamentos
        "other", // Outros
      ],
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Índice composto para consultas eficientes
operationalCostSchema.index({ barbershop: 1, date: -1 });
operationalCostSchema.index({ barbershop: 1, type: 1 });

const OperationalCost = mongoose.model("OperationalCost", operationalCostSchema);

export default OperationalCost;
