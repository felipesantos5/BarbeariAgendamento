export interface PopulatedBooking {
  _id: string;
  barbershop: {
    _id: string;
    name: string;
    slug: string;
    logoUrl: string;
    paymentsEnabled?: boolean;
  };
  barber: { _id: string; name: string }; // << Adicionado _id do barbeiro
  service: { _id: string; name: string; price: number }; // << Adicionado _id do serviço
  time: string;
  status: "booked" | "confirmed" | "completed" | "canceled" | "pending_payment" | "payment_expired";
  paymentStatus?: "approved" | "pending" | "rejected" | "cancelled" | "canceled" | null;
}
