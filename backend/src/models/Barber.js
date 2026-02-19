import mongoose, { Schema } from "mongoose";

const BarberSchema = new Schema({
  name: String,
  barbershop: {
    type: Schema.Types.ObjectId,
    ref: "Barbershop",
    required: true,
  },
  availability: [{ day: String, start: String, end: String }],
  image: { type: String },
  commission: {
    type: Number,
    default: 0,
  },
  break: {
    enabled: {
      type: Boolean,
      default: false,
    },
    start: {
      type: String, // formato "HH:mm" ex: "12:00"
      default: "12:00",
    },
    end: {
      type: String, // formato "HH:mm" ex: "13:00"
      default: "13:00",
    },
    days: [
      {
        type: String, // ["monday", "tuesday", etc] ou dias específicos
        enum: ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"],
      },
    ],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

BarberSchema.index({ barbershop: 1 });

export default mongoose.model("Barber", BarberSchema);
