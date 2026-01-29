import { useEffect, useMemo, useState } from "react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import apiClient from "@/services/api";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar,
  Clock,
  CreditCard,
  Home,
  Loader2,
  LogOut,
  Repeat,
  User,
  X,
  Star,
  XCircle,
  CalendarDays,
  Package,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import RescheduleBookingModal from "@/components/RescheduleBookingModal.tsx";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PopulatedBooking } from "@/types/PopulatedBooking";

interface Subscription {
  _id: string;
  plan: {
    _id: string;
    name: string;
    description?: string;
    price: number;
    durationInDays: number;
    totalCredits: number;
  };
  barbershop: {
    _id: string;
    name: string;
    slug: string;
    logoUrl?: string;
  };
  status: "active" | "expired" | "canceled" | "pending";
  creditsRemaining: number;
  autoRenew: boolean;
  startDate: string;
  endDate: string;
}

type TabId = "agendamentos" | "planos";

export function MyBookingsPage() {
  const { customer, logout } = useCustomerAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<PopulatedBooking[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingPayment, setIsCreatingPayment] = useState<string | null>(null);
  const [isCancelingSubscription, setIsCancelingSubscription] = useState<string | null>(null);
  const [bookingToReschedule, setBookingToReschedule] = useState<PopulatedBooking | null>(null);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("agendamentos");

  // Atualizar título da página
  useDocumentTitle("Meus Agendamentos - Barbearia Agendamento");

  // Função para buscar os agendamentos
  const fetchBookings = async () => {
    try {
      const response = await apiClient.get<PopulatedBooking[]>("/api/auth/customer/me/bookings");
      setBookings(response.data);
    } catch (error) {
      console.error("Erro ao buscar agendamentos:", error);
      toast.error("Não foi possível carregar seus agendamentos.");
    }
  };

  // Função para buscar as assinaturas
  const fetchSubscriptions = async () => {
    try {
      const response = await apiClient.get<Subscription[]>("/api/auth/customer/me/subscriptions");
      setSubscriptions(response.data);
    } catch (error) {
      console.error("Erro ao buscar assinaturas:", error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchBookings(), fetchSubscriptions()]);
      setIsLoading(false);
    };
    loadData();
  }, []);

  // Função para cancelar assinatura
  const handleCancelSubscription = async (subscription: Subscription) => {
    setIsCancelingSubscription(subscription._id);
    try {
      await apiClient.post(`/api/barbershops/${subscription.barbershop._id}/subscriptions/${subscription._id}/cancel`);
      toast.success("Renovação automática cancelada. Seus créditos continuam válidos até o fim do período.");
      setSubscriptions((prev) => prev.map((s) => (s._id === subscription._id ? { ...s, autoRenew: false } : s)));
    } catch (error) {
      toast.error("Erro ao cancelar assinatura.");
    } finally {
      setIsCancelingSubscription(null);
    }
  };

  const getSubscriptionStatusInfo = (status: Subscription["status"], autoRenew: boolean) => {
    switch (status) {
      case "active":
        return {
          text: autoRenew ? "Ativo" : "Não renova",
          className: autoRenew ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800",
        };
      case "expired":
        return { text: "Expirado", className: "bg-gray-100 text-gray-600" };
      case "canceled":
        return { text: "Cancelado", className: "bg-red-100 text-red-800" };
      case "pending":
        return { text: "Pendente", className: "bg-yellow-100 text-yellow-800" };
      default:
        return { text: status, className: "bg-gray-100 text-gray-800" };
    }
  };

  // Separa os agendamentos em "próximos" e "passados"
  const { upcomingBookings, pastBookings } = useMemo(() => {
    const upcoming = bookings.filter((b) => !isPast(new Date(b.time)) && b.status !== "canceled");
    const past = bookings.filter((b) => isPast(new Date(b.time)) || b.status === "canceled");
    return { upcomingBookings: upcoming, pastBookings: past };
  }, [bookings]);

  // Paginação para o histórico
  const [historyPage, setHistoryPage] = useState(1);
  const historyPerPage = 5;
  const totalHistoryPages = Math.ceil(pastBookings.length / historyPerPage);
  const paginatedPastBookings = pastBookings.slice((historyPage - 1) * historyPerPage, historyPage * historyPerPage);

  // Função para cancelar um agendamento
  const handleCancelBooking = async (booking: PopulatedBooking) => {
    try {
      await apiClient.put(`/barbershops/${booking.barbershop._id}/bookings/${booking._id}/cancel`);
      toast.success("Agendamento cancelado com sucesso!");
      setBookings((prev) => prev.map((b) => (b._id === booking._id ? { ...b, status: "canceled" } : b)));
    } catch (error) {
      toast.error("Ocorreu um erro ao cancelar o agendamento.");
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/entrar");
    toast.info("Você foi desconectado.");
  };

  const handlePayNow = async (booking: PopulatedBooking) => {
    if (!booking.barbershop._id || !booking._id) return;

    setIsCreatingPayment(booking._id);
    try {
      const response = await apiClient.post(`/api/barbershops/${booking.barbershop._id}/bookings/${booking._id}/create-payment`);
      const { payment_url } = response.data;
      if (payment_url) {
        window.location.href = payment_url;
      } else {
        throw new Error("URL de pagamento não recebida.");
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast.error(axiosError.response?.data?.error || "Falha ao iniciar pagamento.");
      setIsCreatingPayment(null);
    }
  };

  const getStatusInfo = (status: PopulatedBooking["status"], isHistory = false) => {
    if (isHistory && (status === "booked" || status === "confirmed")) {
      return { text: "Realizado", className: "bg-blue-100 text-blue-800" };
    }
    switch (status) {
      case "completed":
        return { text: "Concluído", className: "bg-green-100 text-green-800" };
      case "canceled":
        return { text: "Cancelado", className: "bg-red-100 text-red-800" };
      case "payment_expired":
        return { text: "Pagamento Expirado", className: "bg-orange-100 text-orange-800" };
      case "pending_payment":
        return { text: "Aguardando Pagamento", className: "bg-yellow-100 text-yellow-800" };
      default:
        return { text: "Agendado", className: "bg-blue-100 text-blue-800" };
    }
  };

  const handleOpenRescheduleModal = (booking: PopulatedBooking) => {
    setBookingToReschedule(booking);
    setIsRescheduleModalOpen(true);
  };

  const handleRescheduleSuccess = (updatedBooking: PopulatedBooking) => {
    setIsRescheduleModalOpen(false);
    setBookingToReschedule(null);
    toast.success("Horário remarcado com sucesso!");
    setBookings((prevBookings) => prevBookings.map((b) => (b._id === updatedBooking._id ? updatedBooking : b)));
  };

  // Contadores para as badges nas tabs
  const activeSubscriptionsCount = subscriptions.filter((s) => s.status === "active").length;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header fixo */}
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Minha Conta</h1>
              <p className="text-sm text-gray-500">Olá, {customer?.name?.split(" ")[0]}!</p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-sm text-gray-600">
                ← Voltar
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="text-gray-600">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex border-b-0">
            <button
              onClick={() => setActiveTab("agendamentos")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "agendamentos"
                ? "border-gray-900 text-gray-900 dark:border-white dark:text-white"
                : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
            >
              <CalendarDays className="h-4 w-4" />
              <span>Agendamentos</span>
              {upcomingBookings.length > 0 && (
                <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {upcomingBookings.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("planos")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "planos"
                ? "border-gray-900 text-gray-900 dark:border-white dark:text-white"
                : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
            >
              <Package className="h-4 w-4" />
              <span>Meus Planos</span>
              {activeSubscriptionsCount > 0 && (
                <span className="bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {activeSubscriptionsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* TAB: Agendamentos */}
        {activeTab === "agendamentos" && (
          <>
            {/* Próximos Agendamentos */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                Próximos
              </h2>
              {upcomingBookings.length > 0 ? (
                <div className="space-y-3">
                  {upcomingBookings.map((booking) => {
                    const statusInfo = getStatusInfo(booking.status);
                    const canBeCancelled =
                      booking.status === "booked" ||
                      booking.status === "confirmed" ||
                      booking.status === "pending_payment";
                    const showPayButton =
                      booking.barbershop.paymentsEnabled === true &&
                      booking.paymentStatus !== "approved" &&
                      booking.status !== "canceled" &&
                      booking.status !== "payment_expired" &&
                      (booking.status === "pending_payment" || booking.status === "booked");
                    const showPaiedBadge =
                      booking.barbershop.paymentsEnabled === true &&
                      booking.paymentStatus === "approved" &&
                      booking.status !== "canceled";
                    const canBeRescheduled = booking.status === "booked" || booking.status === "confirmed";

                    return (
                      <Card
                        key={booking._id}
                        className="bg-white dark:bg-gray-800 shadow-sm border overflow-hidden"
                      >
                        {/* Header compacto do card */}
                        <div
                          className="p-4 cursor-pointer"
                          onClick={() => navigate(`/${booking.barbershop.slug}`)}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-center gap-3 min-w-0">
                              {booking.barbershop.logoUrl && (
                                <img
                                  src={booking.barbershop.logoUrl}
                                  alt=""
                                  className="w-12 h-12 object-contain rounded-lg bg-gray-100 flex-shrink-0"
                                />
                              )}
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-900 dark:text-white truncate">
                                  {booking.barbershop.name}
                                </p>
                                <p className="text-sm text-gray-500 truncate">
                                  {booking.service?.name || "Serviço"}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <Badge className={`${statusInfo.className} border text-xs`}>{statusInfo.text}</Badge>
                              {showPaiedBadge && (
                                <Badge className="bg-green-500 text-white text-xs">Pago</Badge>
                              )}
                            </div>
                          </div>

                          {/* Info do agendamento */}
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <User className="h-4 w-4 text-gray-400" />
                              <span className="text-gray-700 dark:text-gray-300">
                                {booking.barber?.name || "Profissional"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="h-4 w-4 text-gray-400" />
                              <span className="text-gray-700 dark:text-gray-300">
                                {format(new Date(booking.time), "EEEE, dd 'de' MMM", { locale: ptBR })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Clock className="h-4 w-4 text-gray-400" />
                              <span className="font-medium text-gray-900 dark:text-white">
                                {format(new Date(booking.time), "HH:mm")}h
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="px-4 pb-4 flex flex-wrap gap-2">
                          {showPayButton && (
                            <Button
                              onClick={() => handlePayNow(booking)}
                              disabled={isCreatingPayment === booking._id}
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                            >
                              {isCreatingPayment === booking._id ? (
                                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                              ) : (
                                <CreditCard className="mr-1 h-4 w-4" />
                              )}
                              Pagar
                            </Button>
                          )}

                          {canBeRescheduled && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenRescheduleModal(booking)}
                              className="flex-1"
                            >
                              <Repeat className="mr-1 h-4 w-4" />
                              Remarcar
                            </Button>
                          )}

                          {canBeCancelled && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50">
                                  Cancelar
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Seu agendamento para <strong>{booking.service?.name}</strong> em{" "}
                                    <strong>{format(new Date(booking.time), "dd/MM 'às' HH:mm", { locale: ptBR })}</strong>{" "}
                                    será cancelado. Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Manter</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleCancelBooking(booking)}
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                  >
                                    Sim, cancelar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 px-4 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed">
                  <Home className="mx-auto h-10 w-10 text-gray-300" />
                  <p className="mt-2 text-sm font-medium text-gray-600">Nenhum agendamento futuro</p>
                  <p className="text-xs text-gray-400">Que tal marcar um novo horário?</p>
                </div>
              )}
            </section>

            {/* Histórico */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-400" />
                Histórico
              </h2>
              {pastBookings.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {paginatedPastBookings.map((booking) => {
                      const statusInfo = getStatusInfo(booking.status, true);
                      return (
                        <div
                          key={booking._id}
                          className="bg-white dark:bg-gray-800 rounded-lg border p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50"
                          onClick={() => navigate(`/${booking.barbershop.slug}`)}
                        >
                          {booking.barbershop.logoUrl && (
                            <img
                              src={booking.barbershop.logoUrl}
                              alt=""
                              className="w-10 h-10 object-contain rounded bg-gray-100 flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                {booking.service?.name || "Serviço"}
                              </p>
                              {booking.barber?.name && (
                                <>
                                  <span className="text-gray-300">•</span>
                                  <p className="text-xs text-gray-500 truncate">{booking.barber.name}</p>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>{format(new Date(booking.time), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}</span>
                              {booking.service?.price && (
                                <>
                                  <span className="text-gray-300">•</span>
                                  <span className="font-medium">
                                    R$ {booking.service.price.toFixed(2).replace(".", ",")}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <Badge className={`${statusInfo.className} border text-xs`}>{statusInfo.text}</Badge>
                        </div>
                      );
                    })}
                  </div>
                  {totalHistoryPages > 1 && (
                    <div className="flex justify-center items-center gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                        disabled={historyPage === 1}
                      >
                        Anterior
                      </Button>
                      <span className="text-xs text-gray-500">
                        {historyPage} / {totalHistoryPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                        disabled={historyPage === totalHistoryPages}
                      >
                        Próxima
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">Nenhum agendamento anterior</p>
              )}
            </section>
          </>
        )}

        {/* TAB: Meus Planos */}
        {activeTab === "planos" && (
          <section className="space-y-8">
            {subscriptions.length > 0 ? (
              <>
                {/* Planos Ativos */}
                {subscriptions.filter((s) => s.status === "active").length > 0 && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Meus Planos Ativos
                    </h2>
                    {subscriptions
                      .filter((s) => s.status === "active")
                      .map((subscription) => {
                        const statusInfo = getSubscriptionStatusInfo(subscription.status, subscription.autoRenew);
                        const isActive = subscription.status === "active";
                        const canCancel = isActive && subscription.autoRenew;
                        const creditsPercentage = (subscription.creditsRemaining / subscription.plan.totalCredits) * 100;

                        return (
                          <Card key={subscription._id} className="bg-white dark:bg-gray-800 shadow-sm border overflow-hidden">
                            {/* Header do plano */}
                            <div className="p-4 border-b bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-700">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  {subscription.barbershop.logoUrl && (
                                    <img
                                      src={subscription.barbershop.logoUrl}
                                      alt=""
                                      className="w-12 h-12 object-contain rounded-lg bg-white border"
                                    />
                                  )}
                                  <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white">
                                      {subscription.plan.name}
                                    </h3>
                                    <p className="text-sm text-gray-500">{subscription.barbershop.name}</p>
                                  </div>
                                </div>
                                <Badge className={`${statusInfo.className} border text-xs`}>{statusInfo.text}</Badge>
                              </div>
                            </div>

                            {/* Conteúdo do plano */}
                            <div className="p-4 space-y-4">
                              {/* Barra de créditos */}
                              <div>
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-sm text-gray-600 dark:text-gray-400">Créditos disponíveis</span>
                                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                                    {subscription.creditsRemaining}
                                    <span className="text-sm font-normal text-gray-500">
                                      {" "}
                                      / {subscription.plan.totalCredits}
                                    </span>
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                  <div
                                    className={`h-2.5 rounded-full transition-all ${creditsPercentage > 50
                                      ? "bg-green-500"
                                      : creditsPercentage > 20
                                        ? "bg-yellow-500"
                                        : "bg-red-500"
                                      }`}
                                    style={{ width: `${creditsPercentage}%` }}
                                  />
                                </div>
                              </div>

                              {/* Info grid */}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                                  <p className="text-xs text-gray-500 mb-1">Válido até</p>
                                  <p className="font-semibold text-gray-900 dark:text-white">
                                    {format(new Date(subscription.endDate), "dd/MM/yyyy", { locale: ptBR })}
                                  </p>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                                  <p className="text-xs text-gray-500 mb-1">Valor mensal</p>
                                  <p className="font-semibold text-gray-900 dark:text-white">
                                    R$ {subscription.plan.price.toFixed(2).replace(".", ",")}
                                  </p>
                                </div>
                              </div>

                              {subscription.plan.description && (
                                <p className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                                  {subscription.plan.description}
                                </p>
                              )}

                              {/* Renovação automática info */}
                              {isActive && (
                                <div
                                  className={`flex items-center gap-2 text-sm p-3 rounded-lg ${subscription.autoRenew
                                    ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                                    : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                                    }`}
                                >
                                  {subscription.autoRenew ? (
                                    <>
                                      <Repeat className="h-4 w-4" />
                                      <span>Renovação automática ativa</span>
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="h-4 w-4" />
                                      <span>Não será renovado automaticamente</span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Ação de cancelar */}
                            {canCancel && (
                              <div className="px-4 pb-4">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className="w-full text-red-600 border-red-200 hover:bg-red-50"
                                      disabled={isCancelingSubscription === subscription._id}
                                    >
                                      {isCancelingSubscription === subscription._id ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      ) : (
                                        <XCircle className="mr-2 h-4 w-4" />
                                      )}
                                      Cancelar Renovação Automática
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Cancelar renovação?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Você continuará com acesso aos seus{" "}
                                        <strong>{subscription.creditsRemaining} créditos</strong> até{" "}
                                        <strong>
                                          {format(new Date(subscription.endDate), "dd/MM/yyyy", { locale: ptBR })}
                                        </strong>
                                        .
                                        <br />
                                        <br />
                                        Após essa data, sua assinatura será encerrada e não haverá cobranças futuras.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Manter</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleCancelSubscription(subscription)}
                                        className="bg-red-600 hover:bg-red-700 text-white"
                                      >
                                        Sim, cancelar renovação
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </Card>
                        );
                      })}
                  </div>
                )}

                {/* Planos Inativos (Expirados/Cancelados) */}
                {subscriptions.filter((s) => s.status !== "active").length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      Histórico de Planos
                    </h3>
                    <div className="space-y-2">
                      {subscriptions
                        .filter((s) => s.status !== "active")
                        .map((subscription) => {
                          const statusInfo = getSubscriptionStatusInfo(subscription.status, subscription.autoRenew);

                          return (
                            <Card
                              key={subscription._id}
                              className="bg-gray-50/50 dark:bg-gray-800/50 shadow-none border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                              <div className="px-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    {subscription.barbershop.logoUrl && (
                                      <img
                                        src={subscription.barbershop.logoUrl}
                                        alt=""
                                        className="w-8 h-8 object-contain rounded bg-white border flex-shrink-0"
                                      />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300 truncate">
                                          {subscription.plan.name}
                                        </h4>
                                        <Badge className={`${statusInfo.className} border text-xs flex-shrink-0`}>
                                          {statusInfo.text}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center gap-4 text-xs text-gray-500">
                                        <span className="flex items-center gap-1">
                                          <Clock className="h-3 w-3" />
                                          {format(new Date(subscription.startDate), "dd/MM/yy", { locale: ptBR })} até{" "}
                                          {format(new Date(subscription.endDate), "dd/MM/yy", { locale: ptBR })}
                                        </span>
                                        <span className="flex items-center gap-1">
                                          <CreditCard className="h-3 w-3" />
                                          {subscription.plan.totalCredits - subscription.creditsRemaining}/
                                          {subscription.plan.totalCredits} créditos usados
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16 px-4 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed">
                <Star className="mx-auto h-12 w-12 text-gray-300" />
                <p className="mt-3 text-base font-medium text-gray-600">Você ainda não possui planos</p>
                <p className="text-sm text-gray-400 mt-1">
                  Acesse uma barbearia para conferir os planos disponíveis
                </p>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Modal de remarcar */}
      <Dialog open={isRescheduleModalOpen} onOpenChange={setIsRescheduleModalOpen}>
        <DialogContent className="sm:max-w-[625px] h-[80vh] overflow-scroll dialog-rebooking">
          <DialogHeader>
            <DialogTitle>Remarcar Horário</DialogTitle>
            <DialogClose asChild>
              <button className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">Fechar</span>
              </button>
            </DialogClose>
          </DialogHeader>
          {bookingToReschedule && (
            <RescheduleBookingModal
              booking={bookingToReschedule}
              onClose={() => {
                setIsRescheduleModalOpen(false);
                setBookingToReschedule(null);
              }}
              onSuccess={handleRescheduleSuccess}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
