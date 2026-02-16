import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "@/services/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PriceFormater } from "@/helper/priceFormater";
import { Spinner } from "@/components/ui/spinnerLoading";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { Loader2, Mail, CreditCard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Plan {
  _id: string;
  name: string;
  description?: string;
  price: number;
}

interface PlansListProps {
  barbershopId: string;
  barbershopSlug: string;
}

export function PlansList({ barbershopId, barbershopSlug }: PlansListProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribing, setIsSubscribing] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);

  const { isAuthenticated, customer, login } = useCustomerAuth();
  const navigate = useNavigate();

  const handleSubscribe = async (planId: string, email?: string) => {
    // Se não está logado, salvar planId e redirecionar para login
    if (!isAuthenticated) {
      sessionStorage.setItem(
        "pendingSubscription",
        JSON.stringify({
          planId,
          barbershopId,
          barbershopSlug,
        })
      );
      navigate("/entrar", { state: { from: `/${barbershopSlug}` } });
      return;
    }

    // 1. Tentar pegar o e-mail (do context ou do argumento do modal)
    const currentEmail = (email || customer?.email || "").trim();

    // 2. Se não tem e-mail de jeito nenhum, abre o modal
    if (!currentEmail) {
      setPendingPlanId(planId);
      setShowEmailModal(true);
      return;
    }

    // 3. Se chegou aqui, temos um e-mail. Vamos processar a assinatura.
    setIsSubscribing(planId);
    try {
      console.log(`Iniciando assinatura para o plano ${planId} com email: ${currentEmail}`);

      const response = await apiClient.post(`/api/barbershops/${barbershopId}/subscriptions/create-preapproval`, {
        planId,
        email: currentEmail
      });

      // 4. Se o e-mail foi preenchido agora e não estava no context, atualizar o context para não pedir de novo
      if (customer && customer.email !== currentEmail) {
        login(localStorage.getItem("customerToken") || "", {
          ...customer,
          email: currentEmail
        });
      }

      // 5. Redirecionar para o Mercado Pago
      if (response.data.init_point) {
        window.location.href = response.data.init_point;
      } else {
        throw new Error("Link de pagamento não recebido do servidor.");
      }
    } catch (error: any) {
      console.error("Erro no checkout:", error);
      const errorMessage = error.response?.data?.error || error.message || "Erro ao iniciar assinatura.";
      toast.error(errorMessage);
    } finally {
      setIsSubscribing(null);
      // Só fecha o modal se deu certo ou se houve erro real (para permitir tentar de novo)
      setShowEmailModal(false);
      setPendingPlanId(null);
    }
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const email = emailInput.trim();
    if (!email || !email.includes("@")) {
      toast.error("Por favor, insira um e-mail válido.");
      return;
    }

    if (pendingPlanId) {
      handleSubscribe(pendingPlanId, email);
    }
  };

  useEffect(() => {
    if (!barbershopId) return;

    const fetchPlans = async () => {
      setIsLoading(true);
      try {
        const response = await apiClient.get(`/api/barbershops/${barbershopId}/plans`);
        setPlans(response.data);
      } catch (error) {
        console.error("Erro ao carregar planos:", error);
        toast.error("Não foi possível carregar os planos.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlans();
  }, [barbershopId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner />
      </div>
    );
  }

  if (plans.length === 0) {
    return <p className="text-center text-muted-foreground pb-8">Nenhum plano disponível no momento.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {plans.map((plan, index) => (
        <Card key={plan._id} className={`justify-between py-8 ${index === 1 ? "border-2 border-[var(--loja-theme-color)] shadow-lg" : ""}`}>
          <CardHeader>
            <CardTitle className="text-xl text-center">{plan.name}</CardTitle>
            {plan.description && <CardDescription className="text-center">{plan.description}</CardDescription>}
          </CardHeader>
          <CardFooter className="flex-col gap-3">
            <div className="text-4xl font-bold">
              {PriceFormater(plan.price)}
              <span className="text-lg font-normal text-muted-foreground">/mês</span>
            </div>
            <Button
              onClick={() => handleSubscribe(plan._id)}
              disabled={isSubscribing === plan._id}
              className="w-full bg-[var(--loja-theme-color)] hover:bg-[var(--loja-theme-color)]/90"
            >
              {isSubscribing === plan._id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assinar Plano
            </Button>
          </CardFooter>
        </Card>
      ))}

      <Dialog open={showEmailModal} onOpenChange={setShowEmailModal}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-[var(--loja-theme-color)]" />
              Finalizar Assinatura
            </DialogTitle>
            <DialogDescription>
              Para prosseguir com a assinatura no Mercado Pago, precisamos do seu e-mail para vincular ao plano.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEmailSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Seu melhor e-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="exemplo@email.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                required
                className="focus-visible:ring-[var(--loja-theme-color)]"
              />
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-100 flex gap-2">
              <CreditCard className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-[12px] text-blue-700 dark:text-blue-300">
                Este e-mail será usado para enviar os comprovantes de pagamento e avisos de renovação automática.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="submit"
                className="w-full bg-[var(--loja-theme-color)] hover:bg-[var(--loja-theme-color)]/90"
                disabled={!!isSubscribing}
              >
                {isSubscribing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Iniciando Pagamento...
                  </>
                ) : (
                  "Continuar para Pagamento"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
