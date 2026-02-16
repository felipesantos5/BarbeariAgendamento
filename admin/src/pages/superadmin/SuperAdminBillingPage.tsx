import { useState, useEffect } from "react";
import superAdminApiClient from "@/services/superAdminApi";
import { useSuperAdminAuth } from "@/contexts/SuperAdminAuthContext";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  TrendingUp,
  Store,
  RefreshCw,
  AlertCircle,
  Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface BarbershopSubscription {
  _id: string;
  barbershop: {
    _id: string;
    name: string;
    slug: string;
  };
  planName: string;
  monthlyPrice: number;
  startDate: string;
  status: "active" | "suspended" | "cancelled";
  paymentCount: number;
}

interface BillingOverview {
  totalMonthlyRevenue: number;
  projectedAnnualRevenue: number;
  totalBilled: number;
  totalNetValue: number;
  totalBarbershops: number;
  totalMonthlyExpenses: number;
  monthlyProfit: number;
  subscriptions: BarbershopSubscription[];
}


export function SuperAdminBillingPage() {
  const today = new Date();
  const [data, setData] = useState<BillingOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ month: number | 'all'; year: number }>({
    month: today.getMonth(),
    year: today.getFullYear(),
  });
  const { token } = useSuperAdminAuth();

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter.month !== 'all') {
        params.append('month', filter.month.toString());
        params.append('year', filter.year.toString());
      }

      const queryString = params.toString();
      const url = `/api/superadmin/billing/overview${queryString ? `?${queryString}` : ""}`;

      const response = await superAdminApiClient.get(url);
      setData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Erro ao carregar dados");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, filter]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <div className="text-slate-400 font-medium">Carregando faturamento...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Faturamento</h1>
          <p className="text-slate-400 text-sm">Controle financeiro da plataforma</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-800 border border-slate-700 p-1 px-2 rounded-lg gap-2">
            <select
              value={filter.month}
              onChange={(e) => setFilter(prev => ({ ...prev, month: e.target.value === 'all' ? 'all' : parseInt(e.target.value) }))}
              className="bg-transparent text-slate-200 text-xs font-semibold outline-none cursor-pointer focus:text-white"
            >
              <option value="all" className="bg-slate-900">Tempo Completo</option>
              {months.map((m, i) => (
                <option key={m} value={i} className="bg-slate-900">{m}</option>
              ))}
            </select>

            <div className="w-px h-3 bg-slate-700" />

            <select
              value={filter.year}
              onChange={(e) => setFilter(prev => ({ ...prev, year: parseInt(e.target.value) }))}
              className="bg-transparent text-slate-200 text-xs font-semibold outline-none cursor-pointer focus:text-white"
              disabled={filter.month === 'all'}
            >
              {years.map(y => (
                <option key={y} value={y} className="bg-slate-900">{y}</option>
              ))}
            </select>
          </div>

          <Button
            onClick={fetchData}
            variant="outline"
            size="sm"
            className="bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-5">
        <Card className="bg-slate-900/40 border-slate-800/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {filter.month === 'all' ? 'Média Mensal' : 'Receita Mês'}
            </CardTitle>
            <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-slate-100 italic">
              {formatCurrency(data?.totalMonthlyRevenue || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Faturado
            </CardTitle>
            <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400">
              <Wallet className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-slate-100">
              {formatCurrency(data?.totalBilled || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Valor Líquido
            </CardTitle>
            <div className={`p-1.5 rounded-md ${(data?.totalNetValue || 0) >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
              <TrendingUp className={`h-4 w-4 ${(data?.totalNetValue || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${(data?.totalNetValue || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatCurrency(data?.totalNetValue || 0)}
            </div>
          </CardContent>
        </Card>


        <Card className="bg-slate-900/40 border-slate-800/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Anual Projetado
            </CardTitle>
            <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-slate-100 uppercase">
              {formatCurrency(data?.projectedAnnualRevenue || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Assinaturas
            </CardTitle>
            <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-400">
              <Store className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-slate-100">
              {data?.totalBarbershops || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-lg">Assinaturas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-slate-700 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-slate-700/50">
                  <TableHead className="text-slate-400">Barbearia</TableHead>
                  <TableHead className="text-slate-400">Plano</TableHead>
                  <TableHead className="text-slate-400 text-center">Valor Mensal</TableHead>
                  <TableHead className="text-slate-400">Data Inicial</TableHead>
                  <TableHead className="text-slate-400 text-center">Status</TableHead>
                  <TableHead className="text-slate-400 text-center">Ciclos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.subscriptions.map((sub) => (
                  <TableRow
                    key={sub._id}
                    className="border-slate-700 hover:bg-slate-700/50 transition-colors"
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-slate-200 font-medium">{sub.barbershop.name}</span>
                        <span className="text-[10px] text-slate-500">/{sub.barbershop.slug}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-300">{sub.planName}</TableCell>
                    <TableCell className="text-center font-bold text-emerald-400 font-mono">
                      {formatCurrency(sub.monthlyPrice)}
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {new Date(sub.startDate).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase border-none ${sub.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                        {sub.status === 'active' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-slate-300 font-bold bg-slate-900/50 px-2 py-0.5 rounded text-xs">
                        {sub.paymentCount}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.subscriptions || data.subscriptions.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                      Nenhuma assinatura encontrada no período
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="fixed bottom-6 right-6">
          <div className="bg-rose-500 text-white px-4 py-2 rounded-lg shadow-xl flex items-center gap-2 border border-rose-400">
            <AlertCircle className="w-4 h-4" />
            <p className="text-sm font-bold">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
