import { useEffect, useState, useRef, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import apiClient from "@/services/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, MessageSquare, X, CheckCircle2, AlertCircle, Clock, RefreshCw, Timer, Save, RotateCcw, ChevronLeft, ChevronRight, History } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminOutletContext } from "@/types/AdminOutletContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneFormat } from "@/helper/phoneFormater";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ReminderHistoryItem {
  _id: string;
  name: string;
  phone: string;
  sentAt: string;
  message?: string;
}

interface ReminderPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface WhatsAppStatus {
  status: "disconnected" | "connecting" | "connected";
  enabled: boolean;
  connectedNumber: string | null;
  instanceName: string | null;
  connectedAt?: string;
  lastCheckedAt?: string;
  morningReminderTime?: string;
  afternoonReminderTime?: string;
}

const QR_CODE_EXPIRY_TIME = 45; // QR code expira em ~45 segundos

export const WhatsAppConfigPage = () => {
  const { barbershopId } = useOutletContext<AdminOutletContext>();
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isRefreshingQR, setIsRefreshingQR] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [qrCodeTimer, setQrCodeTimer] = useState<number>(QR_CODE_EXPIRY_TIME);
  const [morningTime, setMorningTime] = useState("08:00");
  const [afternoonTime, setAfternoonTime] = useState("13:00");
  const [isEnabled, setIsEnabled] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Return reminder state
  const [returnReminderEnabled, setReturnReminderEnabled] = useState(false);
  const [returnReminderDays, setReturnReminderDays] = useState(30);
  const [returnReminderMessage, setReturnReminderMessage] = useState("");
  const [isSavingReturnReminder, setIsSavingReturnReminder] = useState(false);
  const [isLoadingReturnReminder, setIsLoadingReturnReminder] = useState(false);

  // Return reminder history state
  const [reminderHistory, setReminderHistory] = useState<ReminderHistoryItem[]>([]);
  const [reminderPagination, setReminderPagination] = useState<ReminderPagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingStartTimeRef = useRef<number>(0);
  const qrTimerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const MAX_POLLING_TIME = 180000; // 3 minutos

  // Inicia o timer do QR code
  const startQRTimer = useCallback(() => {
    setQrCodeTimer(QR_CODE_EXPIRY_TIME);

    if (qrTimerIntervalRef.current) {
      clearInterval(qrTimerIntervalRef.current);
    }

    qrTimerIntervalRef.current = setInterval(() => {
      setQrCodeTimer((prev) => {
        if (prev <= 1) {
          // QR code expirou, tenta renovar automaticamente
          handleRefreshQRCode();
          return QR_CODE_EXPIRY_TIME;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Para o timer do QR code
  const stopQRTimer = useCallback(() => {
    if (qrTimerIntervalRef.current) {
      clearInterval(qrTimerIntervalRef.current);
      qrTimerIntervalRef.current = null;
    }
  }, []);

  // Busca o status inicial
  const fetchWhatsAppStatus = async () => {
    try {
      const response = await apiClient.get(`/api/barbershops/${barbershopId}/whatsapp/status`);
      const data = response.data;
      setWhatsappStatus(data);
      setIsEnabled(data.enabled || false);
      if (data.morningReminderTime) setMorningTime(data.morningReminderTime);
      if (data.afternoonReminderTime) setAfternoonTime(data.afternoonReminderTime);
    } catch (error: any) {
      console.error("Erro ao buscar status do WhatsApp:", error);
      toast.error(error.response?.data?.error || "Erro ao buscar status");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchReturnReminderConfig = async () => {
    setIsLoadingReturnReminder(true);
    try {
      const response = await apiClient.get(`/api/barbershops/${barbershopId}/whatsapp/return-reminder`);
      const data = response.data;
      setReturnReminderEnabled(data.enabled ?? false);
      setReturnReminderDays(data.inactiveDays ?? 30);
      setReturnReminderMessage(data.customMessage ?? "");
    } catch (error: any) {
      console.error("Erro ao buscar configurações de lembrete de retorno:", error);
    } finally {
      setIsLoadingReturnReminder(false);
    }
  };

  const handleSaveReturnReminder = async () => {
    const clampedDays = Math.min(90, Math.max(14, returnReminderDays));
    setReturnReminderDays(clampedDays);
    setIsSavingReturnReminder(true);
    try {
      await apiClient.put(`/api/barbershops/${barbershopId}/whatsapp/return-reminder`, {
        enabled: returnReminderEnabled,
        inactiveDays: clampedDays,
        customMessage: returnReminderMessage,
      });
      toast.success("Configurações de lembrete de retorno salvas!");
    } catch (error: any) {
      console.error("Erro ao salvar lembrete de retorno:", error);
      toast.error(error.response?.data?.error || "Erro ao salvar configurações");
    } finally {
      setIsSavingReturnReminder(false);
    }
  };

  const fetchReminderHistory = async (page = 1) => {
    setIsLoadingHistory(true);
    try {
      const response = await apiClient.get(`/api/barbershops/${barbershopId}/whatsapp/return-reminder/history?page=${page}&limit=20`);
      setReminderHistory(response.data.reminders);
      setReminderPagination(response.data.pagination);
    } catch (error: any) {
      console.error("Erro ao buscar histórico de lembretes:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (barbershopId) {
      fetchWhatsAppStatus();
      fetchReturnReminderConfig();
      fetchReminderHistory();
    }
  }, [barbershopId]);

  // Polling de status (usado após conectar)
  const startPolling = () => {
    pollingStartTimeRef.current = Date.now();

    pollingIntervalRef.current = setInterval(async () => {
      const elapsedTime = Date.now() - pollingStartTimeRef.current;

      // Timeout após 2 minutos
      if (elapsedTime >= MAX_POLLING_TIME) {
        stopPolling();
        setShowQRModal(false);
        toast.error("Tempo esgotado. Tente conectar novamente.");
        return;
      }

      try {
        const response = await apiClient.get(`/api/barbershops/${barbershopId}/whatsapp/status`);
        const status = response.data;

        setWhatsappStatus(status);

        // Se conectou, para o polling, timer e fecha o modal
        if (status.status === "connected") {
          stopPolling();
          stopQRTimer();
          setShowQRModal(false);
          toast.success(`WhatsApp conectado com sucesso! Número: ${status.connectedNumber}`);
        }
      } catch (error) {
        console.error("Erro ao verificar status:", error);
      }
    }, 3000); // Verifica a cada 3 segundos
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Limpa timers e polling quando o componente desmonta
  useEffect(() => {
    return () => {
      stopPolling();
      stopQRTimer();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [stopQRTimer]);

  const handleConnect = async () => {
    setIsConnecting(true);

    try {
      // Chama o endpoint para criar instância e obter QR code
      const response = await apiClient.post(`/api/barbershops/${barbershopId}/whatsapp/connect`);

      console.log("[WhatsApp] Resposta da conexão:", response.data);

      if (!response.data.qrcode) {
        throw new Error("QR Code não foi retornado pela API");
      }

      setQrCode(response.data.qrcode);
      setShowQRModal(true);

      toast.success("QR Code gerado! Escaneie com seu WhatsApp.");

      // Inicia o timer do QR code e o polling
      startQRTimer();
      startPolling();
    } catch (error: any) {
      console.error("Erro ao conectar WhatsApp:", error);
      toast.error(error.response?.data?.error || error.message || "Erro ao conectar WhatsApp");
    } finally {
      setIsConnecting(false);
    }
  };

  // Função para renovar o QR Code quando expirar
  const handleRefreshQRCode = async () => {
    // Evita múltiplas requisições simultâneas
    if (isRefreshingQR) return;

    setIsRefreshingQR(true);
    try {
      const response = await apiClient.get(`/api/barbershops/${barbershopId}/whatsapp/qrcode`);

      console.log("[WhatsApp] Novo QR Code:", response.data);

      if (response.data.qrcode) {
        setQrCode(response.data.qrcode);
        // Reinicia o timer
        setQrCodeTimer(QR_CODE_EXPIRY_TIME);
        toast.success("Novo QR Code gerado!");
      }
    } catch (error: any) {
      console.error("Erro ao renovar QR Code:", error);
      // Se a instância já está conectada, para o timer e fecha o modal
      if (error.response?.status === 400) {
        stopQRTimer();
        stopPolling();
        setShowQRModal(false);
        await fetchWhatsAppStatus();
      } else {
        toast.error(error.response?.data?.error || "Erro ao gerar novo QR Code");
      }
    } finally {
      setIsRefreshingQR(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);

    try {
      await apiClient.delete(`/api/barbershops/${barbershopId}/whatsapp/disconnect`);

      toast.success("WhatsApp desconectado com sucesso!");

      // Atualiza o status
      await fetchWhatsAppStatus();
    } catch (error: any) {
      console.error("Erro ao desconectar:", error);
      toast.error(error.response?.data?.error || "Erro ao desconectar");
    } finally {
      setIsDisconnecting(false);
      setShowDisconnectDialog(false);
    }
  };

  const handleCloseQRModal = () => {
    stopPolling();
    stopQRTimer();
    setShowQRModal(false);
    setQrCode(null);
    setQrCodeTimer(QR_CODE_EXPIRY_TIME);
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const response = await apiClient.put(`/api/barbershops/${barbershopId}/whatsapp/settings`, {
        morningReminderTime: morningTime,
        afternoonReminderTime: afternoonTime,
        enabled: isEnabled,
      });

      // Atualiza o estado local do status para refletir as novas configurações
      setWhatsappStatus((prev) => prev ? ({
        ...prev,
        enabled: response.data.enabled,
        morningReminderTime: response.data.morningReminderTime,
        afternoonReminderTime: response.data.afternoonReminderTime,
      }) : null);

      toast.success("Configurações salvas com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar configurações:", error);
      toast.error(error.response?.data?.error || "Erro ao salvar configurações");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleToggleEnabled = async (checked: boolean) => {
    setIsEnabled(checked);

    // Opcional: Salvar imediatamente ao trocar o switch
    try {
      const response = await apiClient.put(`/api/barbershops/${barbershopId}/whatsapp/settings`, {
        morningReminderTime: morningTime,
        afternoonReminderTime: afternoonTime,
        enabled: checked,
      });

      setWhatsappStatus((prev) => prev ? ({
        ...prev,
        enabled: response.data.enabled,
      }) : null);

      if (checked) {
        toast.success("Mensagens automáticas ativadas!");
      } else {
        toast.success("Mensagens automáticas desativadas!");
      }
    } catch (error: any) {
      setIsEnabled(!checked); // Reverte o switch em caso de erro
      console.error("Erro ao alternar status:", error);
      toast.error(error.response?.data?.error || "Erro ao alternar status");
    }
  };

  const timeOptions = [];
  for (let i = 0; i < 24; i++) {
    const hour = i.toString().padStart(2, "0");
    timeOptions.push(`${hour}:00`);
    timeOptions.push(`${hour}:30`);
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-10">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <>
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Configurações de WhatsApp</CardTitle>
          <CardDescription>
            Conecte seu WhatsApp para enviar mensagens automáticas aos seus clientes através do seu próprio número.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Switch de Ativação Geral */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-primary/5">
            <div className="space-y-0.5">
              <Label className="text-base font-bold">Ativar Mensagens Automáticas</Label>
              <p className="text-sm text-muted-foreground">
                Habilita o envio de lembretes e mensagens via WhatsApp para seus clientes.
              </p>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={handleToggleEnabled}
              className="scale-125"
            />
          </div>

          {isEnabled && (
            <>
              {/* Status Atual */}
              <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/50">
                <div className="space-y-1">
                  <Label className="text-base font-semibold">Status da Conexão</Label>
                  <div className="flex items-center gap-2">
                    {whatsappStatus?.status === "connected" && (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                          Conectado
                        </Badge>
                      </>
                    )}
                    {whatsappStatus?.status === "connecting" && (
                      <>
                        <Clock className="h-4 w-4 text-yellow-600 animate-pulse" />
                        <Badge variant="default" className="bg-yellow-600 hover:bg-yellow-700">
                          Conectando...
                        </Badge>
                      </>
                    )}
                    {whatsappStatus?.status === "disconnected" && (
                      <>
                        <AlertCircle className="h-4 w-4 text-gray-500" />
                        <Badge variant="outline" className="text-gray-600">
                          Desconectado
                        </Badge>
                      </>
                    )}
                  </div>
                </div>

                {whatsappStatus?.status === "connected" && whatsappStatus.connectedNumber && (
                  <div className="text-right space-y-1">
                    <Label className="text-sm text-muted-foreground">Número Conectado</Label>
                    <p className="font-mono font-semibold text-lg">{PhoneFormat(whatsappStatus.connectedNumber)}</p>
                  </div>
                )}
              </div>

              {/* Instruções - Escondidas se estiver conectado */}
              {whatsappStatus?.status !== "connected" && (
                <fieldset className="border p-4 rounded-md bg-blue-50/50 dark:bg-blue-950/20">
                  <legend className="text-lg font-semibold px-2 text-blue-900 dark:text-blue-100">Como Funciona</legend>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800 dark:text-blue-200 mt-2">
                    <li>Clique em "Conectar WhatsApp" abaixo</li>
                    <li>Escaneie o QR Code que aparecerá com seu WhatsApp</li>
                    <li>Aguarde a confirmação da conexão (leva alguns segundos)</li>
                    <li>Pronto! As mensagens automáticas serão enviadas pelo seu número</li>
                  </ol>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-3 italic">
                    💡 Dica: Use um número exclusivo para o WhatsApp Business da sua barbearia.
                  </p>
                </fieldset>
              )}

              {/* Ações */}
              <div className="flex gap-3">
                {whatsappStatus?.status !== "connected" ? (
                  <Button onClick={handleConnect} disabled={isConnecting} size="lg" className="w-full sm:w-auto">
                    {isConnecting ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span>Conectando...</span>
                        <span className="text-xs font-normal text-muted-foreground animate-pulse ml-2">
                          (Gerando conexão, aguarde...)
                        </span>
                      </div>
                    ) : (
                      <>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Conectar WhatsApp
                      </>
                    )}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="destructive"
                      size="lg"
                      onClick={() => setShowDisconnectDialog(true)}
                      disabled={isDisconnecting}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Desconectar
                    </Button>
                  </>
                )}
              </div>

              <hr className="my-6" />

              {/* Configurações Customizadas */}
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Horários de Lembrete</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Defina o horário em que os lembretes automáticos serão enviados para seus clientes.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="morningTime">Lembrete Período Manhã</Label>
                    <div className="flex flex-col gap-2">
                      <Select value={morningTime} onValueChange={setMorningTime}>
                        <SelectTrigger id="morningTime" className="w-full">
                          <SelectValue placeholder="Selecione o horário" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeOptions.map((time) => (
                            <SelectItem key={`morning-${time}`} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="text-xs text-muted-foreground">
                        Enviado para agendamentos até as 13:00
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="afternoonTime">Lembrete Período Tarde</Label>
                    <div className="flex flex-col gap-2">
                      <Select value={afternoonTime} onValueChange={setAfternoonTime}>
                        <SelectTrigger id="afternoonTime" className="w-full">
                          <SelectValue placeholder="Selecione o horário" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeOptions.map((time) => (
                            <SelectItem key={`afternoon-${time}`} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="text-xs text-muted-foreground">
                        Enviado para agendamentos após as 13:00
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={handleSaveSettings} disabled={isSavingSettings}>
                    {isSavingSettings ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Salvar Configurações de Horário
                  </Button>
                </div>
              </div>

              <hr className="my-6" />

              {/* Lembrete de Retorno de Clientes Inativos */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Lembrete de Retorno de Clientes</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Envia automaticamente uma mensagem toda terça-feira para clientes que não agendaram nos últimos X dias. As mensagens são enviadas com intervalos aleatórios para simular comportamento humano.
                </p>

                {isLoadingReturnReminder ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Carregando configurações...</span>
                  </div>
                ) : (
                  <div className="space-y-5 rounded-lg border p-4">
                    {/* Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base font-medium">Ativar Lembrete de Retorno</Label>
                        <p className="text-sm text-muted-foreground">
                          Clientes inativos receberão uma mensagem automática toda terça-feira às 11h.
                        </p>
                      </div>
                      <Switch
                        checked={returnReminderEnabled}
                        onCheckedChange={setReturnReminderEnabled}
                        className="scale-125"
                      />
                    </div>

                    {returnReminderEnabled && (
                      <>
                        {/* Número de dias */}
                        <div className="space-y-2">
                          <Label htmlFor="inactiveDays">Dias sem agendamento para considerar inativo</Label>
                          <div className="flex items-center gap-3">
                            <Input
                              id="inactiveDays"
                              type="number"
                              min={14}
                              max={90}
                              value={returnReminderDays}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) setReturnReminderDays(val);
                              }}
                              onBlur={() => {
                                setReturnReminderDays((prev) => Math.min(90, Math.max(14, prev)));
                              }}
                              className="w-28"
                            />
                            <span className="text-sm text-muted-foreground">dias (mín. 14, máx. 90)</span>
                          </div>
                        </div>

                        {/* Mensagem personalizada */}
                        <div className="space-y-2">
                          <Label htmlFor="returnMessage">Mensagem personalizada</Label>
                          <Textarea
                            id="returnMessage"
                            placeholder={`Olá, {nome}! Sentimos sua falta na {barbearia}. Já faz {dias} dias desde seu último corte. 💈\n\nQue tal agendar seu retorno?\n{link}`}
                            value={returnReminderMessage}
                            onChange={(e) => setReturnReminderMessage(e.target.value)}
                            rows={5}
                            className="resize-none font-mono text-sm"
                          />
                          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
                            <p className="font-semibold">Variáveis disponíveis:</p>
                            <div className="grid grid-cols-2 gap-1">
                              <span><code className="bg-background px-1 rounded">{"{nome}"}</code> — Nome do cliente</span>
                              <span><code className="bg-background px-1 rounded">{"{barbearia}"}</code> — Nome da barbearia</span>
                              <span><code className="bg-background px-1 rounded">{"{dias}"}</code> — Dias sem visita</span>
                              <span><code className="bg-background px-1 rounded">{"{link}"}</code> — Link de agendamento</span>
                            </div>
                            <p className="pt-1 italic">Se deixar em branco, será usada a mensagem padrão do sistema.</p>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="flex justify-end pt-1">
                      <Button onClick={handleSaveReturnReminder} disabled={isSavingReturnReminder}>
                        {isSavingReturnReminder ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Salvar Lembrete de Retorno
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <hr className="my-6" />

              {/* Histórico de Lembretes Enviados */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Histórico de Lembretes Enviados</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Lista de clientes que receberam lembretes de retorno automaticamente.
                </p>

                {isLoadingHistory ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Carregando histórico...</span>
                  </div>
                ) : reminderHistory.length === 0 ? (
                  <div className="rounded-lg border p-6 text-center text-muted-foreground">
                    <p className="text-sm">Nenhum lembrete de retorno foi enviado ainda.</p>
                  </div>
                ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Enviado em</TableHead>
                          <TableHead className="max-w-xs">Mensagem</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reminderHistory.map((item, index) => (
                          <TableRow key={`${item._id}-${item.sentAt}-${index}`}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell className="font-mono text-sm">{PhoneFormat(item.phone)}</TableCell>
                            <TableCell className="text-sm">
                              {new Date(item.sentAt).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                              {item.message || "Mensagem padrão do sistema"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {/* Paginação */}
                    {reminderPagination.totalPages > 1 && (
                      <div className="flex items-center justify-between border-t px-4 py-3">
                        <p className="text-sm text-muted-foreground">
                          {reminderPagination.total} lembrete{reminderPagination.total !== 1 ? "s" : ""} enviado{reminderPagination.total !== 1 ? "s" : ""}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={reminderPagination.page <= 1}
                            onClick={() => fetchReminderHistory(reminderPagination.page - 1)}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-sm">
                            {reminderPagination.page} / {reminderPagination.totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={reminderPagination.page >= reminderPagination.totalPages}
                            onClick={() => fetchReminderHistory(reminderPagination.page + 1)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal QR Code */}
      <Dialog open={showQRModal} onOpenChange={handleCloseQRModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>Abra o WhatsApp no seu celular e escaneie este código QR</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-6">
            {qrCode ? (
              <>
                <div className="p-4 bg-white rounded-lg border-4 border-gray-200 relative">
                  <img src={qrCode} alt="QR Code WhatsApp" className="w-64 h-64" />
                </div>

                {/* Timer e barra de progresso */}
                <div className="w-full max-w-xs">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Aguardando conexão...</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm font-medium">
                      <Timer className="h-4 w-4" />
                      <span className={qrCodeTimer <= 10 ? "text-red-500" : ""}>{qrCodeTimer}s</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-1000 ${qrCodeTimer <= 10 ? "bg-red-500" : "bg-green-500"
                        }`}
                      style={{ width: `${(qrCodeTimer / QR_CODE_EXPIRY_TIME) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-center text-muted-foreground mt-1">
                    {qrCodeTimer <= 10
                      ? "QR Code expirando, será renovado automaticamente..."
                      : "O QR Code será renovado automaticamente quando expirar"}
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshQRCode}
                  disabled={isRefreshingQR}
                  className="mt-2"
                >
                  {isRefreshingQR ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gerando conexão, aguarde...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Gerar novo QR Code
                    </>
                  )}
                </Button>

                <div className="text-xs text-center text-muted-foreground max-w-sm mt-2">
                  <p>
                    <strong>Como escanear:</strong>
                  </p>
                  <ol className="list-decimal list-inside text-left mt-2 space-y-1">
                    <li>Abra o WhatsApp no celular</li>
                    <li>Toque em Mais opções ou Configurações</li>
                    <li>Toque em Aparelhos conectados</li>
                    <li>Toque em Conectar um aparelho</li>
                    <li>Aponte o celular para esta tela</li>
                  </ol>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 py-12">
                <Loader2 className="animate-spin h-16 w-16 text-primary" />
                <div className="text-center space-y-2">
                  <p className="text-lg font-medium animate-pulse text-primary">
                    Gerando conexão, aguarde...
                  </p>
                  <p className="text-sm text-muted-foreground px-8">
                    Isso pode levar alguns segundos. Não feche esta janela.
                  </p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de desconexão */}
      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao desconectar, as mensagens automáticas voltarão a ser enviadas pelo nosso número padrão até que você
              conecte novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnecting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDisconnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Desconectando...
                </>
              ) : (
                "Sim, desconectar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
