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
  TrendingDown,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManageExpenseModal } from "@/components/ManageExpenseModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Expense {
  _id: string;
  name: string;
  description?: string;
  amount: number;
  type: "monthly" | "one-time";
  category: string;
  date?: string;
  startDate?: string;
  endDate?: string | null;
  isActive: boolean;
  notes?: string;
}

interface ExpensesOverview {
  nextMonthRevenue: number;
  nextMonthExpenses: number;
  projectedProfit: number;
  monthlyExpenses: number;
  oneTimeExpenses: number;
  totalExpenses: number;
  expenses: Expense[];
}

export function SuperAdminExpensesPage() {
  const [data, setData] = useState<ExpensesOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const { token } = useSuperAdminAuth();

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/superadmin/billing/expenses/overview`, {
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

  const handleCreate = () => {
    setSelectedExpense(null);
    setModalOpen(true);
  };

  const handleEdit = (expense: Expense) => {
    setSelectedExpense(expense);
    setModalOpen(true);
  };

  const handleDelete = async (expenseId: string) => {
    if (!window.confirm("Tem certeza que deseja deletar esta despesa?")) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/superadmin/billing/expenses/${expenseId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (!response.ok) throw new Error("Erro ao deletar despesa");
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

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

  const getTypeBadge = (type: string) => {
    const typeMap: Record<string, { label: string; className: string }> = {
      monthly: { label: "Mensal", className: "bg-blue-600 hover:bg-blue-600" },
      "one-time": { label: "Esporádico", className: "bg-purple-600 hover:bg-purple-600" },
    };

    const config = typeMap[type] || { label: type, className: "bg-gray-600" };
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

  const profitIsPositive = (data?.projectedProfit || 0) >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Despesas</h1>
        <div className="flex gap-2">
          <Button
            onClick={handleCreate}
            variant="default"
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Despesa
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
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Receita Próximo Mês
            </CardTitle>
            <DollarSign className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {formatCurrency(data?.nextMonthRevenue || 0)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Assinaturas ativas
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Despesas Próximo Mês
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {formatCurrency(data?.nextMonthExpenses || 0)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Gastos previstos
            </p>
          </CardContent>
        </Card>

        <Card className={`bg-slate-800 border-slate-700 ${profitIsPositive ? 'border-green-600' : 'border-red-600'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Lucro Projetado
            </CardTitle>
            <TrendingUp className={`h-4 w-4 ${profitIsPositive ? 'text-green-400' : 'text-red-400'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${profitIsPositive ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(data?.projectedProfit || 0)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Receita - Despesas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de despesas */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Todas as Despesas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-slate-700 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-slate-700/50">
                  <TableHead className="text-slate-400">Nome</TableHead>
                  <TableHead className="text-slate-400">Categoria</TableHead>
                  <TableHead className="text-slate-400 text-right">Valor</TableHead>
                  <TableHead className="text-slate-400 text-center">Tipo</TableHead>
                  <TableHead className="text-slate-400">Data/Período</TableHead>
                  <TableHead className="text-slate-400 text-center">Status</TableHead>
                  <TableHead className="text-slate-400 text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.expenses.map((expense) => (
                  <TableRow
                    key={expense._id}
                    className="border-slate-700 hover:bg-slate-700/50"
                  >
                    <TableCell className="font-medium text-white">
                      <div>
                        <div>{expense.name}</div>
                        {expense.description && (
                          <div className="text-xs text-slate-500">{expense.description}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-300">{expense.category}</TableCell>
                    <TableCell className="text-right text-red-400 font-semibold">
                      {formatCurrency(expense.amount)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getTypeBadge(expense.type)}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {expense.type === "one-time" && expense.date
                        ? formatDate(expense.date)
                        : expense.startDate
                          ? `Desde ${formatDate(expense.startDate)}`
                          : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={expense.isActive ? "bg-green-600 hover:bg-green-600" : "bg-gray-600 hover:bg-gray-600"}>
                        {expense.isActive ? "Ativo" : "Inativo"}
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
                          className="bg-slate-800 border-slate-700 text-white"
                        >
                          <DropdownMenuItem
                            onClick={() => handleEdit(expense)}
                            className="cursor-pointer hover:bg-slate-700 focus:bg-slate-700"
                          >
                            <Pencil className="w-4 h-4 mr-2 text-blue-400" />
                            Editar
                          </DropdownMenuItem>

                          <DropdownMenuSeparator className="bg-slate-700" />

                          <DropdownMenuItem
                            onClick={() => handleDelete(expense._id)}
                            className="cursor-pointer hover:bg-red-900/30 focus:bg-red-900/30 text-red-400"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Deletar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.expenses || data.expenses.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                      Nenhuma despesa cadastrada
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
        expense={selectedExpense}
        onSuccess={fetchData}
        token={token || ""}
      />
    </div>
  );
}
