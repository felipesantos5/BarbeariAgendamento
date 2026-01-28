export interface Booking {
  _id: string;
  customer: {
    name: string;
    phone?: string;
    whatsapp?: string;
  };
  barber: {
    _id: string;
    name: string;
  };
  service: {
    _id: string;
    name: string;
    price: number;
    duration: number;
  };
  paymentStatus?: string;
  createdAt?: string;
  time: string;
  status: "booked" | "confirmed" | "completed" | "canceled" | "pending_payment" | "payment_expired";
}
