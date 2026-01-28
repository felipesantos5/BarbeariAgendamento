// src/pages/BarberPerformancePage.tsx
import { useEffect, useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { toast } from "sonner";

// Componentes de UI e Ícones
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users,
  Loader2,
  Banknote,
  BadgePercent,
  Scissors,
  Package, // ✅ Ícone Adicionado
  ShoppingCart, // ✅ Ícone Adicionado
} from "lucide-react";
import { Separator } from "@/components/ui/separator"; // ✅ Separador Adicionado

// Helpers e Serviços
import apiClient from "@/services/api";
import { PriceFormater } from "@/helper/priceFormater";
import { API_BASE_URL } from "@/config/BackendUrl";

// --- Tipagens ---
interface AdminOutletContext {
  barbershopId: string;
}

interface Period {
  startDate: string;
  endDate: string;
}

// ✅ ATUALIZADO (1/3): Interface de Métricas
// Corresponde 100% ao seu novo payload
interface OverviewMetrics {
  totalServiceRevenue: number;
  totalBookings: number;
  serviceCommissionRate: number;
  totalServiceCommission: number;
  totalUniqueCustomers: number;
  totalProductRevenue: number;
  totalProductCommission: number;
  totalProductsSold: number;
  totalPlanRevenue: number;
  totalPlanCommission: number;
  totalPlansSold: number;
  totalCommission: number;
}

// Detalhamento por serviço
interface ServiceBreakdown {
  serviceId: string;
  serviceName: string;
  count: number;
  revenueFromService: number;
}

// Estrutura completa dos dados da API
interface BarberPerformanceData {
  period: Period;
  overview: OverviewMetrics;
  serviceBreakdown: ServiceBreakdown[];
}

// --- Componente Principal ---
export function BarberPerformancePage() {
  const { barbershopId } = useOutletContext<AdminOutletContext>();
  const [data, setData] = useState<BarberPerformanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de Filtro
  const currentYear = new Date().getFullYear();
  const currentMonth = (new Date().getMonth() + 1).toString();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);

  // Função para buscar os dados de performance
  const fetchPerformanceData = async (startDate: Date, endDate: Date) => {
    if (!barbershopId) return;
    setIsLoading(true);
    setError(null);

    const params = {
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
    };

    try {
      // A API /barber-performance identificará o barbeiro logado pelo token JWT
      const response = await apiClient.get<BarberPerformanceData>(`${API_BASE_URL}/api/barbershops/${barbershopId}/barber-performance`, { params });
      setData(response.data);
    } catch (err: any) {
      console.error("Erro ao buscar performance:", err);
      setError("Não foi possível carregar o relatório de performance.");
      toast.error(err.response?.data?.error || "Falha ao buscar dados.");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  // useEffect para buscar dados quando os filtros mudarem
  useEffect(() => {
    let start: Date | undefined;
    let end: Date | undefined;

    // "Todos os Anos" selecionado
    if (selectedYear === "all") {
      const currentDate = new Date();
      start = new Date(currentDate.getFullYear() - 10, 0, 1); // Últimos 10 anos
      end = new Date(currentDate.getFullYear(), 11, 31);
    }
    // "Ano Completo" selecionado
    else if (selectedMonth === "0") {
      const yearNum = parseInt(selectedYear, 10);
      if (!isNaN(yearNum)) {
        start = startOfYear(new Date(yearNum, 0));
        end = endOfYear(new Date(yearNum, 0));
      }
    }
    // Mês específico selecionado
    else {
      const yearNum = parseInt(selectedYear, 10);
      const monthNum = parseInt(selectedMonth, 10) - 1;
      if (!isNaN(yearNum) && !isNaN(monthNum)) {
        start = startOfMonth(new Date(yearNum, monthNum));
        end = endOfMonth(new Date(yearNum, monthNum));
      }
    }

    if (start && end) {
      fetchPerformanceData(start, end);
    }
  }, [barbershopId, selectedMonth, selectedYear]);

  // Opções para os filtros de Select
  const availableYears = useMemo(() => {
    const years = [];
    for (let i = 0; i < 5; i++) {
      years.push((currentYear - i).toString());
    }
    return years;
  }, [currentYear]);

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  // Formata o período selecionado para exibição
  const formatActivePeriodDisplay = (): string => {
    // "Todos os Anos" selecionado
    if (selectedYear === "all") {
      return "Todos os Anos";
    }
    // "Ano Completo" selecionado
    if (selectedMonth === "0") {
      const yearNum = parseInt(selectedYear, 10);
      if (!isNaN(yearNum)) {
        return `Ano Completo de ${yearNum}`;
      }
    }
    // Mês específico selecionado
    const yearNum = parseInt(selectedYear, 10);
    const monthNum = parseInt(selectedMonth, 10) - 1;
    if (!isNaN(yearNum) && !isNaN(monthNum) && monthNum >= 0 && monthNum < 12) {
      return `${monthNames[monthNum]} de ${yearNum}`;
    }
    return "Mês/Ano inválido";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <CardTitle>Minha Performance</CardTitle>
            <CardDescription>{isLoading ? "Calculando..." : `Resumo dos seus resultados de ${formatActivePeriodDisplay()}.`}</CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                {monthNames.map((name, index) => (
                  <SelectItem key={index} value={(index + 1).toString()}>
                    {name}
                  </SelectItem>
                ))}
                <SelectItem value="0">Ano Completo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-full sm:w-[120px]">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
                <SelectItem value="all">Todos os Anos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        {isLoading && (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Calculando performance...</span>
          </div>
        )}

        {error && !isLoading && (
          <CardContent>
            <p className="text-destructive text-center">{error}</p>
          </CardContent>
        )}

        {/* ✅ ATUALIZADO (2/3): Seção de Métricas */}
        {data && !isLoading && !error && (
          <CardContent className="space-y-6">
            {/* Card principal com a comissão total (EM DESTAQUE) */}
            <Card className="mb-6 bg-purple-50 border-purple-200 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-purple-800">Sua Comissão Total no Período</CardTitle>
                <BadgePercent className="h-5 w-5 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-purple-700">{PriceFormater(data.overview.totalCommission)}</div>
                <p className="text-xs text-purple-600">
                  {PriceFormater(data.overview.totalServiceCommission)} (Serviços) + {PriceFormater(data.overview.totalPlanCommission)} (Planos) +{" "}
                  {PriceFormater(data.overview.totalProductCommission)} (Produtos)
                </p>
              </CardContent>
            </Card>

            {/* --- Seção Serviços e Planos --- */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-primary flex items-center gap-2">
                <Scissors size={20} />
                Métricas de Atendimento e Planos
              </h3>
              {/* Grid ATUALIZADA (sem Ticket Médio, com Planos) */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="Receita de Serviços"
                  value={PriceFormater(data.overview.totalServiceRevenue)}
                  icon={Scissors}
                  description={`${data.overview.totalBookings} agendamentos concluídos`}
                  valueClassName="text-green-600"
                />
                <MetricCard
                  title="Comissão (Serviços)"
                  value={PriceFormater(data.overview.totalServiceCommission)}
                  icon={BadgePercent}
                  description={`Baseado em ${data.overview.serviceCommissionRate}% da receita`}
                  valueClassName="text-gray-700"
                />
                <MetricCard
                  title="Comissão (Planos)"
                  value={PriceFormater(data.overview.totalPlanCommission)}
                  icon={Package} // Ícone de plano
                  description={`${data.overview.totalPlansSold} plano(s) vendido(s)`} // Descrição
                  valueClassName="text-violet-600" // Cor
                />
                <MetricCard title="Clientes Únicos" value={data.overview.totalUniqueCustomers} icon={Users} description="Clientes que você atendeu" />
              </div>
            </div>

            <Separator />

            {/* --- Seção Produtos --- */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-primary flex items-center gap-2">
                <ShoppingCart size={20} />
                Métricas de Produtos
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="Produtos Vendidos"
                  value={data.overview.totalProductsSold}
                  icon={ShoppingCart}
                  description="Itens vendidos por você"
                />
                <MetricCard
                  title="Receita de Produtos"
                  value={PriceFormater(data.overview.totalProductRevenue)}
                  icon={Banknote}
                  description="Valor total dos produtos"
                  valueClassName="text-green-600"
                />
                <MetricCard
                  title="Comissão (Produtos)"
                  value={PriceFormater(data.overview.totalProductCommission)}
                  icon={BadgePercent}
                  description="Comissão das vendas de produtos"
                  valueClassName="text-gray-700"
                />
              </div>
            </div>

            <Separator />

            {/* ✅ ATUALIZADO (3/3): Tabela de Serviços (Título) */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-primary flex items-center gap-2">
                <Scissors size={20} />
                Serviços Realizados (Detalhado)
              </h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serviço</TableHead>
                      <TableHead className="text-center">Quantidade</TableHead>
                      <TableHead className="text-right">Receita Gerada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.serviceBreakdown.length > 0 ? (
                      data.serviceBreakdown.map((service) => (
                        <TableRow key={service.serviceId}>
                          <TableCell className="font-medium">{service.serviceName}</TableCell>
                          <TableCell className="text-center">{service.count}</TableCell>
                          <TableCell className="text-right font-semibold">{PriceFormater(service.revenueFromService)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                          Nenhum serviço realizado neste período.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// --- Componente Auxiliar MetricCard (Sem mudanças) ---
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
