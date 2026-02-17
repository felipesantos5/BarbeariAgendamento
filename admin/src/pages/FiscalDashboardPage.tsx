import { useEffect, useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  BadgePercent,
  TrendingUp,
  Info,
  Scale,
  FileText,
  AlertCircle
} from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

import apiClient from "@/services/api";
import { PriceFormater } from "@/helper/priceFormater";
import { API_BASE_URL } from "@/config/BackendUrl";

interface TaxProjection {
  period: {
    start: string;
    end: string;
  };
  metrics: {
    grossRevenue: number;
    totalCommissions: number;
    taxableRevenue: number;
    estimatedTax: number;
    netAfterTax: number;
  };
  taxRegime: {
    regime: string;
    rate: number;
    leiSalaoParceiroApplied: boolean;
  };
}

interface AdminOutletContext {
  barbershopId: string;
}

export function FiscalDashboardPage() {
  const { barbershopId } = useOutletContext<AdminOutletContext>();
  const [data, setData] = useState<TaxProjection | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const currentYear = new Date().getFullYear();
  const currentMonth = (new Date().getMonth() + 1).toString();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);

  const fetchTaxProjection = async (startDate: Date, endDate: Date) => {
    if (!barbershopId) return;
    setIsLoading(true);

    const params = {
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
    };

    try {
      const response = await apiClient.get<TaxProjection>(
        `${API_BASE_URL}/api/barbershops/${barbershopId}/tax-analytics/projection`,
        { params }
      );
      setData(response.data);
    } catch (err: any) {
      console.error("Erro ao buscar projeção fiscal:", err);
      toast.error(err.response?.data?.error || "Falha ao buscar projeção fiscal.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let start: Date;
    let end: Date;

    if (selectedMonth === "0") {
      start = startOfYear(new Date(parseInt(selectedYear), 0));
      end = endOfYear(new Date(parseInt(selectedYear), 0));
    } else {
      const month = parseInt(selectedMonth) - 1;
      start = startOfMonth(new Date(parseInt(selectedYear), month));
      end = endOfMonth(new Date(parseInt(selectedYear), month));
    }

    fetchTaxProjection(start, end);
  }, [barbershopId, selectedMonth, selectedYear]);

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const availableYears = useMemo(() => {
    const years = [];
    for (let i = 0; i < 3; i++) {
      years.push((currentYear - i).toString());
    }
    return years;
  }, [currentYear]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="text-primary" /> Inteligência Fiscal
          </h1>
          <p className="text-muted-foreground">Projeção tributária e Lei do Salão-Parceiro</p>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-full md:w-[150px]">
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
            <SelectTrigger className="w-full md:w-[120px]">
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
        </div>
      </div>

      {data && (
        <>
          {/* Card de Regime e Lei do Salão Parceiro */}
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-blue-900">Configuração Atual</CardTitle>
                  <CardDescription className="text-blue-700">Com base no cadastro da barbearia</CardDescription>
                </div>
                <BadgePercent className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                <div className="flex items-center gap-4 bg-white/60 p-4 rounded-lg border border-blue-100 shadow-sm">
                  <div className="p-3 bg-blue-500 rounded-full text-white">
                    <FileText size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-900">Regime Tributário</p>
                    <p className="text-2xl font-bold text-blue-700">{data.taxRegime.regime}</p>
                    <p className="text-xs text-blue-600">Alíquota estimada: {data.taxRegime.rate}%</p>
                  </div>
                </div>

                <div className={`flex items-center gap-4 p-4 rounded-lg border shadow-sm ${data.taxRegime.leiSalaoParceiroApplied ? 'bg-green-500 text-white border-green-600' : 'bg-amber-100 border-amber-200 text-amber-900'}`}>
                  <div className={`p-3 rounded-full ${data.taxRegime.leiSalaoParceiroApplied ? 'bg-white text-green-600' : 'bg-amber-500 text-white'}`}>
                    <Scale size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-medium opacity-90">Lei do Salão-Parceiro</p>
                    <p className="text-2xl font-bold">{data.taxRegime.leiSalaoParceiroApplied ? "ATIVADA" : "DESATIVADA"}</p>
                    <p className="text-xs opacity-80">
                      {data.taxRegime.leiSalaoParceiroApplied
                        ? "As comissões são deduzidas da base de impostos."
                        : "O imposto incide sobre o faturamento bruto total."}
                    </p>
                  </div>
                </div>
              </div>

              {!data.taxRegime.leiSalaoParceiroApplied && (
                <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-sm">
                  <AlertCircle size={18} />
                  <span>Você está pagando impostos sobre as comissões! Ative a Lei do Salão-Parceiro nas configurações.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Métricas Principais */}
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento Bruto</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{PriceFormater(data.metrics.grossRevenue)}</div>
                <div className="mt-2 flex items-center text-xs text-muted-foreground">
                  <DollarSign size={14} className="mr-1" /> Total arrecadado
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Comissões Pagas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{PriceFormater(data.metrics.totalCommissions)}</div>
                <div className="mt-2 flex items-center text-xs text-muted-foreground">
                  <BadgePercent size={14} className="mr-1" /> Repassado aos barbeiros
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-50 border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-700">Base de Cálculo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-800">{PriceFormater(data.metrics.taxableRevenue)}</div>
                <div className="mt-2 flex items-center text-xs text-slate-600">
                  <Info size={14} className="mr-1" /> Valor tributável final
                </div>
              </CardContent>
            </Card>

            <Card className="bg-red-50 border-red-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-red-700">Imposto Estimado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{PriceFormater(data.metrics.estimatedTax)}</div>
                <div className="mt-2 flex items-center text-xs text-red-600">
                  <TrendingUp size={14} className="mr-1" /> Projeção baseada no regime
                </div>
              </CardContent>
            </Card>

            <Card className="bg-green-50 border-green-100 lg:col-span-1 md:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-700">Resultado Final</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-700">{PriceFormater(data.metrics.netAfterTax)}</div>
                <div className="mt-2 flex items-center text-xs text-green-600">
                  <DollarSign size={14} className="mr-1" /> Bruto - Comissões - Impostos
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Composição do Faturamento</CardTitle>
                <CardDescription>Onde seu imposto está sendo gerado</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: 'Bruto', valor: data.metrics.grossRevenue, fill: '#3b82f6' },
                      { name: 'Deduções', valor: data.metrics.totalCommissions, fill: '#f97316' },
                      { name: 'Tributável', valor: data.metrics.taxableRevenue, fill: '#64748b' },
                      { name: 'Imposto', valor: data.metrics.estimatedTax, fill: '#ef4444' },
                    ]}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(v) => `R$ ${v}`} />
                    <Tooltip
                      formatter={(v) => PriceFormater(v as number)}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                      {
                        [
                          { name: 'Bruto', fill: '#3b82f6' },
                          { name: 'Deduções', fill: '#f97316' },
                          { name: 'Tributável', fill: '#64748b' },
                          { name: 'Imposto', fill: '#ef4444' },
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dicas Fiscais</CardTitle>
                <CardDescription>Como otimizar a tributação da sua barbearia</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-md">
                  <p className="font-semibold text-blue-900 mb-1">Lei do Salão-Parceiro</p>
                  <p className="text-sm text-blue-800">
                    A maior vantagem fiscal para barbearias é a correta aplicação desta lei. Ao deduizir as comissões da base tributável, você pode reduzir sua carga de impostos em até 40%.
                  </p>
                </div>
                <div className="p-4 bg-green-50 border-l-4 border-green-500 rounded-r-md">
                  <p className="font-semibold text-green-900 mb-1">Simples Nacional (Anexo III)</p>
                  <p className="text-sm text-green-800">
                    Geralmente a melhor opção para barbearias após ultrapassar o limite do MEI. Verifique com seu contador a possibilidade de usar o "Fator R" para se manter em alíquotas reduzidas.
                  </p>
                </div>
                <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-md">
                  <p className="font-semibold text-amber-900 mb-1">NCM e CFOP</p>
                  <p className="text-sm text-amber-800">
                    Mantenha os códigos NCM e CFOP dos seus produtos atualizados para garantir que o imposto de venda de produtos (como pomadas e shampoos) seja calculado corretamente.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!data && !isLoading && (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg bg-muted/20">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Nenhuma dado disponível para este período.</p>
        </div>
      )}
    </div>
  );
}
