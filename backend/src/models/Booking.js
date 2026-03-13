import mongoose, { Schema } from "mongoose";

const BookingSchema = new Schema(
  {
    barbershop: { type: Schema.Types.ObjectId, ref: "Barbershop" },
    barber: { type: Schema.Types.ObjectId, ref: "Barber" },
    service: { type: Schema.Types.ObjectId, ref: "Service" },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    time: Date,
    status: {
      type: String,
      enum: ["booked", "confirmed", "completed", "canceled", "pending_payment", "payment_expired"],
      default: "booked",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "approved", "failed", "canceled", "no-payment", "plan_credit", "loyalty_reward", "paid_locally"],
    },
    paymentId: { type: String },
    subscriptionUsed: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },
    isPaymentMandatory: {
      type: Boolean,
      default: false,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrenceGroup: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

BookingSchema.index({ barbershop: 1, time: -1 });
BookingSchema.index({ status: 1, time: 1 });
BookingSchema.index({ barbershop: 1, status: 1, time: 1 });
BookingSchema.index({ createdAt: 1 });
BookingSchema.index({ recurrenceGroup: 1 });

// ✅ Único agendamento ativo por barbeiro/horário (Previne Race Condition)
BookingSchema.index(
  { barber: 1, time: 1 },
  { unique: true, partialFilterExpression: { status: { $nin: ["canceled", "payment_expired"] } } }
);

export default mongoose.model("Booking", BookingSchema);
