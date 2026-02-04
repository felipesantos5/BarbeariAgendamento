// Modelo de Despesas/Gastos do SuperAdmin
import mongoose from "mongoose";

const ExpenseSchema = new mongoose.Schema(
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
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    type: {
      type: String,
      enum: ["monthly", "one-time"], // mensal ou esporádico
      required: true,
      default: "monthly",
    },
    category: {
      type: String,
      trim: true,
      default: "Outros",
    },
    // Para despesas esporádicas
    date: {
      type: Date,
      required: function() {
        return this.type === "one-time";
      },
    },
    // Para despesas mensais
    startDate: {
      type: Date,
      required: function() {
        return this.type === "monthly";
      },
    },
    endDate: {
      type: Date,
      default: null, // null = sem data de término
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Método para verificar se a despesa está ativa em um determinado mês
ExpenseSchema.methods.isActiveInMonth = function(year, month) {
  if (!this.isActive) return false;
  
  if (this.type === "one-time") {
    const expenseDate = new Date(this.date);
    return expenseDate.getFullYear() === year && expenseDate.getMonth() === month;
  }
  
  // Para despesas mensais
  const checkDate = new Date(year, month, 1);
  const start = new Date(this.startDate);
  
  if (checkDate < start) return false;
  
  if (this.endDate) {
    const end = new Date(this.endDate);
    if (checkDate > end) return false;
  }
  
  return true;
};

// Índices para performance
ExpenseSchema.index({ isActive: 1 });
ExpenseSchema.index({ type: 1 });
ExpenseSchema.index({ category: 1 });

const Expense = mongoose.model("Expense", ExpenseSchema);

export default Expense;
