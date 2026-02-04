import { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config/BackendUrl";
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
  Calendar,
  RefreshCw,
  AlertCircle,
  Plus,
  Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface BarbershopSubscription {
  _id: string;
  barbershop: {
    _id: string;
    name: string;
    slug: string;
    accountStatus: string;
  };
  planName: string;
  monthlyPrice: number;
  startDate: string;
  nextBillingDate: string;
  status: string;
  paymentCount: number;
  paymentHistory: Array<{
    date: string;
    amount: number;
    status: string;
  }>;
}

interface BillingOverview {
  totalMonthlyRevenue: number;
  projectedAnnualRevenue: number;
  totalBilled: number;
  totalBarbershops: number;
  totalMonthlyExpenses: number;
  monthlyProfit: number;
  revenueByPlan: Record<string, { count: number; revenue: number }>;
  subscriptions: BarbershopSubscription[];
}

export function SuperAdminBillingPage() {
  const [data, setData] = useState<BillingOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { token } = useSuperAdminAuth();

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/superadmin/billing/overview`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Erro ao carregar dados");
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar dados");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      active: { label: "Ativo", className: "bg-green-600 hover:bg-green-600" },
      suspended: { label: "Suspenso", className: "bg-orange-600 hover:bg-orange-600" },
      cancelled: { label: "Cancelado", className: "bg-red-600 hover:bg-red-600" },
    };

    const config = statusMap[status] || { label: status, className: "bg-gray-600" };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400">Carregando dados...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-red-400">{error}</p>
        <Button onClick={fetchData} variant="outline">
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Faturamento</h1>
        <div className="flex gap-2">
          <Button
            onClick={() => {/* TODO: Abrir modal de nova assinatura */ }}
            variant="default"
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Assinatura
          </Button>
          <Button
            onClick={fetchData}
            variant="outline"
            size="sm"
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Receita Mensal
            </CardTitle>
            <DollarSign className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {formatCurrency(data?.totalMonthlyRevenue || 0)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {data?.totalBarbershops || 0} barbearias ativas
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Projeção Anual
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {formatCurrency(data?.projectedAnnualRevenue || 0)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Baseado na receita atual
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Barbearias Ativas
            </CardTitle>
            <Store className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {data?.totalBarbershops || 0}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Com assinatura ativa
            </p>
          </CardContent>
        </Card>

        <Card className={`bg-slate-800 border-slate-700 ${(data?.monthlyProfit || 0) >= 0 ? 'border-green-900/50' : 'border-red-900/50'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Valor Líquido
            </CardTitle>
            <TrendingUp className={`h-4 w-4 ${(data?.monthlyProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(data?.monthlyProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(data?.monthlyProfit || 0)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Receita - Despesas (Mês)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Total Faturado
            </CardTitle>
            <Wallet className="h-4 w-4 text-cyan-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {formatCurrency(data?.totalBilled || 0)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Desde o início das assinaturas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de assinaturas */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Assinaturas Ativas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-slate-700 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-slate-700/50">
                  <TableHead className="text-slate-400">Barbearia</TableHead>
                  <TableHead className="text-slate-400">Plano</TableHead>
                  <TableHead className="text-slate-400 text-right">Valor Mensal</TableHead>
                  <TableHead className="text-slate-400">Início</TableHead>
                  <TableHead className="text-slate-400 text-center">Status</TableHead>
                  <TableHead className="text-slate-400 text-center">Pagamentos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.subscriptions.map((sub) => (
                  <TableRow
                    key={sub._id}
                    className="border-slate-700 hover:bg-slate-700/50"
                  >
                    <TableCell className="font-medium text-white">
                      <div>
                        <div>{sub.barbershop.name}</div>
                        <div className="text-xs text-slate-500">/{sub.barbershop.slug}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-300">{sub.planName}</TableCell>
                    <TableCell className="text-right text-green-400 font-semibold">
                      {formatCurrency(sub.monthlyPrice)}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {formatDate(sub.startDate)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(sub.status)}
                    </TableCell>
                    <TableCell className="text-center text-slate-300">
                      {sub.paymentCount}
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.subscriptions || data.subscriptions.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                      Nenhuma assinatura encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
