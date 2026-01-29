import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import apiClient from "@/services/api";

// Imports de UI e Ícones
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/config/BackendUrl";

// --- Tipagens ---

// Interface para as configurações de recorrência
interface LoyaltyProgram {
  enabled: boolean;
  targetCount: number;
  rewardDescription: string;
}

// O que esperamos receber/enviar (pode conter outros dados da barbearia)
interface BarbershopData {
  // Outros campos podem existir aqui, mas só nos importamos com o loyaltyProgram
  loyaltyProgram?: LoyaltyProgram;
}

interface AdminOutletContext {
  barbershopId: string;
}

// Estado inicial padrão para o formulário
const initialLoyaltyState: LoyaltyProgram = {
  enabled: false,
  targetCount: 10,
  rewardDescription: "1 Corte Grátis",
};

// --- Componente Principal ---
export function RecurrencePage() {
  const { barbershopId } = useOutletContext<AdminOutletContext>();

  const [formData, setFormData] = useState<LoyaltyProgram>(initialLoyaltyState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carrega as configurações de fidelidade
  useEffect(() => {
    if (!barbershopId) return;

    const fetchSettings = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Busca os dados completos da barbearia
        const response = await apiClient.get<BarbershopData>(`${API_BASE_URL}/barbershops/${barbershopId}`);
        // Verifica se o programa de fidelidade já existe e o define no estado
        if (response.data.loyaltyProgram) {
          setFormData(response.data.loyaltyProgram);
        } else {
          setFormData(initialLoyaltyState); // Usa o padrão se não vier nada
        }
      } catch (err) {
        console.error("Erro ao buscar configurações:", err);
        setError("Falha ao carregar as configurações de fidelidade.");
        toast.error("Falha ao carregar as configurações.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [barbershopId]);

  // Handler genérico para mudanças no formulário
  const handleChange = (field: keyof LoyaltyProgram, value: string | number | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Salva as configurações
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    // Validação
    if (formData.enabled && formData.targetCount <= 0) {
      setError("O número de agendamentos deve ser pelo menos 1.");
      setIsSaving(false);
      return;
    }
    if (formData.enabled && !formData.rewardDescription.trim()) {
      setError("A descrição do prêmio é obrigatória.");
      setIsSaving(false);
      return;
    }

    try {
      // Enviamos o objeto 'loyaltyProgram' dentro da atualização da barbearia
      // A rota PUT /barbershops/:id deve aceitar este objeto
      await apiClient.put(`${API_BASE_URL}/barbershops/${barbershopId}`, {
        loyaltyProgram: formData,
      });
      toast.success("Programa de Fidelidade salvo com sucesso!");
    } catch (err: any) {
      console.error("Erro ao salvar configurações:", err);
      setError(err.response?.data?.error || "Falha ao salvar as configurações.");
      toast.error("Falha ao salvar as configurações.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="gap-0">
        <CardTitle className="mb-2">
          {/* <Star className="h-5 w-5" /> */}
          Programa de Fidelidade
        </CardTitle>
        <CardDescription className="">
          Configure o programa de fidelidade para recompensar seus clientes. A cada agendamento "Concluído", o cliente ganha um ponto.
        </CardDescription>
        <CardDescription>
          Assim que o cliente completar a fidelitade, recebera uma notificação no WhatsApp informando que recebeu o bônus.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
            <div className="space-y-0.5">
              <Label htmlFor="loyalty-enabled" className="text-base font-medium">
                Ativar Programa de Fidelidade
              </Label>
              <p className="text-xs text-muted-foreground">Permitir que clientes acumulem agendamentos para ganhar recompensas.</p>
            </div>
            <Switch id="loyalty-enabled" checked={formData.enabled} onCheckedChange={(checked) => handleChange("enabled", checked)} />
          </div>

          {formData.enabled && (
            <div className="space-y-4 pt-4 border-t">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="loyalty-target">Nº de Agendamentos para o Prêmio</Label>
                  <Input
                    id="loyalty-target"
                    name="targetCount"
                    type="number"
                    min="1"
                    value={formData.targetCount}
                    onChange={(e) => handleChange("targetCount", parseInt(e.target.value) || 1)}
                    placeholder="Ex: 10"
                  />
                  <p className="text-xs text-muted-foreground">Nº de agendamentos "Concluídos" para ganhar.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loyalty-reward">Descrição do Prêmio</Label>
                  <Input
                    id="loyalty-reward"
                    name="rewardDescription"
                    type="text"
                    value={formData.rewardDescription}
                    onChange={(e) => handleChange("rewardDescription", e.target.value)}
                    placeholder="Ex: 1 Corte Grátis"
                  />
                  <p className="text-xs text-muted-foreground">O que o cliente ganhará.</p>
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>

        <CardFooter className="justify-end pt-6">
          <Button type="submit" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Configurações
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
