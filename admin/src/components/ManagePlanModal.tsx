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
import { Loader2 } from "lucide-react";


interface ManagePlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barbershopId: string;
  barbershopName: string;
  currentSubscription?: {
    _id: string;
    planName: string;
    monthlyPrice: number;
    startDate: string;
  } | null;
  onSuccess: () => void;
}

export function ManagePlanModal({
  open,
  onOpenChange,
  barbershopId,
  barbershopName,
  currentSubscription,
  onSuccess,
}: ManagePlanModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    planName: "",
    monthlyPrice: "",
    startDate: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    if (open) {
      if (currentSubscription) {
        // Formata data YYYY-MM-DD para o input HTML5
        const date = new Date(currentSubscription.startDate);
        const yyyy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(date.getUTCDate()).padStart(2, "0");

        setFormData({
          planName: currentSubscription.planName,
          monthlyPrice: currentSubscription.monthlyPrice.toString(),
          startDate: `${yyyy}-${mm}-${dd}`,
        });
      } else {
        setFormData({
          planName: "",
          monthlyPrice: "",
          startDate: new Date().toISOString().split("T")[0],
        });
      }
    }
  }, [open, currentSubscription]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const price = parseFloat(formData.monthlyPrice);
      if (isNaN(price) || price <= 0) {
        throw new Error("Valor mensal inválido");
      }

      if (currentSubscription) {
        // Atualizar assinatura existente
        await superAdminApiClient.put(
          `/api/superadmin/billing/subscriptions/${currentSubscription._id}`,
          {
            planName: formData.planName,
            monthlyPrice: price,
            startDate: formData.startDate,
          }
        );
      } else {
        // Criar nova assinatura
        await superAdminApiClient.post(
          `/api/superadmin/billing/subscriptions`,
          {
            barbershopId,
            customPlanName: formData.planName,
            monthlyPrice: price,
            startDate: formData.startDate,
          }
        );
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Erro ao salvar plano");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {currentSubscription ? "Editar Plano" : "Adicionar Plano"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {currentSubscription
              ? `Editar plano de ${barbershopName}`
              : `Adicionar plano para ${barbershopName}`
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-900/30 border border-red-600 text-red-400 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="planName" className="text-slate-300">
                Nome do Plano *
              </Label>
              <Input
                id="planName"
                value={formData.planName}
                onChange={(e) => handleChange("planName", e.target.value)}
                placeholder="Ex: Plano Premium"
                required
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="monthlyPrice" className="text-slate-300">
                Valor Mensal (R$) *
              </Label>
              <Input
                id="monthlyPrice"
                type="number"
                step="0.01"
                min="0"
                value={formData.monthlyPrice}
                onChange={(e) => handleChange("monthlyPrice", e.target.value)}
                placeholder="99.90"
                required
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-slate-300">
                Data de Início *
              </Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => handleChange("startDate", e.target.value)}
                required
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
