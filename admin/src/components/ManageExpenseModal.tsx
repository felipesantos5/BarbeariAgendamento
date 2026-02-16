import { useState, useEffect } from "react";
import superAdminApiClient from "@/services/superAdminApi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";


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

interface ManageExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
  onSuccess: () => void;
}

export function ManageExpenseModal({
  open,
  onOpenChange,
  expense,
  onSuccess,
}: ManageExpenseModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    amount: "",
    type: "monthly" as "monthly" | "one-time",
    category: "Geral",
    date: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    notes: "",
  });

  useEffect(() => {
    if (expense) {
      setFormData({
        name: expense.name,
        description: expense.description || "",
        amount: expense.amount.toString(),
        type: expense.type,
        category: expense.category,
        date: expense.date ? new Date(expense.date).toISOString().split("T")[0] : "",
        startDate: expense.startDate ? new Date(expense.startDate).toISOString().split("T")[0] : "",
        endDate: expense.endDate ? new Date(expense.endDate).toISOString().split("T")[0] : "",
        notes: expense.notes || "",
      });
    } else {
      setFormData({
        name: "",
        description: "",
        amount: "",
        type: "monthly",
        category: "Geral",
        date: "",
        startDate: new Date().toISOString().split("T")[0],
        endDate: "",
        notes: "",
      });
    }
  }, [expense, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Valor inválido");
      }

      const body: any = {
        name: formData.name,
        description: formData.description,
        amount,
        type: formData.type,
        category: formData.category,
        notes: formData.notes,
      };

      if (formData.type === "one-time") {
        body.date = formData.date;
      } else {
        body.startDate = formData.startDate;
        if (formData.endDate) body.endDate = formData.endDate;
      }

      const url = expense
        ? `/api/superadmin/billing/expenses/${expense._id}`
        : `/api/superadmin/billing/expenses`;

      if (expense) {
        await superAdminApiClient.put(url, body);
      } else {
        await superAdminApiClient.post(url, body);
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Erro ao salvar despesa");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {expense ? "Editar Despesa" : "Nova Despesa"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Preencha os dados da despesa abaixo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-900/30 border border-red-600 text-red-400 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="name" className="text-slate-300">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="Ex: Aluguel do Servidor"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount" className="text-slate-300">Valor (R$) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type" className="text-slate-300">Tipo *</Label>
              <Select
                value={formData.type}
                onValueChange={(value: "monthly" | "one-time") =>
                  setFormData({ ...formData, type: value })
                }
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600 text-white">
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="one-time">Esporádico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.type === "one-time" ? (
              <div className="col-span-2 space-y-2">
                <Label htmlFor="date" className="text-slate-300">Data *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="startDate" className="text-slate-300">Início *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    required
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate" className="text-slate-300">Término (Opcional)</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
              </>
            )}

            <div className="col-span-2 space-y-2">
              <Label htmlFor="category" className="text-slate-300">Categoria</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="Ex: Infraestrutura"
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="notes" className="text-slate-300">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="Detalhes adicionais..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-slate-300"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
