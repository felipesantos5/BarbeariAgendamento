import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import apiClient from "@/services/api";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";

// Imports de UI e Ícones
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle, Edit, Trash2, Loader2, DollarSign, TrendingDown } from "lucide-react";
import { PriceFormater } from "@/helper/priceFormater";

// Tipagem para um Custo Operacional
interface OperationalCost {
  _id: string;
  type: string;
  description: string;
  amount: number;
  date: string;
  isRecurring: boolean;
  notes?: string;
}

interface AdminOutletContext {
  barbershopId: string;
}

// Tipos de custos disponíveis
const costTypes = [
  { value: "rent", label: "Aluguel" },
  { value: "electricity", label: "Luz/Energia" },
  { value: "water", label: "Água" },
  { value: "internet", label: "Internet" },
  { value: "materials", label: "Materiais" },
  { value: "maintenance", label: "Manutenção" },
  { value: "marketing", label: "Marketing" },
  { value: "salary", label: "Salários" },
  { value: "bonus", label: "Bônus/Extras" },
  { value: "taxes", label: "Impostos" },
  { value: "insurance", label: "Seguro" },
  { value: "equipment", label: "Equipamentos" },
  { value: "other", label: "Outros" },
];

const initialCostState: Omit<OperationalCost, "_id"> = {
  type: "other",
  description: "",
  amount: 0,
  date: new Date().toISOString().split("T")[0],
  isRecurring: false,
  notes: "",
};

export function OperationalCostsPage() {
  const { barbershopId } = useOutletContext<AdminOutletContext>();

  // Estados da página
  const [costs, setCosts] = useState<OperationalCost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados para o modal de edição/criação
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentCost, setCurrentCost] = useState<Partial<OperationalCost>>(initialCostState);

  // Filtros
  const [selectedType, setSelectedType] = useState<string>("all");
  const currentYear = new Date().getFullYear();
  const currentMonth = (new Date().getMonth() + 1).toString();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);

  // Função para buscar os custos da API
  const fetchCosts = async () => {
    try {
      setIsLoading(true);

      let startDate: Date;
      let endDate: Date;

      // "Todos os Anos" selecionado
      if (selectedYear === "all") {
        const currentDate = new Date();
        startDate = new Date(currentDate.getFullYear() - 10, 0, 1); // Últimos 10 anos
        endDate = new Date(currentDate.getFullYear(), 11, 31);
      }
      // "Ano Completo" selecionado
      else if (selectedMonth === "0") {
        const year = parseInt(selectedYear);
        startDate = startOfYear(new Date(year, 0));
        endDate = endOfYear(new Date(year, 0));
      }
      // Mês específico selecionado
      else {
        const year = parseInt(selectedYear);
        const month = parseInt(selectedMonth) - 1; // JavaScript months are 0-indexed
        startDate = startOfMonth(new Date(year, month));
        endDate = endOfMonth(new Date(year, month));
      }

      const params: any = {
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
      };

      if (selectedType !== "all") {
        params.type = selectedType;
      }

      const response = await apiClient.get(`/api/barbershops/${barbershopId}/admin/operational-costs`, { params });
      setCosts(response.data);
    } catch (error) {
      toast.error("Erro ao carregar os custos operacionais.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (barbershopId) {
      fetchCosts();
    }
  }, [barbershopId, selectedType, selectedYear, selectedMonth]);

  // Funções para abrir os modais
  const handleOpenNewCostDialog = () => {
    setCurrentCost(initialCostState);
    setIsDialogOpen(true);
  };

  const handleOpenEditCostDialog = (cost: OperationalCost) => {
    setCurrentCost({
      ...cost,
      date: new Date(cost.date).toISOString().split("T")[0],
    });
    setIsDialogOpen(true);
  };

  // Função para salvar (criar ou editar)
  const handleSaveCost = async () => {
    setIsSubmitting(true);
    const { _id, ...costData } = currentCost;

    // Validação
    if (!currentCost.description || !currentCost.amount || !currentCost.date) {
      toast.error("Descrição, valor e data são obrigatórios.");
      setIsSubmitting(false);
      return;
    }

    try {
      if (_id) {
        await apiClient.put(`/api/barbershops/${barbershopId}/admin/operational-costs/${_id}`, costData);
        toast.success("Custo atualizado com sucesso!");
      } else {
        await apiClient.post(`/api/barbershops/${barbershopId}/admin/operational-costs`, costData);
        toast.success("Custo criado com sucesso!");
      }
      setIsDialogOpen(false);
      fetchCosts();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Falha ao salvar o custo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Função para deletar
  const handleDeleteCost = async (costId: string) => {
    setIsSubmitting(true);
    try {
      await apiClient.delete(`/api/barbershops/${barbershopId}/admin/operational-costs/${costId}`);
      toast.success("Custo deletado com sucesso!");
      fetchCosts();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Falha ao deletar o custo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calcular total de custos
  const totalCosts = costs.reduce((sum, cost) => sum + cost.amount, 0);

  // Obter label do tipo
  const getTypeLabel = (type: string) => {
    return costTypes.find((t) => t.value === type)?.label || type;
  };

  // Opções de mês e ano
  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  const availableYears = Array.from({ length: 5 }, (_, i) => (currentYear - 2 + i).toString());

  // Função para formatar o período exibido
  const formatPeriodDisplay = (): string => {
    if (selectedYear === "all") {
      return "Todos os Anos";
    }
    if (selectedMonth === "0") {
      return `Ano Completo de ${selectedYear}`;
    }
    return `${monthNames[parseInt(selectedMonth) - 1]} de ${selectedYear}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold">Custos Operacionais</h1>
        <div className="flex flex-wrap gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[150px]">
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
            <SelectTrigger className="w-[120px]">
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
          <Button onClick={handleOpenNewCostDialog}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Adicionar Custo
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Custos</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{PriceFormater(totalCosts)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatPeriodDisplay()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Registros</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{costs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Custos no período
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Custos Cadastrados</CardTitle>
              <CardDescription>
                {formatPeriodDisplay()}
                {selectedType !== "all" && ` - ${getTypeLabel(selectedType)}`}
              </CardDescription>
            </div>
            <div className="w-full sm:w-[200px]">
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {costTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-center">Recorrente</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-[100px] text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : costs.length > 0 ? (
                costs.map((cost) => (
                  <TableRow key={cost._id}>
                    <TableCell className="font-medium">
                      {format(new Date(cost.date), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {getTypeLabel(cost.type)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{cost.description}</TableCell>
                    <TableCell className="text-center">
                      {cost.isRecurring ? (
                        <span className="text-blue-600 text-xs">Sim</span>
                      ) : (
                        <span className="text-gray-400 text-xs">Não</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-red-600">{PriceFormater(cost.amount)}</TableCell>
                    <TableCell className="flex justify-center gap-2">
                      <Button variant="outline" size="icon" onClick={() => handleOpenEditCostDialog(cost)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="icon">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita e irá remover o custo permanentemente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteCost(cost._id)}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Sim, Deletar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    Nenhum custo cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de Criar/Editar Custo */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{currentCost._id ? "Editar Custo" : "Criar Novo Custo"}</DialogTitle>
            <DialogDescription>Preencha os detalhes do custo operacional abaixo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="costType">Tipo de Custo</Label>
                <Select
                  value={currentCost.type}
                  onValueChange={(value) => setCurrentCost({ ...currentCost, type: value })}
                >
                  <SelectTrigger id="costType">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {costTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="costDate">Data</Label>
                <Input
                  id="costDate"
                  type="date"
                  value={currentCost.date}
                  onChange={(e) => setCurrentCost({ ...currentCost, date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="costDescription">Descrição</Label>
              <Input
                id="costDescription"
                placeholder="Ex: Aluguel de Janeiro de 2024"
                value={currentCost.description}
                onChange={(e) => setCurrentCost({ ...currentCost, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="costAmount">Valor (R$)</Label>
              <Input
                id="costAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={currentCost.amount}
                onChange={(e) =>
                  setCurrentCost({
                    ...currentCost,
                    amount: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="costNotes">Observações (Opcional)</Label>
              <Textarea
                id="costNotes"
                placeholder="Adicione observações adicionais sobre este custo..."
                value={currentCost.notes}
                onChange={(e) => setCurrentCost({ ...currentCost, notes: e.target.value })}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isRecurring"
                checked={currentCost.isRecurring || false}
                onCheckedChange={(checked) =>
                  setCurrentCost({
                    ...currentCost,
                    isRecurring: checked as boolean,
                  })
                }
              />
              <label
                htmlFor="isRecurring"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Este é um custo recorrente (mensal)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCost} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Custo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
