// src/pages/CustomersPage.tsx
import { useEffect, useState, useCallback, ChangeEvent } from "react"; // Adicionado ChangeEvent
import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import apiClient from "@/services/api";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

// Imports de UI e Ícones
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter, // ✅ Adicionado
  DialogClose, // ✅ Adicionado
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  MoreHorizontal,
  User,
  Filter,
  Search,
  CalendarDays,
  Scissors,
  Calendar,
  History,
  Contact,
  CreditCard,
  Plus, // ✅ Adicionado
} from "lucide-react";
import { PhoneFormat } from "@/helper/phoneFormater";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { dateFormatter } from "@/helper/dateFormatter";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { API_BASE_URL } from "@/config/BackendUrl";
import { PriceFormater } from "@/helper/priceFormater";
import { AdminOutletContext } from "@/types/AdminOutletContext";
import { Booking } from "@/types/bookings";

// --- Interfaces (com base no seu último payload) ---

interface LoyaltyData {
  barbershop: string;
  progress: number;
  rewards: number;
}

interface Plan {
  _id: string;
  name: string;
  description?: string;
  price: number;
  durationInDays: number;
  totalCredits?: number;
}

interface Subscription {
  _id: string;
  status: "active" | "expired" | "cancelled";
  startDate: string;
  endDate: string;
  plan: Plan;
  creditsRemaining?: number;
  creditsUsed?: number;
  barber?: {
    name?: string;
  };
}

interface Customer {
  _id: string;
  name: string;
  phone: string;
  imageUrl?: string;
  createdAt: string;
  subscriptions?: Subscription[];
  lastBookingTime?: string;
  loyaltyData?: LoyaltyData[];
}

interface Barber {
  _id: string;
  name: string;
}

interface PaginationData {
  currentPage: number;
  totalPages: number;
  totalCustomers: number;
  limit: number;
}

interface CustomersApiResponse {
  customers: Customer[];
  pagination: PaginationData;
}

// --- Componente Principal ---
export function CustomersPage() {
  const { barbershopId, loyaltyProgramEnable, loyaltyProgramCount } = useOutletContext<AdminOutletContext>();

  // Estados
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [allBarbers, setAllBarbers] = useState<Barber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "with-plan" | "without-plan">("all");
  const [isBookingsModalOpen, setIsBookingsModalOpen] = useState(false);
  const [customerBookings, setCustomerBookings] = useState<Booking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [selectedCustomerForBookings, setSelectedCustomerForBookings] = useState<Customer | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const ITEMS_PER_PAGE = 15;

  // Estados do Modal de Atribuir Plano
  const [isAssignPlanModalOpen, setIsAssignPlanModalOpen] = useState(false);
  const [selectedCustomerForPlan, setSelectedCustomerForPlan] = useState<Customer | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [selectedBarberId, setSelectedBarberId] = useState<string>("");
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [assignPlanError, setAssignPlanError] = useState("");

  // ✅ NOVOS ESTADOS para o Modal de Criar Cliente
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [createCustomerError, setCreateCustomerError] = useState("");
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    phone: "",
  });

  // --- Funções de Fetch ---
  const fetchPageData = useCallback(
    async (page = 1) => {
      if (!barbershopId) return;
      setIsLoading(true);
      try {
        const customerParams = new URLSearchParams({
          page: page.toString(),
          limit: ITEMS_PER_PAGE.toString(),
        });
        if (searchTerm.trim()) {
          customerParams.append("search", searchTerm.trim());
        }
        if (filterStatus !== "all") {
          customerParams.append("subscriptionStatus", filterStatus);
        }

        const [customersRes, plansRes, barbersRes] = await Promise.all([
          apiClient.get<CustomersApiResponse>(`${API_BASE_URL}/api/barbershops/${barbershopId}/admin/customers?${customerParams.toString()}`),
          apiClient.get(`${API_BASE_URL}/api/barbershops/${barbershopId}/plans`),
          apiClient.get(`${API_BASE_URL}/barbershops/${barbershopId}/barbers`),
        ]);

        setCustomers(customersRes.data.customers);
        setPlans(plansRes.data);
        setAllBarbers(barbersRes.data);
        setCurrentPage(customersRes.data.pagination.currentPage);
        setTotalPages(customersRes.data.pagination.totalPages);
        setTotalCustomers(customersRes.data.pagination.totalCustomers);
      } catch (error: any) {
        console.error("Erro ao carregar dados:", error);
        toast.error(error.response?.data?.message || "Erro ao carregar dados da página.");
      } finally {
        setIsLoading(false);
      }
    },
    [barbershopId, searchTerm, filterStatus]
  );

  useEffect(() => {
    fetchPageData(currentPage);
  }, [fetchPageData, currentPage]);

  const fetchCustomerBookings = async (customerId: string) => {
    setIsLoadingBookings(true);
    try {
      const response = await apiClient.get(`${API_BASE_URL}/api/barbershops/${barbershopId}/admin/customers/${customerId}/bookings`);
      setCustomerBookings(response.data.sort((a: Booking, b: Booking) => new Date(b.time).getTime() - new Date(a.time).getTime()));
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Erro ao carregar histórico de agendamentos.");
    } finally {
      setIsLoadingBookings(false);
    }
  };

  // --- Handlers ---
  const handleOpenBookingsModal = async (customer: Customer) => {
    setSelectedCustomerForBookings(customer);
    setIsBookingsModalOpen(true);
    await fetchCustomerBookings(customer._id);
  };

  const handleOpenSubscribeModal = (customer: Customer) => {
    setSelectedCustomerForPlan(customer);
    setSelectedPlanId("");
    setSelectedBarberId("all"); // Define "Todos" como padrão
    setAssignPlanError("");
    setIsAssignPlanModalOpen(true);
  };

  const handleSubscribeCustomer = async () => {
    if (!selectedCustomerForPlan || !selectedPlanId || !selectedBarberId) {
      const errorMessage = !selectedPlanId ? "Por favor, selecione um plano." : "Por favor, selecione um barbeiro.";
      toast.error(errorMessage);
      setAssignPlanError(errorMessage);
      return;
    }
    setIsSubscribing(true);
    setAssignPlanError("");
    try {
      await apiClient.post(`${API_BASE_URL}/api/barbershops/${barbershopId}/admin/customers/${selectedCustomerForPlan._id}/subscribe`, {
        planId: selectedPlanId,
        barberId: selectedBarberId === "all" ? null : selectedBarberId, // Envia null quando "Todos" for selecionado
      });

      toast.success(`${selectedCustomerForPlan.name} agora tem um novo plano!`);
      setIsAssignPlanModalOpen(false);
      fetchPageData(currentPage);
    } catch (error: any) {
      console.error("Erro ao atribuir plano:", error);
      const apiError = error.response?.data?.message || "Falha ao atribuir o plano.";
      setAssignPlanError(apiError);
      toast.error(apiError);
    } finally {
      setIsSubscribing(false);
    }
  };

  // ✅ NOVAS FUNÇÕES para Criar Cliente
  const handleOpenCreateModal = () => {
    setNewCustomerForm({ name: "", phone: "" });
    setCreateCustomerError("");
    setIsCreatingCustomer(false);
    setIsCreateModalOpen(true);
  };

  const handleNewCustomerChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "phone") {
      setNewCustomerForm((prev) => ({ ...prev, phone: PhoneFormat(value) }));
    } else {
      setNewCustomerForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleCreateCustomer = async () => {
    setCreateCustomerError("");

    if (!newCustomerForm.name.trim()) {
      setCreateCustomerError("O nome é obrigatório.");
      return;
    }
    const phoneDigits = newCustomerForm.phone.replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      setCreateCustomerError("O telefone parece inválido.");
      return;
    }

    setIsCreatingCustomer(true);
    try {
      await apiClient.post(`${API_BASE_URL}/api/barbershops/${barbershopId}/admin/customers`, {
        name: newCustomerForm.name,
        phone: phoneDigits, // Envia apenas os dígitos
      });

      toast.success("Cliente criado com sucesso!");
      setIsCreateModalOpen(false);
      fetchPageData(1); // Recarrega a lista na página 1
      setCurrentPage(1); // Reseta o estado da página
    } catch (error: any) {
      const msg = error.response?.data?.message || "Erro ao criar cliente. Verifique se o telefone já existe.";
      console.error(error);
      setCreateCustomerError(msg);
      toast.error(msg);
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  // Funções auxiliares (Formatadores)
  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return "N/A";
    try {
      return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return "Data inválida";
    }
  };

  const formatDateTime = (dateTimeString: string | undefined): string => {
    if (!dateTimeString) return "N/A";
    try {
      return format(new Date(dateTimeString), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return "Data/hora inválida";
    }
  };

  const getDaysRemaining = (endDate: string | undefined): number | null => {
    if (!endDate) return null;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      const localEnd = new Date(end.toLocaleString("en-US", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
      localEnd.setHours(0, 0, 0, 0);
      const diffTime = localEnd.getTime() - today.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
    > = {
      booked: { label: "Agendado", variant: "default" },
      completed: { label: "Concluído", variant: "secondary" },
      canceled: { label: "Cancelado", variant: "destructive" },
      payment_expired: { label: "Pagamento Expirado", variant: "destructive", className: "bg-orange-600" },
      pending_payment: { label: "Aguardando Pagamento", variant: "secondary", className: "bg-amber-500 text-white" },
      "no-show": { label: "Não Compareceu", variant: "outline" },
    };

    const config = statusConfig[status] || {
      label: status.charAt(0).toUpperCase() + status.slice(1),
      variant: "outline" as const,
      className: "",
    };

    return (
      <Badge variant={config.variant} className={`text-xs ${config.className || ""}`}>
        {config.label}
      </Badge>
    );
  };

  const getLastBookingBadge = (lastBookingTime: string | undefined) => {
    if (!lastBookingTime) {
      return <Badge variant="outline">Nunca agendou</Badge>;
    }
    try {
      const lastDate = new Date(lastBookingTime);
      const today = new Date();
      const daysAgo = differenceInDays(today, lastDate);

      return (
        <div className="flex flex-col gap-1">
          <Badge variant="secondary">{formatDateTime(lastBookingTime)}</Badge>
          <span className="text-xs text-muted-foreground">
            {daysAgo === 0 ? "Hoje" : daysAgo === 1 ? "Há 1 dia" : `Há ${daysAgo} dias`}
          </span>
        </div>
      );
    } catch {
      return <Badge variant="destructive">Erro formatar</Badge>;
    }
  };

  if (isLoading && customers.length === 0) {
    return (
      <div className="flex justify-center items-center p-10">
        <Loader2 className="animate-spin h-8 w-8" />
        <span className="ml-2">Carregando clientes...</span>
      </div>
    );
  }

  // --- Renderização ---
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          {/* ✅ HEADER ATUALIZADO COM BOTÃO */}
          <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
            <div>
              <CardTitle>Lista de Clientes</CardTitle>
              <CardDescription>
                {totalCustomers} cliente{totalCustomers !== 1 ? "s" : ""} encontrado{totalCustomers !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <Button onClick={handleOpenCreateModal}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Cliente
            </Button>
          </div>

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou telefone..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="sm:w-48">
              <Select
                value={filterStatus}
                onValueChange={(value: "all" | "with-plan" | "without-plan") => {
                  setFilterStatus(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger>
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filtrar por plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os clientes</SelectItem>
                  <SelectItem value="with-plan">Com plano ativo</SelectItem>
                  <SelectItem value="without-plan">Sem plano ativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Planos Ativos</TableHead>
                  <TableHead>Cliente Desde</TableHead>
                  <TableHead>Último Agendamento</TableHead>
                  {loyaltyProgramEnable && <TableHead className="text-center">Fidelidade</TableHead>}
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && customers.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-24 relative">
                      <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && customers.length > 0 ? (
                  customers.map((customer) => {
                    const activeSubscriptions = customer.subscriptions?.filter((sub) => sub.status === "active") || [];

                    return (
                      <TableRow key={customer._id} className="hover:bg-muted/50 align-top">
                        {/* Célula Cliente */}
                        <TableCell>
                          <div
                            className="flex items-center space-x-3 cursor-pointer hover:bg-muted/30 p-2 rounded-md transition-colors"
                            onClick={() => handleOpenBookingsModal(customer)}
                            title="Ver histórico de agendamentos"
                          >
                            <div className="flex-shrink-0">
                              {customer.imageUrl ? (
                                <img src={customer.imageUrl} alt={customer.name} className="h-10 w-10 rounded-full object-cover" />
                              ) : (
                                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                  <User className="h-5 w-5 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="font-medium">{customer.name}</div>
                              <div className="text-sm text-muted-foreground flex items-center gap-1 hover:text-primary">
                                <History size={14} /> Ver Histórico
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Célula Telefone */}
                        <TableCell>
                          <a
                            href={`https://wa.me/55${customer.phone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {PhoneFormat(customer.phone)}
                          </a>
                        </TableCell>

                        {/* Célula Planos Ativos (Renderiza múltiplos) */}
                        <TableCell>
                          {activeSubscriptions.length > 0 ? (
                            <div className="space-y-3 max-w-[350px]">
                              {activeSubscriptions.map((subscription) => {
                                const daysRemaining = getDaysRemaining(subscription.endDate);
                                return (
                                  <div key={subscription._id} className="space-y-2 p-2 rounded-md border bg-muted/50 border-primary/20">
                                    <p className="font-medium text-sm flex items-center gap-1">
                                      <CreditCard className="h-4 w-4 text-primary" />
                                      {subscription.plan.name}
                                      {(subscription.plan.totalCredits ?? 0) > 0 && (
                                        <div className="flex items-center gap-2">
                                          <Badge variant="secondary" className="font-mono text-sm">
                                            {subscription.creditsUsed ?? 0} / {subscription.plan.totalCredits}
                                          </Badge>
                                          <span className="text-xs text-muted-foreground">créditos usados</span>
                                        </div>
                                      )}
                                    </p>

                                    <div className="text-xs text-muted-foreground">
                                      <Contact className="h-3 w-3 inline mr-1" />
                                      {subscription.barber?.name || "Todos os barbeiros"}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      <span>Expira em: {formatDate(subscription.endDate)}</span>
                                      {daysRemaining !== null && (
                                        <Badge variant={daysRemaining <= 7 ? "destructive" : "default"} className="text-xs ml-2">
                                          {daysRemaining > 0 ? `${daysRemaining} dias restantes` : daysRemaining === 0 ? "Expira hoje" : "Expirado"}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <Badge variant="outline">Sem plano</Badge>
                          )}
                        </TableCell>

                        {/* Célula Cliente Desde */}
                        <TableCell>
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                            {formatDate(customer.createdAt)}
                          </div>
                        </TableCell>

                        {/* Célula Último Agendamento */}
                        <TableCell>{getLastBookingBadge(customer.lastBookingTime)}</TableCell>

                        {/* Célula Fidelidade */}
                        {loyaltyProgramEnable && (
                          <TableCell className="text-center">
                            {(() => {
                              const customerProgressData = customer.loyaltyData?.find((data) => data.barbershop === barbershopId);
                              const progress = customerProgressData?.progress || 0;
                              const rewards = customerProgressData?.rewards || 0;
                              const target = loyaltyProgramCount || 10;
                              return (
                                <div className="flex flex-col items-center justify-center space-y-1">
                                  <span className="font-bold text-sm text-primary">
                                    {progress}
                                    <span className="text-muted-foreground text-xs"> / {target}</span>
                                  </span>
                                  <Badge variant="outline" className="gap-1 text-xs">
                                    Nº de premios {rewards}
                                  </Badge>
                                </div>
                              );
                            })()}
                          </TableCell>
                        )}

                        {/* Célula Ações */}
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleOpenSubscribeModal(customer)}>
                                {activeSubscriptions.length > 0 ? "Adicionar Novo Plano" : "Atribuir Plano"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-24">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <User className="h-8 w-8 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {searchTerm || filterStatus !== "all"
                            ? "Nenhum cliente encontrado com os filtros aplicados."
                            : "Nenhum cliente cadastrado ainda."}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {/* Paginação */}
          {totalPages > 1 && (
            <div className="pt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage > 1) setCurrentPage(currentPage - 1);
                      }}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="font-medium text-sm mx-4">
                      Página {currentPage} de {totalPages}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                      }}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Modais --- */}

      {/* ✅ NOVO MODAL: Criar Cliente */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar Novo Cliente</DialogTitle>
            <DialogDescription>Insira o nome e o telefone (WhatsApp) do novo cliente.</DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newName">Nome *</Label>
              <Input
                id="newName"
                name="name"
                value={newCustomerForm.name}
                onChange={handleNewCustomerChange}
                placeholder="Nome completo do cliente"
                disabled={isCreatingCustomer}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPhone">Telefone (WhatsApp) *</Label>
              <Input
                id="newPhone"
                name="phone"
                type="tel"
                value={newCustomerForm.phone}
                onChange={handleNewCustomerChange}
                placeholder="(XX) XXXXX-XXXX"
                maxLength={15} // Máscara (11) 99999-9999
                disabled={isCreatingCustomer}
              />
            </div>
            {createCustomerError && <p className="text-sm text-red-500">{createCustomerError}</p>}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isCreatingCustomer}>
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={handleCreateCustomer} disabled={isCreatingCustomer}>
              {isCreatingCustomer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Histórico */}
      <Dialog open={isBookingsModalOpen} onOpenChange={setIsBookingsModalOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Agendamentos - {selectedCustomerForBookings?.name}
            </DialogTitle>
            <DialogDescription>Visualize todos os agendamentos realizados por este cliente ({customerBookings.length} encontrados)</DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {isLoadingBookings ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="animate-spin h-6 w-6 mr-2" />
                <span>Carregando agendamentos...</span>
              </div>
            ) : customerBookings.length > 0 ? (
              <ScrollArea className="h-[400px] w-full pr-4">
                <div className="space-y-4">
                  {customerBookings.map((booking) => (
                    <Card key={booking._id} className="p-4 bg-secondary/30">
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium">{formatDateTime(booking.time)}</span>
                            {getStatusBadge(booking.status)}
                          </div>
                          <div className="flex items-center gap-2">
                            <Scissors className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm">
                              <strong>Serviço:</strong> {booking.service?.name || "N/A"}
                            </span>
                            {booking.service && <p className="text-xs text-green-700 font-semibold">{PriceFormater(booking.service.price)}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm">
                              <strong>Profissional:</strong> {booking.barber?.name || "N/A"}
                            </span>
                          </div>
                        </div>
                        {booking.createdAt && (
                          <div className="text-xs text-muted-foreground text-right flex-shrink-0">
                            Pedido em
                            <br /> {dateFormatter(booking.createdAt)}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-8">
                <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhum agendamento encontrado</h3>
                <p className="text-muted-foreground">Este cliente ainda não realizou nenhum agendamento nesta barbearia.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Planos */}
      <Dialog open={isAssignPlanModalOpen} onOpenChange={setIsAssignPlanModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Plano para {selectedCustomerForPlan?.name}</DialogTitle>
            <DialogDescription>
              Selecione um plano e o barbeiro responsável pela venda. Escolha "Todos" para permitir que o cliente use o plano com qualquer barbeiro.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="planSelect">Planos Disponíveis</Label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger id="planSelect" className="mt-3 w-full">
                  <SelectValue placeholder="Selecione um plano..." />
                </SelectTrigger>
                <SelectContent>
                  {plans.length > 0 ? (
                    plans.map((plan) => (
                      <SelectItem key={plan._id} value={plan._id}>
                        <div className="flex justify-between w-full pr-2">
                          <span className="font-medium">{plan.name}</span>
                          <span className="text-sm text-muted-foreground">
                            {PriceFormater(plan.price)} - {plan.durationInDays} dias
                          </span>
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">Nenhum plano cadastrado.</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="barberSelect">Barbeiro (Responsável)</Label>
              <Select value={selectedBarberId} onValueChange={setSelectedBarberId}>
                <SelectTrigger id="barberSelect" className="mt-3 w-full">
                  <SelectValue placeholder="Selecione um barbeiro..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Contact className="h-4 w-4 text-primary" />
                      <span className="font-medium text-primary">Todos (cliente pode agendar com qualquer barbeiro)</span>
                    </div>
                  </SelectItem>
                  {allBarbers.length > 0 ? (
                    allBarbers.map((barber) => (
                      <SelectItem key={barber._id} value={barber._id}>
                        <div className="flex items-center gap-2">
                          <Contact className="h-4 w-4 text-muted-foreground" />
                          {barber.name}
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">Nenhum barbeiro encontrado.</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedPlanId && (
              <div className="p-3 bg-muted rounded-lg">
                {(() => {
                  const selectedPlan = plans.find((p) => p._id === selectedPlanId);
                  if (!selectedPlan) return null;
                  return (
                    <div className="space-y-2">
                      <h4 className="font-medium">Resumo do Plano:</h4>
                      <div className="text-sm space-y-1">
                        <div>
                          📋 <strong>Nome:</strong> {selectedPlan.name}
                        </div>
                        <div>
                          💰 <strong>Preço:</strong> {PriceFormater(selectedPlan.price)}
                        </div>
                        <div>
                          ⏰ <strong>Duração:</strong> {selectedPlan.durationInDays} dias
                        </div>
                        {(selectedPlan.totalCredits ?? 0) > 0 && (
                          <div>
                            <CreditCard className="h-4 w-4 mr-1 inline-block" />
                            <strong>Créditos:</strong> {selectedPlan.totalCredits} usos
                          </div>
                        )}
                        {selectedPlan.description && (
                          <div>
                            📝 <strong>Descrição:</strong> {selectedPlan.description}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {assignPlanError && <p className="text-red-500 text-sm">{assignPlanError}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" onClick={() => setIsAssignPlanModalOpen(false)}>
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={handleSubscribeCustomer} disabled={isSubscribing || !selectedPlanId || !selectedBarberId}>
              {isSubscribing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
