import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import apiClient from "@/services/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, EyeOff, Loader2, Webhook, ExternalLink, Copy, CheckCircle2 } from "lucide-react";
import { AdminOutletContext } from "@/types/AdminOutletContext";
import { API_BASE_URL } from "@/config/BackendUrl";

interface CheckoutSettings {
  mercadoPagoAccessToken?: string;
  mercadoPagoWebhookSecret?: string;
  paymentsEnabled?: boolean;
  requireOnlinePayment?: boolean;
}

export const CheckoutConfigPage = () => {
  const { barbershopId } = useOutletContext<AdminOutletContext>();

  const [formData, setFormData] = useState<CheckoutSettings>({
    mercadoPagoAccessToken: "",
    mercadoPagoWebhookSecret: "",
    paymentsEnabled: false,
    requireOnlinePayment: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [isSettingUpWebhook, setIsSettingUpWebhook] = useState(false);
  const [showInstructionsDialog, setShowInstructionsDialog] = useState(false);
  const [webhookInstructions, setWebhookInstructions] = useState<any>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // Busca as configurações de checkout
  const fetchCheckoutSettings = async () => {
    try {
      const response = await apiClient.get(`${API_BASE_URL}/barbershops/${barbershopId}`);
      setFormData({
        mercadoPagoAccessToken: response.data.mercadoPagoAccessToken || "",
        mercadoPagoWebhookSecret: response.data.mercadoPagoWebhookSecret || "",
        paymentsEnabled: response.data.paymentsEnabled || false,
        requireOnlinePayment: response.data.requireOnlinePayment || false,
      });
    } catch (error: any) {
      console.error("Erro ao buscar configurações de checkout:", error);
      toast.error(error.response?.data?.error || "Erro ao buscar configurações");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (barbershopId) {
      fetchCheckoutSettings();
    }
  }, [barbershopId]);

  // Handler para ativar/desativar pagamentos
  const handlePaymentEnabledChange = (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      paymentsEnabled: checked,
      // Se desativar os pagamentos, desativa também a obrigatoriedade
      requireOnlinePayment: checked ? prev.requireOnlinePayment : false,
    }));
  };

  // Handler para tornar pagamento obrigatório
  const handlePaymentMandatoryChange = (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      requireOnlinePayment: checked,
    }));
  };

  // Handler para mudanças no input do token
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Salva as configurações
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await apiClient.put(`${API_BASE_URL}/barbershops/${barbershopId}`, {
        mercadoPagoAccessToken: formData.mercadoPagoAccessToken,
        mercadoPagoWebhookSecret: formData.mercadoPagoWebhookSecret,
        paymentsEnabled: formData.paymentsEnabled,
        requireOnlinePayment: formData.requireOnlinePayment,
      });

      toast.success("Configurações de checkout salvas com sucesso!");

      // Mostrar mensagem de sucesso
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 5000);
    } catch (error: any) {
      console.error("Erro ao salvar configurações:", error);
      toast.error(error.response?.data?.error || "Erro ao salvar configurações");
    } finally {
      setIsSaving(false);
    }
  };

  // Busca instruções de configuração de webhook
  const handleSetupWebhook = async () => {
    if (!formData.mercadoPagoAccessToken) {
      toast.error("Configure o Access Token do Mercado Pago primeiro");
      return;
    }

    setIsSettingUpWebhook(true);
    try {
      const response = await apiClient.post(
        `${API_BASE_URL}/api/barbershops/${barbershopId}/subscriptions/setup-webhook`
      );

      // Armazenar instruções e mostrar dialog
      setWebhookInstructions(response.data);
      setShowInstructionsDialog(true);

      // Copiar URL para área de transferência
      await navigator.clipboard.writeText(response.data.webhookUrl);
      setUrlCopied(true);

      setTimeout(() => setUrlCopied(false), 3000);
      toast.success("URL copiada para área de transferência!");

    } catch (error: any) {
      console.error("Erro ao buscar instruções de webhook:", error);
      toast.error(error.response?.data?.error || "Erro ao buscar instruções de webhook");
    } finally {
      setIsSettingUpWebhook(false);
    }
  };

  // Copiar URL do webhook
  const handleCopyWebhookUrl = async () => {
    if (webhookInstructions?.webhookUrl) {
      await navigator.clipboard.writeText(webhookInstructions.webhookUrl);
      setUrlCopied(true);
      toast.success("URL copiada!");
      setTimeout(() => setUrlCopied(false), 3000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-10">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <form onSubmit={handleSave}>
        <CardHeader>
          <CardTitle>Configurações de Checkout</CardTitle>
          <CardDescription className="mb-2">
            Configure os pagamentos online com Mercado Pago para permitir que seus clientes paguem pelos agendamentos diretamente no site.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Switch para ativar/desativar checkout */}
          <div className="flex items-center justify-between rounded-lg border p-4 shadow-sm">
            <div className="space-y-0.5">
              <Label htmlFor="payments-enabled" className="text-base font-semibold">
                Ativar checkout online
              </Label>
              <CardDescription>
                Permitir que clientes paguem pelo agendamento diretamente no site.
              </CardDescription>
            </div>
            <Switch
              id="payments-enabled"
              checked={formData.paymentsEnabled || false}
              onCheckedChange={handlePaymentEnabledChange}
            />
          </div>

          {/* Bloco condicional que só aparece se os pagamentos estiverem ativos */}
          {formData.paymentsEnabled && (
            <div className="space-y-4 pl-4 border-l-2 border-primary/50 pt-2 pb-2">
              {/* Switch para tornar pagamento obrigatório */}
              <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
                <div className="space-y-0.5">
                  <Label htmlFor="requireOnlinePayment" className="font-medium">
                    Tornar pagamento OBRIGATÓRIO?
                  </Label>
                  <CardDescription className="text-xs">
                    Se ativo, o cliente DEVERÁ pagar online para concluir o agendamento.
                  </CardDescription>
                </div>
                <Switch
                  id="requireOnlinePayment"
                  checked={formData.requireOnlinePayment || false}
                  onCheckedChange={handlePaymentMandatoryChange}
                />
              </div>

              {/* Campo para o Access Token do Mercado Pago */}
              <div className="space-y-2 flex flex-col pt-4">
                <Label htmlFor="mercadoPagoAccessToken">Access Token do Mercado Pago</Label>
                <div className="relative">
                  <Input
                    id="mercadoPagoAccessToken"
                    name="mercadoPagoAccessToken"
                    type={showToken ? "text" : "password"}
                    value={formData.mercadoPagoAccessToken || ""}
                    onChange={handleInputChange}
                    placeholder="Cole seu Access Token aqui"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute inset-y-0 right-0 h-full px-3"
                    onClick={() => setShowToken(!showToken)}
                    aria-label={showToken ? "Esconder token" : "Mostrar token"}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Links úteis */}
                <div className="space-y-1 mt-2">
                  <a
                    className="text-xs text-gray-700 underline block"
                    href="https://www.mercadopago.com.br/settings/account/applications/create-app"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Clique aqui para criar sua conta no Mercado Pago
                  </a>
                  <a
                    className="text-xs text-gray-700 underline block"
                    href="https://youtu.be/341Dptvsov0"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Video de tutorial explicativo
                  </a>
                </div>
              </div>

              {/* Campo para a Webhook Secret */}
              <div className="space-y-2 flex flex-col pt-4">
                <Label htmlFor="mercadoPagoWebhookSecret">Assinatura Secreta do Webhook (Opcional)</Label>
                <div className="relative">
                  <Input
                    id="mercadoPagoWebhookSecret"
                    name="mercadoPagoWebhookSecret"
                    type={showWebhookSecret ? "text" : "password"}
                    value={formData.mercadoPagoWebhookSecret || ""}
                    onChange={handleInputChange}
                    placeholder="Cole a assinatura secreta gerada pelo Mercado Pago"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute inset-y-0 right-0 h-full px-3"
                    onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                    aria-label={showWebhookSecret ? "Esconder secret" : "Mostrar secret"}
                  >
                    {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  A assinatura secreta é gerada automaticamente quando você configura o webhook no painel do Mercado Pago.
                  Cole ela aqui para validar a autenticidade das notificações e aumentar a segurança.
                </p>
              </div>
            </div>
          )}

          {/* Instruções */}
          <fieldset className="border p-4 rounded-md bg-blue-50/50 dark:bg-blue-950/20">
            <legend className="text-lg font-semibold px-2 text-blue-900 dark:text-blue-100">
              Como Funciona
            </legend>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800 dark:text-blue-200 mt-2">
              <li>Crie ou acesse sua conta no Mercado Pago através do link acima</li>
              <li>Gere um Access Token nas configurações da sua conta</li>
              <li>Cole o token no campo acima e ative o checkout online</li>
              <li>Seus clientes poderão pagar pelos agendamentos diretamente no site</li>
            </ol>
          </fieldset>

          {/* Gerenciamento de Webhooks */}
          {formData.paymentsEnabled && formData.mercadoPagoAccessToken && (
            <fieldset className="border p-4 rounded-md bg-green-50/50 dark:bg-green-950/20">
              <legend className="text-lg font-semibold px-2 text-green-900 dark:text-green-100">
                Configuração de Webhooks (Assinaturas)
              </legend>
              <div className="space-y-3 mt-2">
                <p className="text-sm text-green-800 dark:text-green-200">
                  Webhooks são necessários para que o sistema de assinaturas recorrentes funcione automaticamente.
                  Configure uma vez no painel do Mercado Pago e o sistema receberá notificações sobre pagamentos e renovações.
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2 rounded border border-amber-200">
                  <strong>Importante:</strong> A configuração de webhooks deve ser feita manualmente no painel de desenvolvedor do Mercado Pago.
                  Clique no botão abaixo para ver as instruções passo a passo e copiar a URL necessária.
                </p>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSetupWebhook}
                    disabled={isSettingUpWebhook}
                    className="gap-2"
                  >
                    {isSettingUpWebhook ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Configurando...
                      </>
                    ) : (
                      <>
                        <Webhook className="h-4 w-4" />
                        Ver Instruções de Webhook
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </fieldset>
          )}
        </CardContent>

        <CardFooter className="flex-col sm:flex-row items-center justify-end gap-3 mt-4">
          {/* Mensagem de sucesso - ao lado do botão no desktop, embaixo no mobile */}
          <div className={`flex items-center gap-2 transition-opacity duration-300 ${showSuccessMessage ? 'opacity-100' : 'opacity-0'} order-2 sm:order-1`}>
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-green-600">Configurações salvas com sucesso!</span>
          </div>

          <Button type="submit" disabled={isSaving} className="cursor-pointer order-1 sm:order-2">
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Configurações"
            )}
          </Button>
        </CardFooter>
      </form>

      {/* Dialog de Instruções de Webhook */}
      <Dialog open={showInstructionsDialog} onOpenChange={setShowInstructionsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Configurar Webhook no Mercado Pago
            </DialogTitle>
            <DialogDescription>
              Siga as instruções abaixo para configurar o webhook no painel do Mercado Pago
            </DialogDescription>
          </DialogHeader>

          {webhookInstructions && (
            <div className="space-y-4 mt-4">
              {/* URL do Webhook */}
              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <Label className="text-sm font-semibold mb-2 block">URL do Webhook:</Label>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 bg-white dark:bg-gray-800 p-2 rounded text-xs break-all border">
                    {webhookInstructions.webhookUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyWebhookUrl}
                    className="gap-2"
                  >
                    {urlCopied ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copiar
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Instruções Passo a Passo */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Passo a Passo:</h4>
                <ol className="space-y-3 text-sm">
                  <li className="flex gap-2">
                    <span className="font-bold min-w-[1.5rem]">1.</span>
                    <span>
                      {webhookInstructions.instructions.step1}:{" "}
                      <a
                        href={webhookInstructions.dashboardLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1"
                      >
                        {webhookInstructions.dashboardLink}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold min-w-[1.5rem]">2.</span>
                    <span>{webhookInstructions.instructions.step2}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold min-w-[1.5rem]">3.</span>
                    <span>{webhookInstructions.instructions.step3}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold min-w-[1.5rem]">4.</span>
                    <span>
                      Cole a URL abaixo no campo 'URL de produção' (<strong className="text-red-600">IMPORTANTE: Configure no MODO DE PRODUÇÃO</strong>)
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold min-w-[1.5rem]">5.</span>
                    <span>
                      Selecione os eventos: <strong>Pagamentos</strong>, <strong>Planos e Assinaturas</strong>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold min-w-[1.5rem]">6.</span>
                    <span>{webhookInstructions.instructions.step6}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold min-w-[1.5rem]">7.</span>
                    <span>
                      Após salvar, o Mercado Pago irá gerar uma <strong className="text-blue-600">Assinatura Secreta</strong>.
                      Copie essa assinatura e cole no campo "Assinatura Secreta do Webhook" acima nesta página.
                      Isso aumenta a segurança validando que os webhooks realmente vieram do Mercado Pago.
                    </span>
                  </li>
                </ol>
              </div>

              {/* Nota Importante */}
              {/* <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded border border-amber-200 dark:border-amber-800">
                <p className="text-sm">
                  <strong className="text-amber-800 dark:text-amber-300">Nota:</strong>{" "}
                  <span className="text-amber-700 dark:text-amber-400">{webhookInstructions.note}</span>
                </p>
              </div> */}

              {/* Botão para abrir dashboard */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowInstructionsDialog(false)}
                >
                  Fechar
                </Button>
                <Button
                  onClick={() => window.open(webhookInstructions.dashboardLink, '_blank')}
                  className="gap-2"
                >
                  Abrir Painel do Mercado Pago
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
