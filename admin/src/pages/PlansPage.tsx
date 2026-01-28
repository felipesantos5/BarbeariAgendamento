import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import apiClient from "@/services/api";

// Imports de UI e Ícones
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle, Edit, Trash2, Loader2 } from "lucide-react";
import { PriceFormater } from "@/helper/priceFormater";

// Tipagem para um Plano
interface Plan {
  _id: string;
  name: string;
  description?: string;
  price: number;
  durationInDays: number;
  totalCredits: number;
  useBarberCommission?: boolean;
  commissionRate?: number;
}

interface AdminOutletContext {
  barbershopId: string;
}

const initialPlanState: Omit<Plan, "_id"> = {
  name: "",
  description: "",
  price: 0,
  durationInDays: 30,
  totalCredits: 1,
  useBarberCommission: false,
  commissionRate: 0,
};

export function PlansPage() {
  const { barbershopId } = useOutletContext<AdminOutletContext>();

  // Estados da página
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados para o modal de edição/criação
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<Partial<Plan>>(initialPlanState);

  // Função para buscar os planos da API
  const fetchPlans = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get(`/api/barbershops/${barbershopId}/plans`);
      setPlans(response.data);
    } catch (error) {
      toast.error("Erro ao carregar os planos.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (barbershopId) {
      fetchPlans();
    }
  }, [barbershopId]);

  // Funções para abrir os modais
  const handleOpenNewPlanDialog = () => {
    setCurrentPlan(initialPlanState);
    setIsDialogOpen(true);
  };

  const handleOpenEditPlanDialog = (plan: Plan) => {
    // Garante que planos antigos sem os campos de comissão tenham valores padrão
    setCurrentPlan({
      ...plan,
      useBarberCommission: plan.useBarberCommission ?? false,
      commissionRate: plan.commissionRate ?? 0,
    });
    setIsDialogOpen(true);
  };

  // Função para salvar (criar ou editar)
  // Nenhuma mudança necessária aqui, pois o payload já pega o estado atualizado
  const handleSavePlan = async () => {
    setIsSubmitting(true);
    const { _id, ...planData } = currentPlan;

    // Validação simples
    if (Number(currentPlan.totalCredits) <= 0) {
      toast.error("A quantidade de créditos deve ser pelo menos 1.");
      setIsSubmitting(false);
      return;
    }

    try {
      if (_id) {
        // Atualizar plano existente
        await apiClient.put(`/api/barbershops/${barbershopId}/plans/${_id}`, planData);
        toast.success("Plano atualizado com sucesso!");
      } else {
        // Criar novo plano
        await apiClient.post(`/api/barbershops/${barbershopId}/plans`, planData);
        toast.success("Plano criado com sucesso!");
      }
      setIsDialogOpen(false);
      fetchPlans(); // Recarrega a lista
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Falha ao salvar o plano.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Função para deletar
  const handleDeletePlan = async (planId: string) => {
    setIsSubmitting(true);
    try {
      await apiClient.delete(`/api/barbershops/${barbershopId}/plans/${planId}`);
      toast.success("Plano deletado com sucesso!");
      fetchPlans(); // Recarrega a lista
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Falha ao deletar o plano.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle>Gerenciar Planos</CardTitle>
          {/* <CardDescription>Visualize, edite ou remova os planos oferecidos pela sua barbearia.</CardDescription> */}
          <Button onClick={handleOpenNewPlanDialog} className="max-w-xs">
            <PlusCircle className="mr-2 h-4 w-4" />
            Adicionar Plano
          </Button>
        </CardHeader>
        <CardContent>
          {/* TABELA ATUALIZADA */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome do Plano</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-center">Créditos</TableHead>
                <TableHead className="text-center">Comissão</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="w-[100px] text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    {" "}
                    {/* ColSpan 6 */}
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : plans.length > 0 ? (
                plans.map((plan) => (
                  <TableRow key={plan._id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell className="text-muted-foreground">{plan.description}</TableCell>
                    <TableCell className="text-center">{plan.totalCredits}</TableCell>
                    <TableCell className="text-center">
                      {plan.useBarberCommission ? (
                        <span className="text-muted-foreground text-xs">Padrão Barbeiro</span>
                      ) : plan.commissionRate && plan.commissionRate > 0 ? (
                        `${plan.commissionRate}%`
                      ) : (
                        <span className="text-red-600 text-xs">Sem comissão</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{PriceFormater(plan.price)}</TableCell>
                    <TableCell className="flex justify-center gap-2">
                      <Button variant="outline" size="icon" onClick={() => handleOpenEditPlanDialog(plan)}>
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
                            <AlertDialogDescription>Esta ação não pode ser desfeita e irá remover o plano permanentemente.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeletePlan(plan._id)} className="bg-destructive hover:bg-destructive/90">
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
                    {" "}
                    {/* ColSpan 6 */}
                    Nenhum plano cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de Criar/Editar Plano (ATUALIZADO) */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{currentPlan._id ? "Editar Plano" : "Criar Novo Plano"}</DialogTitle>
            <DialogDescription>Preencha os detalhes do plano abaixo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="planName">Nome do Plano</Label>
              <Input id="planName" value={currentPlan.name} onChange={(e) => setCurrentPlan({ ...currentPlan, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="planDescription">Descrição (Opcional)</Label>
              <Textarea
                id="planDescription"
                value={currentPlan.description}
                onChange={(e) =>
                  setCurrentPlan({
                    ...currentPlan,
                    description: e.target.value,
                  })
                }
              />
            </div>
            {/* GRID ATUALIZADA PARA 3 COLUNAS */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="planPrice">Preço (R$)</Label>
                <Input
                  id="planPrice"
                  type="number"
                  value={currentPlan.price}
                  onChange={(e) =>
                    setCurrentPlan({
                      ...currentPlan,
                      price: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="planDuration">Duração (dias)</Label>
                <Input
                  id="planDuration"
                  type="number"
                  value={currentPlan.durationInDays}
                  onChange={(e) =>
                    setCurrentPlan({
                      ...currentPlan,
                      durationInDays: parseInt(e.target.value) || 0,
                    })
                  }
                  placeholder="Ex: 30"
                />
              </div>
              {/* NOVO CAMPO DE CRÉDITOS */}
              <div className="space-y-2">
                <Label htmlFor="planCredits">Créditos</Label>
                <Input
                  id="planCredits"
                  type="number"
                  value={currentPlan.totalCredits}
                  onChange={(e) =>
                    setCurrentPlan({
                      ...currentPlan,
                      totalCredits: parseInt(e.target.value) || 0,
                    })
                  }
                  placeholder="Ex: 4"
                />
              </div>
            </div>

            {/* Configuração de Comissão */}
            <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
              <Label className="text-base font-semibold">Comissão do Plano</Label>

              {/* Checkbox: Usar comissão padrão do barbeiro */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="useBarberCommission"
                  checked={currentPlan.useBarberCommission || false}
                  onCheckedChange={(checked) =>
                    setCurrentPlan({
                      ...currentPlan,
                      useBarberCommission: checked as boolean,
                    })
                  }
                />
                <label
                  htmlFor="useBarberCommission"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Usar comissão padrão do barbeiro
                </label>
              </div>

              {/* Input de comissão customizada (aparece apenas se checkbox desmarcado) */}
              {!currentPlan.useBarberCommission && (
                <div className="space-y-2 pl-6 border-l-2 border-primary/30">
                  <Label htmlFor="planCommission" className="text-sm">
                    Comissão Customizada (%)
                  </Label>
                  <Input
                    id="planCommission"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={currentPlan.commissionRate ?? 0}
                    onChange={(e) =>
                      setCurrentPlan({
                        ...currentPlan,
                        commissionRate: e.target.value ? parseFloat(e.target.value) : 0,
                      })
                    }
                    placeholder="0 = sem comissão"
                  />
                  <p className="text-xs text-muted-foreground">
                    Se 0, o barbeiro não receberá comissão neste plano
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePlan} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Plano
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
