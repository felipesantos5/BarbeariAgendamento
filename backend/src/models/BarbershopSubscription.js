// Modelo de Assinatura de Barbearia (instância do plano para cada barbearia)
import mongoose from "mongoose";

const BarbershopSubscriptionSchema = new mongoose.Schema(
  {
    barbershop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barbershop",
      required: true,
      unique: true, // Cada barbearia tem apenas uma assinatura ativa
    },
    // Referência ao plano base (pode ser null se for customizado)
    basePlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      default: null,
    },
    // Dados da assinatura (podem ser customizados)
    planName: {
      type: String,
      required: true,
      trim: true,
    },
    monthlyPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    // Datas
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    nextBillingDate: {
      type: Date,
      required: true,
    },
    // Status
    status: {
      type: String,
      enum: ["active", "suspended", "cancelled"],
      default: "active",
    },
    // Notas/observações
    notes: {
      type: String,
      trim: true,
    },
    // Histórico de pagamentos
    paymentHistory: [
      {
        date: {
          type: Date,
          required: true,
        },
        amount: {
          type: Number,
          required: true,
        },
        status: {
          type: String,
          enum: ["paid", "pending", "failed"],
          default: "pending",
        },
        notes: String,
      },
    ],
  },
  { timestamps: true }
);

// Índices para performance
BarbershopSubscriptionSchema.index({ status: 1 });
BarbershopSubscriptionSchema.index({ nextBillingDate: 1 });

// Método para calcular próxima data de cobrança
BarbershopSubscriptionSchema.methods.calculateNextBillingDate = function () {
  const nextDate = new Date(this.nextBillingDate);
  nextDate.setMonth(nextDate.getMonth() + 1);
  return nextDate;
};

// Método para adicionar pagamento
BarbershopSubscriptionSchema.methods.addPayment = function (amount, status = "paid", notes = "") {
  this.paymentHistory.push({
    date: new Date(),
    amount,
    status,
    notes,
  });
  
  if (status === "paid") {
    this.nextBillingDate = this.calculateNextBillingDate();
  }
  
  return this.save();
};

export default mongoose.model("BarbershopSubscription", BarbershopSubscriptionSchema);
