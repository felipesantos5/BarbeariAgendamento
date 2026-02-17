import mongoose from "mongoose";
const { Schema } = mongoose;

const ProductSchema = new Schema(
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
    category: {
      type: String,
      required: true,
      enum: ["pomada", "gel", "shampoo", "condicionador", "minoxidil", "oleo", "cera", "spray", "outros"],
      default: "outros",
    },
    brand: {
      type: String,
      trim: true,
    },
    price: {
      purchase: {
        type: Number,
        required: true,
        min: 0,
      },
      sale: {
        type: Number,
        required: true,
        min: 0,
      },
    },
    stock: {
      current: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },
      minimum: {
        type: Number,
        required: true,
        min: 0,
        default: 5,
      },
      maximum: {
        type: Number,
        min: 0,
      },
    },
    image: {
      type: String, // URL da imagem do produto
    },
    status: {
      type: String,
      enum: ["ativo", "inativo", "descontinuado"],
      default: "ativo",
    },
    barbershop: {
      type: Schema.Types.ObjectId,
      ref: "Barbershop",
      required: true,
    },
    commissionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    ncm: {
      type: String,
      trim: true,
      description: "Nomenclatura Comum do Mercosul",
    },
    cfop: {
      type: String,
      trim: true,
      description: "Código Fiscal de Operações e Prestações",
    },
  },
  {
    timestamps: true,
  }
);

// Índices para performance
ProductSchema.index({ barbershop: 1, name: 1 });
ProductSchema.index({ barbershop: 1, category: 1 });
ProductSchema.index({ barbershop: 1, status: 1 });

// Virtual para verificar se está em baixo estoque
ProductSchema.virtual("isLowStock").get(function () {
  return this.stock.current <= this.stock.minimum;
});

// Virtual para calcular margem de lucro
ProductSchema.virtual("profitMargin").get(function () {
  if (this.price.purchase === 0) return 0;
  return ((this.price.sale - this.price.purchase) / this.price.purchase) * 100;
});

ProductSchema.set("toJSON", { virtuals: true });

export default mongoose.model("Product", ProductSchema);
