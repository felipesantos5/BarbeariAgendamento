import { useEffect, useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import apiClient from "@/services/api";
import { format } from "date-fns";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import {
  Loader2,
  Search,
  Filter,
  User,
  CreditCard,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Eye,
  TrendingUp,
  Users,
  Package,
} from "lucide-react";
import { PhoneFormat } from "@/helper/phoneFormater";
import { PriceFormater } from "@/helper/priceFormater";
import { AdminOutletContext } from "@/types/AdminOutletContext";

// Interfaces
interface Plan {
  _id: string;
  name: string;
  price: number;
  totalCredits: number;
  durationInDays: number;
  description?: string;
}

interface Customer {
  _id: string;
  name: string;
  phone: string;
  imageUrl?: string;
}

interface Barber {
  _id: string;
  name: string;
}

interface Subscription {
  _id: string;
  customer: Customer;
  plan: Plan;
  barber?: Barber;
  status: "active" | "expired" | "canceled" | "pending";
  creditsRemaining: number;
  creditsUsed: number;
  daysRemaining: number;
  autoRenew: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
  mercadoPagoPreapprovalId?: string;
  lastPaymentDate?: string;
  nextPaymentDate?: string;
}

interface MonthlyUsage {
  year: number;
  month: number;
  creditsUsed: number;
  bookings: Array<{
    _id: string;
    time: string;
    status: string;
  }>;
}

interface Stats {
  total: number;
  active: number;
  expired: number;
  canceled: number;
  pending: number;
  withAutoRenew: number;
  recentSubscriptions: number;
}

interface PaginationData {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  limit: number;
}

const getMonthName = (month: number): string => {
  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  return months[month - 1] || "";
};

export function SubscriptionsPage() {
  const { barbershopId } = useOutletContext<AdminOutletContext>();

  // Estados
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationData | null>(null);

  // Modal de detalhes
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [monthlyUsage, setMonthlyUsage] = useState<MonthlyUsage[]>([]);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);

  // Fetch subscriptions
  const fetchSubscriptions = useCallback(async (page = 1) => {
    if (!barbershopId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
      });

      if (searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }

      if (filterStatus !== "all") {
        params.append("status", filterStatus);
      }

      const response = await apiClient.get(
        `/api/barbershops/${barbershopId}/subscriptions?${params.toString()}`
      );

      setSubscriptions(response.data.subscriptions);
      setPagination(response.data.pagination);
    } catch (error: any) {
      console.error("Erro ao carregar assinaturas:", error);
      toast.error(error.response?.data?.error || "Erro ao carregar assinaturas.");
    } finally {
      setIsLoading(false);
    }
  }, [barbershopId, searchTerm, filterStatus]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!barbershopId) return;
    try {
      const response = await apiClient.get(
        `/api/barbershops/${barbershopId}/subscriptions/stats`
      );
      setStats(response.data);
    } catch (error) {
      console.error("Erro ao carregar estatísticas:", error);
    }
  }, [barbershopId]);

  // Fetch monthly usage for a subscription
  const fetchMonthlyUsage = async (subscriptionId: string) => {
    setIsLoadingUsage(true);
    try {
      const response = await apiClient.get(
        `/api/barbershops/${barbershopId}/subscriptions/${subscriptionId}/monthly-usage`
      );
      setMonthlyUsage(response.data.monthlyUsage);
    } catch (error) {
      console.error("Erro ao carregar uso mensal:", error);
      toast.error("Erro ao carregar histórico de uso.");
    } finally {
      setIsLoadingUsage(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions(currentPage);
    fetchStats();
  }, [fetchSubscriptions, fetchStats, currentPage]);

  // Handlers
  const handleOpenDetails = async (subscription: Subscription) => {
    setSelectedSubscription(subscription);
    setIsDetailsModalOpen(true);
    await fetchMonthlyUsage(subscription._id);
  };

  const handleActivateSubscription = async (subscriptionId: string) => {
    try {
      await apiClient.put(
        `/api/barbershops/${barbershopId}/subscriptions/${subscriptionId}/activate`
      );
      toast.success("Assinatura ativada com sucesso!");
      fetchSubscriptions(currentPage);
      fetchStats();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Erro ao ativar assinatura.");
    }
  };

  // Status badge helper
  const getStatusBadge = (status: string, autoRenew: boolean) => {
    switch (status) {
      case "active":
        return (
          <Badge className={autoRenew ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
            {autoRenew ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" />
                Ativo
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3 mr-1" />
                Não renova
              </>
            )}
          </Badge>
        );
      case "expired":
        return (
          <Badge className="bg-gray-100 text-gray-600">
            <Clock className="h-3 w-3 mr-1" />
            Expirado
          </Badge>
        );
      case "canceled":
        return (
          <Badge className="bg-red-100 text-red-800">
            <XCircle className="h-3 w-3 mr-1" />
            Cancelado
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3 mr-1" />
            Pendente
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Format date helper
  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return "N/A";
    try {
      return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return "Data inválida";
    }
  };

  if (isLoading && subscriptions.length === 0) {
    return (
      <div className="flex justify-center items-center p-10">
        <Loader2 className="animate-spin h-8 w-8" />
        <span className="ml-2">Carregando assinaturas...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Gerenciar Assinaturas</h1>
        <Button variant="outline" onClick={() => { fetchSubscriptions(currentPage); fetchStats(); }}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Ativas</p>
                  <p className="text-2xl font-bold text-green-600">{stats.active}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Com Renovação</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.withAutoRenew}</p>
                </div>
                <RefreshCw className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Últimos 30 dias</p>
                  <p className="text-2xl font-bold text-purple-600">{stats.recentSubscriptions}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Card with Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Assinaturas</CardTitle>
          <CardDescription>
            {pagination ? `${pagination.totalItems} assinatura(s) encontrada(s)` : "Carregando..."}
          </CardDescription>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente..."
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
                onValueChange={(value) => {
                  setFilterStatus(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger>
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativas</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="expired">Expiradas</SelectItem>
                  <SelectItem value="canceled">Canceladas</SelectItem>
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
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-center">Créditos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-24">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : subscriptions.length > 0 ? (
                  subscriptions.map((subscription) => (
                    <TableRow key={subscription._id} className="hover:bg-muted/50">
                      {/* Cliente */}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            {subscription.customer?.imageUrl ? (
                              <img
                                src={subscription.customer.imageUrl}
                                alt={subscription.customer.name}
                                className="h-10 w-10 rounded-full object-cover"
                              />
                            ) : (
                              <User className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{subscription.customer?.name || "Cliente removido"}</p>
                            <a
                              href={`https://wa.me/55${subscription.customer?.phone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline"
                            >
                              {PhoneFormat(subscription.customer?.phone || "")}
                            </a>
                          </div>
                        </div>
                      </TableCell>

                      {/* Plano */}
                      <TableCell>
                        <div>
                          <p className="font-medium">{subscription.plan?.name || "Plano removido"}</p>
                          <p className="text-sm text-muted-foreground">
                            {PriceFormater(subscription.plan?.price || 0)}/mês
                          </p>
                        </div>
                      </TableCell>

                      {/* Créditos */}
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Badge variant="secondary" className="font-mono">
                            {subscription.creditsUsed} / {subscription.plan?.totalCredits || 0}
                          </Badge>
                          <span className="text-xs text-muted-foreground">usados</span>
                          {subscription.creditsRemaining > 0 && (
                            <div className="w-16 bg-gray-200 rounded-full h-1.5 mt-1">
                              <div
                                className={`h-1.5 rounded-full ${
                                  (subscription.creditsRemaining / (subscription.plan?.totalCredits || 1)) > 0.5
                                    ? "bg-green-500"
                                    : (subscription.creditsRemaining / (subscription.plan?.totalCredits || 1)) > 0.2
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                                }`}
                                style={{
                                  width: `${(subscription.creditsRemaining / (subscription.plan?.totalCredits || 1)) * 100}%`,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        {getStatusBadge(subscription.status, subscription.autoRenew)}
                      </TableCell>

                      {/* Data de expiração */}
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{formatDate(subscription.endDate)}</span>
                          {subscription.status === "active" && subscription.daysRemaining > 0 && (
                            <Badge
                              variant={subscription.daysRemaining <= 7 ? "destructive" : "outline"}
                              className="text-xs mt-1 w-fit"
                            >
                              {subscription.daysRemaining} dias
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      {/* Vendedor */}
                      <TableCell>
                        <span className="text-sm">
                          {subscription.barber?.name || (subscription.mercadoPagoPreapprovalId ? "Online" : "Todos os barbeiros")}
                        </span>
                      </TableCell>

                      {/* Ações */}
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDetails(subscription)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Detalhes
                          </Button>
                          {subscription.status === "pending" && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleActivateSubscription(subscription._id)}
                            >
                              Ativar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-24">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Users className="h-8 w-8 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {searchTerm || filterStatus !== "all"
                            ? "Nenhuma assinatura encontrada com os filtros aplicados."
                            : "Nenhuma assinatura cadastrada ainda."}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
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
                      Página {currentPage} de {pagination.totalPages}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage < pagination.totalPages) setCurrentPage(currentPage + 1);
                      }}
                      className={currentPage === pagination.totalPages ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Detalhes */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Detalhes da Assinatura
            </DialogTitle>
            <DialogDescription>
              Informações completas e histórico de uso de créditos
            </DialogDescription>
          </DialogHeader>

          {selectedSubscription && (
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-6">
                {/* Info do Cliente e Plano */}
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Cliente</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-semibold">{selectedSubscription.customer?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {PhoneFormat(selectedSubscription.customer?.phone || "")}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Plano</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-semibold">{selectedSubscription.plan?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {PriceFormater(selectedSubscription.plan?.price || 0)}/mês
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Status e Créditos */}
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {getStatusBadge(selectedSubscription.status, selectedSubscription.autoRenew)}
                      {selectedSubscription.mercadoPagoPreapprovalId && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Assinatura via Mercado Pago
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Créditos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold">
                          {selectedSubscription.creditsRemaining}
                        </span>
                        <span className="text-muted-foreground">
                          / {selectedSubscription.plan?.totalCredits} restantes
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className="h-2 rounded-full bg-green-500"
                          style={{
                            width: `${(selectedSubscription.creditsRemaining / (selectedSubscription.plan?.totalCredits || 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Datas */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Período</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Início</p>
                        <p className="font-medium">{formatDate(selectedSubscription.startDate)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Término</p>
                        <p className="font-medium">{formatDate(selectedSubscription.endDate)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Dias Restantes</p>
                        <p className="font-medium">{selectedSubscription.daysRemaining} dias</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Uso Mensal */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Uso de Créditos por Mês
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoadingUsage ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : monthlyUsage.length > 0 ? (
                      <div className="space-y-3">
                        {monthlyUsage.map((usage, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                          >
                            <div>
                              <p className="font-medium">
                                {getMonthName(usage.month)} {usage.year}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {usage.bookings.length} agendamento(s)
                              </p>
                            </div>
                            <Badge variant="secondary" className="font-mono text-lg">
                              {usage.creditsUsed} crédito(s)
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-4">
                        Nenhum crédito utilizado ainda.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Info do Vendedor */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {selectedSubscription.barber ? "Vendido por" : "Disponível para"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-medium">
                      {selectedSubscription.barber?.name || "Todos os barbeiros"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedSubscription.barber
                        ? `Em ${formatDate(selectedSubscription.createdAt)}`
                        : "Cliente pode agendar com qualquer profissional"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
