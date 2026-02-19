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
  TrendingDown,
  RefreshCw,
  Plus,
  MoreVertical,
  Trash2,
  Pencil
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ManageExpenseModal } from "@/components/ManageExpenseModal";

interface Expense {
  _id: string;
  name: string;
  amount: number;
  category: string;
  type: "monthly" | "one-time";
  description?: string;
  createdAt: string;
  date?: string;
  startDate?: string;
  endDate?: string | null;
  isActive: boolean;
  notes?: string;
}

interface ExpensesOverview {
  expenses: Expense[];
  nextMonthRevenue: number;
  nextMonthExpenses: number;
  projectedProfit: number;
}

export function SuperAdminExpensesPage() {
  const today = new Date();
  const [data, setData] = useState<ExpensesOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<{ month: number; year: number }>({
    month: today.getMonth(),
    year: today.getFullYear(),
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const { token } = useSuperAdminAuth();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const response = await superAdminApiClient.get(
        `/api/superadmin/billing/expenses/overview?month=${filter.month}&year=${filter.year}`
      );
      setData(response.data);
    } catch (err) {
      console.error(err);
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

  const handleCreate = () => {
    setSelectedExpense(null);
    // Pequeno atraso para consistência com handleEdit e evitar conflitos de foco
    setTimeout(() => {
      setModalOpen(true);
    }, 100);
  };

  const handleEdit = (expense: Expense) => {
    setSelectedExpense(expense);
    // Pequeno atraso para fechar o dropdown antes de abrir o modal
    setTimeout(() => {
      setModalOpen(true);
    }, 100);
  };

  const handleDelete = async (id: string) => {
    // Pequeno atraso para garantir que o dropdown fechou antes do confirm() do browser
    await new Promise(resolve => setTimeout(resolve, 100));
    if (!confirm("Tem certeza que deseja excluir esta despesa?")) return;
    try {
      await superAdminApiClient.delete(`/api/superadmin/billing/expenses/${id}`);
      fetchData();
    } catch (err) {
      console.error(err);
    }
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
          <div className="text-slate-400 font-medium">Carregando despesas...</div>
        </div>
      </div>
    );
  }

  const profitIsPositive = (data?.projectedProfit || 0) >= 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Despesas</h1>
          <p className="text-slate-400 text-sm">Gerenciamento de custos operacionais</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex flex-1 items-center bg-slate-800 border border-slate-700 p-1 px-2 rounded-lg gap-2 min-w-0">
            <select
              value={filter.month}
              onChange={(e) => setFilter(prev => ({ ...prev, month: parseInt(e.target.value) }))}
              className="flex-1 bg-transparent text-slate-200 text-xs font-semibold outline-none cursor-pointer focus:text-white min-w-0"
            >
              {months.map((m, i) => (
                <option key={m} value={i} className="bg-slate-900">{m}</option>
              ))}
            </select>

            <div className="w-px h-3 bg-slate-700 shrink-0" />

            <select
              value={filter.year}
              onChange={(e) => setFilter(prev => ({ ...prev, year: parseInt(e.target.value) }))}
              className="bg-transparent text-slate-200 text-xs font-semibold outline-none cursor-pointer focus:text-white shrink-0"
            >
              {years.map(y => (
                <option key={y} value={y} className="bg-slate-900">{y}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              onClick={handleCreate}
              variant="default"
              size="sm"
              className="flex-1 sm:flex-none bg-blue-500 hover:bg-blue-600 text-white font-bold"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Despesa
            </Button>

            <Button
              onClick={fetchData}
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-slate-900/40 border-slate-800/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Receita Período
            </CardTitle>
            <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-slate-100 italic">
              {formatCurrency(data?.nextMonthRevenue || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Despesas Período
            </CardTitle>
            <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-400">
              <TrendingDown className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-slate-100">
              {formatCurrency(data?.nextMonthExpenses || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Lucro Estimado
            </CardTitle>
            <div className={`p-1.5 rounded-md ${profitIsPositive ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
              <TrendingUp className={`h-4 w-4 ${profitIsPositive ? 'text-emerald-400' : 'text-rose-400'}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${profitIsPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatCurrency(data?.projectedProfit || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de despesas */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-lg">Lançamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-slate-700 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-slate-700/50">
                  <TableHead className="text-slate-400">Nome</TableHead>
                  <TableHead className="text-slate-400">Categoria</TableHead>
                  <TableHead className="text-slate-400 text-right px-6">Valor</TableHead>
                  <TableHead className="text-slate-400 text-center">Tipo</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-400 text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.expenses.map((expense) => (
                  <TableRow
                    key={expense._id}
                    className={`border-slate-700 hover:bg-slate-700/50 transition-colors ${(expense as any).isActiveInPeriod ? '' : 'opacity-40'}`}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-slate-200 font-medium">{expense.name}</span>
                        {expense.description && (
                          <span className="text-[10px] text-slate-500 max-w-[200px] truncate">{expense.description}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-slate-900 border-slate-700 text-slate-400 text-[10px] px-2 py-0">
                        {expense.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right px-6 font-bold text-rose-400 font-mono">
                      {formatCurrency(expense.amount)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className={`mx-auto w-2 h-2 rounded-full ${expense.type === 'monthly' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                    </TableCell>
                    <TableCell>
                      <Badge className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase border-none ${(expense as any).isActiveInPeriod ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800/50 text-slate-500'}`}>
                        {(expense as any).isActiveInPeriod ? 'Incidente' : 'Ignorado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-white hover:bg-slate-700"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-slate-800 border-slate-700 text-white min-w-[140px]"
                        >
                          <DropdownMenuItem
                            onClick={() => handleEdit(expense)}
                            className="cursor-pointer hover:bg-slate-700 focus:bg-slate-700 gap-2"
                          >
                            <Pencil className="w-4 h-4 text-blue-400" />
                            <span className="text-xs">Editar</span>
                          </DropdownMenuItem>

                          <DropdownMenuSeparator className="bg-slate-700" />

                          <DropdownMenuItem
                            onClick={() => handleDelete(expense._id)}
                            className="cursor-pointer hover:bg-red-900/10 focus:bg-red-900/10 text-red-500 gap-2 font-bold"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span className="text-xs">Excluir</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.expenses || data.expenses.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                      Nenhuma despesa registrada para o período
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ManageExpenseModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        expense={selectedExpense as any}
        onSuccess={fetchData}
      />
    </div>
  );
}
