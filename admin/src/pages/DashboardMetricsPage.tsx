// src/pages/DashboardMetricsPage.tsx
import { useEffect, useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { DateRange } from "react-day-picker";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  CalendarIcon,
  Clock,
  DollarSign,
  UserCheck,
  UserPlus,
  Loader2,
  ClipboardList,
  ClipboardCheck,
  ClipboardX,
  BadgePercent,
  LineChart,
  BarChart3,
  PieChart,
  Package,
  PackagePlus,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from "recharts";

// Helpers & Services
import apiClient from "@/services/api";
import { PriceFormater } from "@/helper/priceFormater";
import { API_BASE_URL } from "@/config/BackendUrl";
import { AdminOutletContext } from "@/types/AdminOutletContext";

interface Period {
  startDate: string;
  endDate: string;
}

// Métricas gerais de contagem
interface GeneralMetrics {
  totalBookings: number;
  completedBookings: number;
  canceledBookings: number;
  pendingBookings: number;
  cancellationRate: number;
  totalUniqueCustomers: number;
  totalPlansSold: number;
  totalProductsSold: number;
}

// Visão financeira detalhada
interface FinancialOverview {
  totalGrossRevenue: number;
  revenueFromServices: number;
  revenueFromPlans: number;
  revenueFromProducts: number;
  totalCommissionsPaid: number;
  commissionFromServices: number;
  commissionFromPlans: number;
  commissionFromProducts: number;
  totalExpenses: number;
  totalCostOfGoods: number;
  totalOperationalCosts: number;
  totalNetRevenue: number;
}

// Performance de barbeiro (completa)
interface BarberPerformance {
  _id: string;
  name: string;
  commissionRate: number;
  totalServiceRevenue: number;
  totalServiceCommission: number;
  completedBookings: number;
  totalPlanRevenue: number;
  totalPlanCommission: number;
  totalPlansSold: number;
  totalProductRevenue: number;
  totalProductCommission: number;
  totalProductsSold: number;
  totalCommission: number;
}

// Performance de serviço
interface ServicePerformance {
  serviceId: string | null;
  name: string | null;
  totalRevenue: number;
  count: number;
}

// Estatísticas de cliente
interface CustomerStats {
  new: number;
  returning: number;
}

// Faturamento diário
interface DailyRevenue {
  date: string;
  revenue: number;
  bookings: number;
}

// Faturamento por hora
interface HourlyRevenue {
  hour: number;
  revenue: number;
  bookings: number;
}

// Movimentação de estoque
interface StockMovement {
  totalProductsSold: number;
  totalProductsPurchased: number;
  totalPurchaseCost: number;
  totalSalesRevenue: number;
  netProductRevenue: number;
}

// Estrutura principal da resposta da API
interface DashboardMetricsData {
  period: Period;
  generalMetrics: GeneralMetrics;
  financialOverview: FinancialOverview;
  barberPerformance: BarberPerformance[];
  servicePerformance: ServicePerformance[];
  customerStats: CustomerStats;
  dailyRevenue: DailyRevenue[];
  hourlyRevenue: HourlyRevenue[];
  stockMovement: StockMovement;
}

// Cores para os gráficos
const CHART_COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#06b6d4", // cyan-500
  "#ec4899", // pink-500
  "#84cc16", // lime-500
];

// --- Componente Principal ---
export default function DashboardMetricsPage() {
  const { barbershopId } = useOutletContext<AdminOutletContext>();
  const [data, setData] = useState<DashboardMetricsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de Filtro
  const currentYear = new Date().getFullYear();
  const currentMonth = (new Date().getMonth() + 1).toString();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [filterMode, setFilterMode] = useState<"month" | "range">("month");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // ✅ FUNÇÃO DE FETCH (2/4) - Atualizada para novo tipo
  const fetchDashboardMetrics = async (startDate: Date, endDate: Date) => {
    if (!barbershopId) return;
    setIsLoading(true);
    setError(null);

    const params = {
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
    };

    try {
      const response = await apiClient.get<DashboardMetricsData>(`${API_BASE_URL}/api/barbershops/${barbershopId}/dashboard-metrics`, { params });
      setData(response.data);
    } catch (err: any) {
      console.error("Erro ao buscar métricas:", err);
      setError("Não foi possível carregar as métricas.");
      toast.error(err.response?.data?.error || "Falha ao buscar métricas.");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  // useEffect para buscar dados
  useEffect(() => {
    let start: Date | undefined;
    let end: Date | undefined;

    if (filterMode === "month") {
      const yearNum = parseInt(selectedYear, 10);
      const monthNum = parseInt(selectedMonth, 10) - 1;
      if (!isNaN(yearNum) && !isNaN(monthNum)) {
        start = startOfMonth(new Date(yearNum, monthNum));
        end = endOfMonth(new Date(yearNum, monthNum));
      }
    } else if (filterMode === "range" && dateRange?.from && dateRange?.to) {
      start = dateRange.from;
      end = dateRange.to;
    } else if (filterMode === "range" && dateRange?.from && !dateRange?.to) {
      start = dateRange.from;
      end = dateRange.from;
    }

    if (start && end) {
      fetchDashboardMetrics(start, end);
    } else {
      const now = new Date();
      fetchDashboardMetrics(startOfMonth(now), endOfMonth(now));
    }
  }, [barbershopId, selectedMonth, selectedYear, dateRange, filterMode]);

  // Funções de formatação e helpers
  const availableYears = useMemo(() => {
    const years = [];
    for (let i = 0; i < 5; i++) {
      years.push((currentYear - i).toString());
    }
    return years;
  }, [currentYear]);

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const formatActivePeriodDisplay = (): string => {
    if (filterMode === "month") {
      const yearNum = parseInt(selectedYear, 10);
      const monthNum = parseInt(selectedMonth, 10) - 1;
      if (!isNaN(yearNum) && !isNaN(monthNum) && monthNum >= 0 && monthNum < 12) {
        return `${monthNames[monthNum]} de ${yearNum}`;
      }
      return "Mês/Ano inválido";
    }
    return formatDateRangeDisplay(dateRange);
  };

  const formatDateRangeDisplay = (range: DateRange | undefined): string => {
    if (!range?.from) return "Selecione o intervalo";
    if (!range.to) return format(range.from, "PPP", { locale: ptBR });
    return `${format(range.from, "PPP", { locale: ptBR })} - ${format(range.to, "PPP", { locale: ptBR })}`;
  };

  return (
    <div className="space-y-6">
      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Carregando métricas...</span>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <Card className="border-destructive bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Erro ao Carregar</CardTitle>
            <CardDescription className="text-destructive">Período: {formatActivePeriodDisplay()}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                /* ... (lógica de refetch) ... */
              }}
            >
              Tentar Novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ✅ SEÇÃO DE MÉTRICAS ATUALIZADA (3/4) */}
      {data && !isLoading && !error && (
        <>
          {/* Card de Resumo Financeiro (Bruto vs Líquido) */}
          <Card className="gap-4">
            <CardHeader className="flex flex-row justify-between">
              <div className="flex flex-col">
                <CardTitle>Resumo Financeiro</CardTitle>
                {/* <CardDescription>O desempenho financeiro consolidado da barbearia no período.</CardDescription> */}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Select
                  value={selectedMonth}
                  onValueChange={(value) => {
                    setSelectedMonth(value);
                    setFilterMode("month");
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue placeholder="Mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthNames.map((name, index) => (
                      <SelectItem key={index} value={(index + 1).toString()}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedYear}
                  onValueChange={(value) => {
                    setSelectedYear(value);
                    setFilterMode("month");
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[120px]">
                    <SelectValue placeholder="Ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="date-range-popover"
                      variant={"outline"}
                      className={`w-full sm:w-auto justify-start text-left font-normal ${filterMode === "range" ? "ring-2 ring-primary ring-offset-2" : ""
                        }`}
                      onClick={() => setFilterMode("range")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filterMode === "range" ? formatDateRangeDisplay(dateRange) : "Intervalo Específico"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from ?? new Date()}
                      selected={dateRange}
                      onSelect={(range) => {
                        setDateRange(range);
                        if (range?.from) {
                          setFilterMode("range");
                        }
                      }}
                      numberOfMonths={2}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
                <MetricCard
                  title="Faturamento Bruto"
                  value={PriceFormater(data.financialOverview.totalGrossRevenue)}
                  icon={LineChart}
                  description="Serviços + Planos + Produtos"
                  valueClassName="text-blue-600"
                  className="justify-around"
                />
                <MetricCard
                  title="Despesas de Comissões"
                  value={PriceFormater(data.financialOverview.totalCommissionsPaid)}
                  icon={BadgePercent}
                  description="Comissões (Serviços, Planos, Produtos)"
                  valueClassName="text-red-600"
                  className="justify-around"
                />
                <MetricCard
                  title="Despesas"
                  value={PriceFormater(data.financialOverview.totalExpenses)}
                  icon={Package}
                  description="Compra de Produtos + Custos Operacionais"
                  valueClassName="text-orange-600"
                  className="justify-around"
                />
                <MetricCard
                  title="Faturamento Líquido"
                  value={PriceFormater(data.financialOverview.totalNetRevenue)}
                  icon={DollarSign}
                  description="Bruto - Comissões - Despesas"
                  valueClassName="text-green-600"
                  className="bg-green-50 border-green-200 justify-around"
                />
              </div>

              {/* <Separator className="my-6" /> */}

              {/* Detalhes da Receita Bruta 
              {/*<div>
                <h3 className="text-lg font-semibold mb-3 text-primary flex items-center gap-2">
                  <TrendingUp size={20} />
                  Detalhes da Receita Bruta
                </h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard
                    title="Receita de Serviços"
                    value={PriceFormater(data.financialOverview.revenueFromServices)}
                    icon={Scissors}
                    description={`${data.generalMetrics.completedBookings} agendamentos concluídos`}
                  />
                  <MetricCard
                    title="Receita de Planos"
                    value={PriceFormater(data.financialOverview.revenueFromPlans)}
                    icon={Package}
                    description={`${data.generalMetrics.totalPlansSold} planos vendidos`}
                  />
                  <MetricCard
                    title="Receita de Produtos"
                    value={PriceFormater(data.financialOverview.revenueFromProducts)}
                    icon={ShoppingCart}
                    description={`${data.generalMetrics.totalProductsSold} produtos vendidos`}
                  />
                </div>
              </div>*/}

              {/* <Separator className="my-6" /> */}

              {/* Detalhes das Despesas (Comissões) */}
              {/* <div>
                <h3 className="text-lg font-semibold mb-3 text-primary flex items-center gap-2">
                  <ArrowDownWideNarrow size={20} />
                  Detalhes das Despesas (Comissões)
                </h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard
                    title="Comissão (Serviços)"
                    value={PriceFormater(data.financialOverview.commissionFromServices)}
                    icon={Scissors}
                    description="Comissão sobre agendamentos"
                  />
                  <MetricCard
                    title="Comissão (Planos)"
                    value={PriceFormater(data.financialOverview.commissionFromPlans)}
                    icon={Package}
                    description="Comissão sobre venda de planos"
                  />
                  <MetricCard
                    title="Comissão (Produtos)"
                    value={PriceFormater(data.financialOverview.commissionFromProducts)}
                    icon={ShoppingCart}
                    description="Comissão sobre venda de produtos"
                  />
                </div>
              </div> */}

              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      <CardTitle>Faturamento por Dia</CardTitle>
                    </div>

                  </CardHeader>
                  <CardContent className="p-0!">
                    {data.dailyRevenue.length > 0 ? (
                      <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={data.dailyRevenue.map((item) => ({
                              ...item,
                              dateFormatted: format(parseISO(item.date), "dd/MM", { locale: ptBR }),
                              dateComplete: format(parseISO(item.date), "dd 'de' MMMM", { locale: ptBR }),
                            }))}
                            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                              dataKey="dateFormatted"
                              tick={{ fontSize: 12 }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              tickFormatter={(value) => `R$${value.toLocaleString("pt-BR")}`}
                              tick={{ fontSize: 12 }}
                              tickLine={false}
                              axisLine={false}
                              width={80}
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="rounded-lg border bg-background p-3 shadow-lg">
                                      <p className="font-medium">{data.dateComplete}</p>
                                      <p className="text-sm text-blue-600">
                                        Receita: {PriceFormater(data.revenue)}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        {data.bookings} atendimento{data.bookings !== 1 ? "s" : ""}
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="revenue"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              fill="url(#colorRevenue)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex h-[350px] items-center justify-center text-muted-foreground">
                        Nenhum dado de faturamento diário para este período.
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Gráfico de Pizza - Serviços */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <PieChart className="h-5 w-5 text-primary" />
                      <CardTitle>Receita por Serviço</CardTitle>
                    </div>
                    <CardDescription>
                      Distribuição do faturamento entre os serviços
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.servicePerformance.length > 0 ? (
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Pie
                              data={data.servicePerformance.slice(0, 6).map((service, index) => ({
                                name: service.name || "Serviço Removido",
                                value: service.totalRevenue,
                                count: service.count,
                                fill: CHART_COLORS[index % CHART_COLORS.length],
                              }))}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {data.servicePerformance.slice(0, 6).map((_, index) => (
                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="rounded-lg border bg-background p-3 shadow-lg">
                                      <p className="font-medium">{data.name}</p>
                                      <p className="text-sm" style={{ color: data.fill }}>
                                        {PriceFormater(data.value)}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        {data.count} atendimento{data.count !== 1 ? "s" : ""}
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Legend
                              formatter={(value) => (
                                <span className="text-xs text-foreground">{value}</span>
                              )}
                            />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                        Nenhum dado de serviços para este período.
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Gráfico de Barras - Horários mais Rentáveis */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      <CardTitle>Faturamento por Horário</CardTitle>
                    </div>
                    <CardDescription>
                      Horários com maior receita de serviços
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.hourlyRevenue.length > 0 ? (
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={data.hourlyRevenue.map((item) => ({
                              ...item,
                              hourFormatted: `${String(item.hour).padStart(2, "0")}:00`,
                            }))}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                            <XAxis
                              dataKey="hourFormatted"
                              tick={{ fontSize: 11 }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              tickFormatter={(value) => `R$${value}`}
                              tick={{ fontSize: 11 }}
                              tickLine={false}
                              axisLine={false}
                              width={60}
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="rounded-lg border bg-background p-3 shadow-lg">
                                      <p className="font-medium">{data.hourFormatted}</p>
                                      <p className="text-sm text-emerald-600">
                                        Receita: {PriceFormater(data.revenue)}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        {data.bookings} atendimento{data.bookings !== 1 ? "s" : ""}
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar
                              dataKey="revenue"
                              fill="#10b981"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                        Nenhum dado de horário para este período.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Separator className="my-6" />

              {/* Grupo de Agendamentos & Clientes */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-primary flex items-center gap-2">
                  <ClipboardList size={20} /> Agendamentos & Clientes
                </h3>
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
                  <MetricCard
                    title="Concluídos"
                    value={data.generalMetrics.completedBookings}
                    icon={ClipboardCheck}
                    description={`de ${data.generalMetrics.totalBookings} criados`}
                    valueClassName="text-green-600"
                  />
                  <MetricCard
                    title="Pendentes"
                    value={data.generalMetrics.pendingBookings}
                    icon={Clock}
                    description="Aguardando confirmação ou data"
                    valueClassName="text-amber-600"
                  />
                  <MetricCard
                    title="Cancelados"
                    value={data.generalMetrics.canceledBookings}
                    icon={ClipboardX}
                    description={`${data.generalMetrics.cancellationRate.toFixed(1)}% taxa`}
                    valueClassName="text-red-600"
                  />
                  <MetricCard
                    title="Novos Clientes"
                    value={data.customerStats.new}
                    icon={UserPlus}
                    description="Cadastrados no período"
                    valueClassName="text-cyan-600"
                  />
                  <MetricCard
                    title="Clientes Recorrentes"
                    value={data.customerStats.returning}
                    icon={UserCheck}
                    description="Já eram clientes antes"
                    valueClassName="text-indigo-600"
                  />
                </div>
              </div>

              <Separator className="my-6" />

              {/* Grupo de Movimentação de Estoque */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-primary flex items-center gap-2">
                  <Package size={20} /> Movimentação de Estoque
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    title="Produtos Vendidos"
                    value={data.stockMovement.totalProductsSold}
                    icon={ShoppingCart}
                    description="Unidades vendidas no período"
                    valueClassName="text-blue-600"
                  />
                  <MetricCard
                    title="Produtos Comprados"
                    value={PriceFormater(data.stockMovement.totalPurchaseCost)}
                    icon={PackagePlus}
                    description={`${data.stockMovement.totalProductsPurchased} unidades`}
                    valueClassName="text-orange-600"
                  />
                  <MetricCard
                    title="Receita de Produtos"
                    value={PriceFormater(data.stockMovement.totalSalesRevenue)}
                    icon={DollarSign}
                    description="Valor bruto de vendas"
                    valueClassName="text-green-600"
                  />
                  <MetricCard
                    title="Lucro Líquido"
                    value={PriceFormater(data.stockMovement.netProductRevenue)}
                    icon={TrendingUp}
                    description="Receita - Custo dos produtos"
                    valueClassName="text-emerald-600"
                    className="bg-emerald-50 border-emerald-200"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ===== SEÇÃO DE GRÁFICOS ===== */}


          {/* ✅ TABELA DE BARBEIROS (4/4) - ATUALIZADA CONFORME SOLICITADO */}
          <Card>
            <CardHeader>
              <CardTitle>Desempenho por Profissional</CardTitle>
              <CardDescription>Resultados individuais (serviços, planos e produtos) de cada profissional no período.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profissional</TableHead>
                    <TableHead className="text-right text-green-600">Receita (Serviços)</TableHead>
                    <TableHead className="text-right text-green-600">Receita (Planos)</TableHead>
                    <TableHead className="text-right text-green-600">Receita (Produtos)</TableHead>
                    <TableHead className="text-right text-purple-600">Comissão Total</TableHead>
                    <TableHead className="text-center">Atendimentos</TableHead>
                    <TableHead className="text-center">Vendas (Planos)</TableHead>
                    <TableHead className="text-center">Vendas (Prod.)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.barberPerformance.length > 0 ? (
                    data.barberPerformance.map((barber) => (
                      <TableRow key={barber._id}>
                        {/* Nome */}
                        <TableCell className="font-medium">
                          {barber.name}
                          <span className="ml-2 text-xs text-muted-foreground">({barber.commissionRate}%)</span>
                        </TableCell>

                        {/* Receitas (Valores cheios) */}
                        <TableCell className="text-right font-semibold text-green-700">{PriceFormater(barber.totalServiceRevenue)}</TableCell>
                        <TableCell className="text-right font-semibold text-green-700">{PriceFormater(barber.totalPlanRevenue)}</TableCell>
                        <TableCell className="text-right font-semibold text-green-700">{PriceFormater(barber.totalProductRevenue)}</TableCell>

                        {/* Comissão Total */}
                        <TableCell className="text-right font-bold text-purple-700">{PriceFormater(barber.totalCommission)}</TableCell>

                        {/* Contagens (Quantidades) */}
                        <TableCell className="text-center">{barber.completedBookings}</TableCell>
                        <TableCell className="text-center">{barber.totalPlansSold}</TableCell>
                        <TableCell className="text-center">{barber.totalProductsSold}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        Nenhum dado de profissional para este período.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Desempenho dos Serviços */}
          {/* <Card>
            <CardHeader>
              <CardTitle>Serviços Mais Populares</CardTitle>
              <CardDescription>Receita e quantidade por serviço no período.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead className="text-center">Quantidade</TableHead>
                    <TableHead className="text-right">Receita Gerada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.servicePerformance.length > 0 ? (
                    data.servicePerformance.map((service, index) => (
                      <TableRow key={service.serviceId || `removed-${index}`}>
                        <TableCell className="font-medium">{service.name || "Serviço Removido"}</TableCell>
                        <TableCell className="text-center">{service.count}</TableCell>
                        <TableCell className="text-right font-semibold">{PriceFormater(service.totalRevenue)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                        Nenhum dado de serviço para este período.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card> */}
        </>
      )}
    </div>
  );
}

// --- Componente MetricCard (mantido) ---
interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  className?: string;
  valueClassName?: string;
}

function MetricCard({ title, value, icon: Icon, description, className, valueClassName }: MetricCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueClassName ? valueClassName : ""}`}>{value}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}
