import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import apiClient from "@/services/api";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Edit, Trash2, Loader2, HelpCircle, CreditCard, Users, TrendingUp } from "lucide-react";
import { PriceFormater } from "@/helper/priceFormater";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

// Tipagem para Assinatura
interface Subscription {
  _id: string;
  customer: {
    _id: string;
    name: string;
    phone: string;
  };
  plan: {
    _id: string;
    name: string;
    price: number;
    totalCredits: number;
  };
  status: "pending" | "active" | "expired" | "canceled";
  creditsRemaining: number;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  mercadoPagoPreapprovalId?: string;
  createdAt: string;
  usedCredits?: number;
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

  // Estados para assinaturas
  const [activeTab, setActiveTab] = useState("planos");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(false);
  const [subscriptionFilter, setSubscriptionFilter] = useState<"active" | "all" | "expired">("active");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados para o modal de edição/criação
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<Partial<Plan>>(initialPlanState);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);

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

  // Função para buscar as assinaturas
  const fetchSubscriptions = async () => {
    try {
      setIsLoadingSubscriptions(true);
      const response = await apiClient.get(`/api/barbershops/${barbershopId}/subscriptions`);
      setSubscriptions(response.data);
    } catch (error) {
      toast.error("Erro ao carregar assinaturas.");
    } finally {
      setIsLoadingSubscriptions(false);
    }
  };

  useEffect(() => {
    if (barbershopId) {
      fetchPlans();
    }
  }, [barbershopId]);

  // Buscar assinaturas quando trocar para aba de assinaturas
  useEffect(() => {
    if (barbershopId && activeTab === "assinaturas") {
      fetchSubscriptions();
    }
  }, [barbershopId, activeTab]);

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

  // Filtrar assinaturas baseado no filtro selecionado
  const filteredSubscriptions = subscriptions.filter((sub) => {
    if (subscriptionFilter === "active") return sub.status === "active";
    if (subscriptionFilter === "expired") return sub.creditsRemaining === 0 || sub.status === "expired";
    return true; // "all"
  });

  // Calcular créditos usados
  const getUsedCredits = (subscription: Subscription) => {
    return subscription.plan.totalCredits - subscription.creditsRemaining;
  };

  // Função para obter cor do badge de status
  const getStatusBadge = (status: string, creditsRemaining: number) => {
    if (status === "active" && creditsRemaining > 0) {
      return <Badge className="bg-green-100 text-green-800 border-green-300">Ativo</Badge>;
    }
    if (creditsRemaining === 0 || status === "expired") {
      return <Badge className="bg-orange-100 text-orange-800 border-orange-300">Esgotado</Badge>;
    }
    if (status === "canceled") {
      return <Badge className="bg-red-100 text-red-800 border-red-300">Cancelado</Badge>;
    }
    if (status === "pending") {
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Pendente</Badge>;
    }
    return <Badge variant="secondary">{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
            <div className="flex items-center gap-2">
              <div>
                <CardTitle>Planos</CardTitle>
                <CardDescription>
                  Gerencie planos e assinaturas da sua barbearia
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsHelpDialogOpen(true)} title="Como funciona">
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
              </Button>
            </div>
            {activeTab === "planos" && (
              <Button onClick={handleOpenNewPlanDialog}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Adicionar Plano
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-2xl grid-cols-2 mb-8 h-14 p-1.5 bg-muted/50">
              <TabsTrigger
                value="planos"
                className="gap-2.5 text-base font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
              >
                <CreditCard className="w-5 h-5" />
                Planos
              </TabsTrigger>
              <TabsTrigger
                value="assinaturas"
                className="gap-2.5 text-base font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
              >
                <Users className="w-5 h-5" />
                Assinaturas
              </TabsTrigger>
            </TabsList>

            {/* Tab Content: Planos */}
            <TabsContent value="planos" className="mt-0">
              <div className="space-y-4">

                {/* TABELA DE PLANOS */}
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
              </div>
            </TabsContent>

            {/* Tab Content: Assinaturas */}
            <TabsContent value="assinaturas" className="mt-0">
              <div className="space-y-4">
                {/* Header com Filtro */}
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-semibold">Assinaturas Ativas</h3>
                    <p className="text-sm text-muted-foreground">
                      {filteredSubscriptions.length} assinatura{filteredSubscriptions.length !== 1 ? "s" : ""} encontrada{filteredSubscriptions.length !== 1 ? "s" : ""}
                    </p>
                  </div>

                  <Select value={subscriptionFilter} onValueChange={(value: any) => setSubscriptionFilter(value)}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Apenas Ativos</SelectItem>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="expired">Apenas Esgotados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Tabela de Assinaturas */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Créditos Usados</TableHead>
                      <TableHead className="text-center">Início</TableHead>
                      <TableHead className="text-center">Fim</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-center">Pagamento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingSubscriptions ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : filteredSubscriptions.length > 0 ? (
                      filteredSubscriptions.map((subscription) => (
                        <TableRow key={subscription._id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{subscription.customer.name}</p>
                              <p className="text-xs text-muted-foreground">{subscription.customer.phone}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{subscription.plan.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {subscription.plan.totalCredits} crédito{subscription.plan.totalCredits > 1 ? "s" : ""}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {getStatusBadge(subscription.status, subscription.creditsRemaining)}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center">
                              <span className="font-semibold">{getUsedCredits(subscription)}/{subscription.plan.totalCredits}</span>
                              <span className="text-xs text-muted-foreground">
                                ({subscription.creditsRemaining} restante{subscription.creditsRemaining !== 1 ? "s" : ""})
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {format(new Date(subscription.startDate), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {format(new Date(subscription.endDate), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {PriceFormater(subscription.plan.price)}
                          </TableCell>
                          <TableCell className="text-center">
                            {subscription.mercadoPagoPreapprovalId ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                <TrendingUp className="w-3 h-3 mr-1" />
                                Online
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                                Manual
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          Nenhuma assinatura encontrada.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
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
                <Label htmlFor="planCredits">Créditos (usos no mês)</Label>
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

      {/* Modal de Ajuda - Como Funciona */}
      <Dialog open={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Como Funcionam os Planos?</DialogTitle>
            <DialogDescription>Entenda o fluxo completo de uso dos planos na sua barbearia</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Passo 1 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                1
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-semibold text-base">Criar um Plano</h4>
                <p className="text-sm text-muted-foreground">
                  Defina o nome, preço, quantidade de créditos e duração do plano. Exemplo: "Plano Mensal" com 4 créditos válidos por 30 dias.
                </p>
              </div>
            </div>

            {/* Passo 2 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                2
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-semibold text-base">Vincular Serviço ao Plano</h4>
                <p className="text-sm text-muted-foreground">
                  Na página de Serviços, crie ou edite um serviço e marque-o como "Serviço de Plano", vinculando-o ao plano desejado. Este serviço só poderá ser agendado por clientes com plano ativo.
                </p>
              </div>
            </div>

            {/* Passo 3 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                3
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-semibold text-base">Atribuir Plano ao Cliente</h4>
                <p className="text-sm text-muted-foreground">
                  Na página de Clientes, atribua o plano ao cliente desejado. O cliente é identificado pelo número de telefone cadastrado.
                </p>
              </div>
            </div>

            {/* Passo 4 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                4
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-semibold text-base">Cliente Agenda Automaticamente</h4>
                <p className="text-sm text-muted-foreground">
                  Quando o cliente agendar usando o <strong>mesmo número de telefone</strong> cadastrado no plano, o sistema reconhecerá automaticamente e consumirá 1 crédito, sem necessidade de pagamento.
                </p>
              </div>
            </div>

            {/* Informação Importante */}
            {/* <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
              <div className="flex gap-3">
                <HelpCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h5 className="font-semibold text-sm text-blue-900">Importante!</h5>
                  <p className="text-sm text-blue-800">
                    O cliente <strong>não precisa estar logado</strong>. O sistema identifica automaticamente pelo telefone informado no agendamento. Certifique-se de que o cliente use o mesmo número cadastrado no plano.
                  </p>
                </div>
              </div>
            </div> */}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsHelpDialogOpen(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
