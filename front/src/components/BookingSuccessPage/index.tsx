import { Link, useLocation } from "react-router-dom";
import { CalendarDays, Clock, User, Scissors, ShieldAlert, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import apiClient from "@/services/api";
import { toast } from "sonner";
import { useState } from "react";
import { formatGoogleCalendarDate } from "@/helper/formatGoogleCalendarDate";
import { GoogleAgendaIcon } from "../icons/googleAgenda";
interface BookingDetails {
  barbershopName: string;
  customerName: string;
  serviceName: string;
  barberName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  serviceDuration: number; // Duração em minutos
  barbershopAddress: string; // Endereço formatado
}
interface LocationState {
  bookingDetails?: BookingDetails;
  barbershopSlug?: string;
  newBookingId?: string;
  barbershopId?: string;
  paymentsEnabled?: boolean;
}

export function BookingSuccessPage() {
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [isCreatingPayment, setIsCreatingPayment] = useState(false);

  const { bookingDetails, barbershopSlug, newBookingId, barbershopId, paymentsEnabled } = state || {};

  const handlePayNow = async () => {
    if (!newBookingId || !barbershopId) {
      toast.error("Faltam informações para iniciar o pagamento.");
      return;
    }

    setIsCreatingPayment(true);
    try {
      const paymentResponse = await apiClient.post(`/api/barbershops/${barbershopId}/bookings/${newBookingId}/create-payment`);
      const { payment_url } = paymentResponse.data;

      if (payment_url) {
        window.location.href = payment_url; // Redireciona para o checkout
      } else {
        throw new Error("URL de pagamento não recebida.");
      }
    } catch (error: any) {
      console.error("Erro ao criar pagamento:", error);
      toast.error(error.response?.data?.error ?? "Não foi possível iniciar o pagamento.");
      setIsCreatingPayment(false);
    }
  };

  const generateGoogleCalendarLink = (): string | null => {
    if (!bookingDetails) return null;

    const eventDates = formatGoogleCalendarDate(bookingDetails.date, bookingDetails.time, bookingDetails.serviceDuration);

    if (!eventDates) return null; // Retorna null se a formatação falhar

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `Agendamento: ${bookingDetails.serviceName} em ${bookingDetails.barbershopName}`,
      dates: `${eventDates.start}/${eventDates.end}`,
      details: `Serviço: ${bookingDetails.serviceName}\nProfissional: ${bookingDetails.barberName}\nBarbearia: ${bookingDetails.barbershopName}\n\nConfirmado para ${bookingDetails.customerName}.`,
      location: bookingDetails.barbershopAddress,
    });

    return `https://www.google.com/calendar/render?${params.toString()}`;
  };
  // ----------------------------------------------------

  const googleCalendarLink = generateGoogleCalendarLink();

  if (!bookingDetails) {
    // Se não houver detalhes do agendamento (ex: acesso direto à URL),
    // mostra uma mensagem e um link para voltar.
    return (
      <div className="flex flex-col md:items-center justify-center min-h-screen bg-gray-100 p-6 text-center">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <ShieldAlert className="h-16 w-16 text-destructive mx-auto mb-4" />
            <CardTitle className="text-2xl font-bold text-destructive">Oops! Algo deu errado.</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-6">
              Não encontramos os detalhes do seu agendamento. Isso pode acontecer se você acessou esta página diretamente.
            </p>
          </CardContent>
          <CardFooter>
            {/* Se você tiver um slug padrão ou uma home page, ajuste o link */}
            <Link to="/" className="w-full">
              <Button className="w-full">Voltar ao Início</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Formatação da data para exibição
  let formattedDate = "Data inválida";
  try {
    formattedDate = format(parseISO(bookingDetails.date), "dd 'de' MMMM 'de' yyyy (EEEE)", { locale: ptBR });
  } catch (e) {
    console.error("Erro ao formatar data para sucesso:", bookingDetails.date, e);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-green-400 via-emerald-500 to-teal-600 md:p-4 text-white selection:bg-teal-800 selection:text-teal-100">
      <Card className="w-full h-full max-w-md bg-white/95 text-slate-800 shadow-2xl rounded-xl overflow-hidden animate-fadeInUp border-0">
        <CardHeader className="items-center text-center p-6 bg-green-500">
          {/* Animação de Check */}
          <div className="relative w-24 h-24 mx-auto mb-4">
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 52 52">
              <circle className="stroke-current text-green-100/50" cx="26" cy="26" r="25" fill="none" strokeWidth="2" />
              <path
                className="stroke-current text-white animate-drawCheck"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.1 27.2l7.1 7.2 16.7-16.8"
                style={{ strokeDasharray: 50, strokeDashoffset: 50 }}
              />
            </svg>
          </div>
          <CardTitle className="text-3xl font-bold text-white">Agendamento Confirmado!</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <p className="text-center text-slate-700 text-base">
            Obrigado, <span className="font-semibold">{bookingDetails.customerName}</span>! Seu horário na{" "}
            <span className="font-semibold">{bookingDetails.barbershopName}</span> está reservado.
          </p>
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center text-slate-600 font-medium">
                <CalendarDays className="mr-2 h-5 w-5 text-emerald-600" />
                Data:
              </span>
              <span className="text-slate-800 font-semibold">{formattedDate}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center text-slate-600 font-medium">
                <Clock className="mr-2 h-5 w-5 text-emerald-600" />
                Hora:
              </span>
              <span className="text-slate-800 font-semibold">{bookingDetails.time}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center text-slate-600 font-medium">
                <User className="mr-2 h-5 w-5 text-emerald-600" />
                Profissional:
              </span>
              <span className="text-slate-800 font-semibold">{bookingDetails.barberName}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center text-slate-600 font-medium">
                <Scissors className="mr-2 h-5 w-5 text-emerald-600" />
                Serviço:
              </span>
              <span className="text-slate-800 font-semibold">{bookingDetails.serviceName}</span>
            </div>
          </div>
          {/* <p className="text-xs text-center text-slate-500 pt-4">
            Você também deve receber uma confirmação por WhatsApp, caso configurado pela barbearia.
          </p> */}
        </CardContent>
        <CardFooter className="p-6 bg-slate-50 border-t flex flex-col gap-3 pb-0">
          {/* BOTÃO DE PAGAMENTO CONDICIONAL */}
          {paymentsEnabled && newBookingId && (
            <Button onClick={handlePayNow} disabled={isCreatingPayment} className="w-full bg-green-600 hover:bg-green-700 duration-300 text-white">
              {isCreatingPayment ? (
                "Gerando..."
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" /> Pagar Agora (Online)
                </>
              )}
            </Button>
          )}

          {googleCalendarLink && (
            <a
              href={googleCalendarLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full" // Para ocupar a largura como os outros botões
            >
              <Button variant="outline" className="w-full cursor-pointer border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700">
                <GoogleAgendaIcon />
                Adicionar ao Google Agenda
              </Button>
            </a>
          )}

          <Link to={barbershopSlug ? `/${barbershopSlug}` : "/"} className="w-full">
            <Button
              variant="outline" // Mudei para outline para dar menos destaque
              className="w-full cursor-pointer"
            >
              Fazer Novo Agendamento
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
