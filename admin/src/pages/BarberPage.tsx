import { useEffect, useState, ChangeEvent, FormEvent } from "react";
import { useOutletContext } from "react-router-dom";

// Importações de componentes ShadCN/UI
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Edit2, Trash2, UserCircle, Copy } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import apiClient from "@/services/api";
import { API_BASE_URL } from "@/config/BackendUrl";
import { ImageUploader } from "../components/ImageUploader";
import { useResponsive } from "@/hooks/useResponsive";

// Contexto do AdminLayout (para obter barbershopId)
interface AdminOutletContext {
  barbershopId: string;
  barbershopName: string;
}

// Tipos para os dados do funcionário/barbeiro
interface Availability {
  _id?: string; // Mongoose pode adicionar _id
  day: string;
  start: string;
  end: string;
}

interface Break {
  enabled: boolean;
  start: string;
  end: string;
  days: string[];
}

interface Barber {
  _id: string;
  name: string;
  image?: string;
  availability: Availability[];
  break?: Break; // Adicionar campo break
  email?: string;
  commission?: number;
}

type BarberFormData = {
  name: string;
  image?: string;
  availability: Availability[];
  break?: Break; // Adicionar campo break
  email?: string; // Agora é opcional - o dono pode criar barbeiro sem conta de login
  password?: string;
  commission?: number;
};

const daysOfWeek = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

const initialBarberFormState: BarberFormData = {
  name: "",
  image: "",
  email: "",
  password: "",
  commission: 0,
  availability: [{ day: "Segunda-feira", start: "09:00", end: "18:00" }],
  break: {
    enabled: false,
    start: "12:00",
    end: "13:00",
    days: [],
  },
};

export function BarberPage() {
  const { barbershopId } = useOutletContext<AdminOutletContext>();

  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [currentBarberForm, setCurrentBarberForm] = useState<Partial<Barber>>(initialBarberFormState);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [barberToDelete, setBarberToDelete] = useState<Barber | null>(null);
  const [setupLink, setSetupLink] = useState("");
  const [isResendingEmail, setIsResendingEmail] = useState(false);


  const { isMobile } = useResponsive();

  const fetchBarbers = async () => {
    if (!barbershopId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`${API_BASE_URL}/barbershops/${barbershopId}/barbers`);
      setBarbers(response.data);
    } catch (err) {
      console.error("Erro ao buscar funcionários:", err);
      setError("Não foi possível carregar os funcionários.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBarbers();
  }, [barbershopId]);

  const handleFormInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCurrentBarberForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAvailabilityChange = (index: number, field: keyof Availability, value: string) => {
    setCurrentBarberForm((prev) => {
      const newAvailability = [...(prev?.availability || [])];
      if (newAvailability[index]) {
        (newAvailability[index] as any)[field] = value;
      }
      return { ...prev, availability: newAvailability };
    });
  };

  const addAvailabilitySlot = () => {
    setCurrentBarberForm((prev) => ({
      ...prev,
      availability: [...(prev?.availability || []), { day: "Segunda-feira", start: "09:00", end: "18:00" }],
    }));
  };

  const removeAvailabilitySlot = (index: number) => {
    setCurrentBarberForm((prev) => ({
      ...prev,
      availability: (prev?.availability || []).filter((_, i) => i !== index),
    }));
  };

  const openAddDialog = () => {
    setDialogMode("add");
    setCurrentBarberForm(initialBarberFormState);
    setIsDialogOpen(true);
    setError(null);
  };

  const openEditDialog = (barber: Barber) => {
    setDialogMode("edit");
    // Garante que availability seja um array para o formulário
    setCurrentBarberForm({
      ...barber,
      availability: barber.availability || [],
    });
    setIsDialogOpen(true);
    setError(null);
  };

  const handleBreakChange = (field: keyof Break, value: any) => {
    setCurrentBarberForm((prev) => ({
      ...prev,
      break: {
        ...prev.break,
        [field]: value,
      } as Break,
    }));
  };

  const handleBreakDayToggle = (day: string) => {
    setCurrentBarberForm((prev) => {
      const currentDays = prev.break?.days || [];
      const newDays = currentDays.includes(day) ? currentDays.filter((d) => d !== day) : [...currentDays, day];

      return {
        ...prev,
        break: {
          ...prev.break,
          days: newDays,
        } as Break,
      };
    });
  };

  const handleSaveBarber = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!barbershopId || !currentBarberForm.name) {
      setError("Nome do funcionário é obrigatório.");
      return;
    }

    let finalImageUrl = currentBarberForm.image || "";

    // 1. Se um novo arquivo de imagem foi selecionado, faz o upload primeiro
    if (profileImageFile) {
      const imageUploadData = new FormData();
      imageUploadData.append("profileImage", profileImageFile); // O nome do campo esperado pelo backend

      try {
        // Assumindo que você criou uma rota /api/upload/barber-profile que salva em public/uploads/barbers
        const uploadResponse = await apiClient.post(`${API_BASE_URL}/api/upload/barber-profile`, imageUploadData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        finalImageUrl = uploadResponse.data.imageUrl; // O backend retorna a URL da imagem salva
      } catch (uploadError: any) {
        console.error("Erro no upload da imagem:", uploadError);
        setError(uploadError.response?.data?.error || "Falha ao fazer upload da imagem.");
        return;
      }
    }

    // 2. Prepara o payload com os dados do barbeiro
    const validAvailability = (currentBarberForm.availability || []).filter((slot) => slot.day && slot.start && slot.end);
    const barberDataPayload: any = {
      name: currentBarberForm.name,
      image: finalImageUrl,
      availability: validAvailability,
      break: currentBarberForm.break,
    };

    if (currentBarberForm.commission !== undefined && currentBarberForm.commission !== null && !isNaN(Number(currentBarberForm.commission))) {
      barberDataPayload.commission = Number(currentBarberForm.commission);
    }

    // Só inclui o email no payload se tiver valor (evita enviar string vazia)
    if (currentBarberForm.email && currentBarberForm.email.trim() !== "") {
      barberDataPayload.email = currentBarberForm.email;
    }

    // 3. Cria ou atualiza o barbeiro
    try {
      if (dialogMode === "add") {
        const response = await apiClient.post(`${API_BASE_URL}/barbershops/${barbershopId}/barbers`, barberDataPayload);

        // Verifica o resultado da criação
        if (response.data.emailSent === true) {
          // Email enviado com sucesso - mostra mensagem de sucesso
          toast.success("Funcionário criado com sucesso!", {
            description: `Um email foi enviado para ${currentBarberForm.email} com o link de configuração de senha.`,
          });
          setIsDialogOpen(false);
        } else if (response.data.emailSent === false) {
          // Email não foi enviado - mostra o link para copiar manualmente
          toast.warning("Atenção: Email não enviado", {
            description: response.data.warning || "Houve um problema ao enviar o email. Copie o link abaixo e envie manualmente.",
          });
          setSetupLink(response.data.setupLink);
        } else if (response.data.setupLink) {
          // Fallback para compatibilidade com versão antiga (sem envio de email)
          setSetupLink(response.data.setupLink);
        } else {
          // Barbeiro criado sem email (sem conta de login)
          toast.success("Funcionário criado com sucesso!", {
            description: response.data.message || "O funcionário foi cadastrado sem conta de login.",
          });
          setIsDialogOpen(false);
        }
      } else if (currentBarberForm._id) {
        await apiClient.put(`${API_BASE_URL}/barbershops/${barbershopId}/barbers/${currentBarberForm._id}`, barberDataPayload);
        toast.success("Funcionário atualizado com sucesso!");
        setIsDialogOpen(false);
      }
      fetchBarbers();
    } catch (err: any) {
      console.error("Erro ao salvar funcionário:", err);
      setError(err.response?.data?.error || "Falha ao salvar o funcionário.");
    }
  };

  const handleDeleteBarber = async () => {
    if (!barberToDelete || !barbershopId) return;
    setError(null);
    try {
      await apiClient.delete(`${API_BASE_URL}/barbershops/${barbershopId}/barbers/${barberToDelete._id}`);
      setBarberToDelete(null);
      fetchBarbers();
    } catch (err: any) {
      console.error("Erro ao deletar funcionário:", err);
      setError(err.response?.data?.error || "Falha ao deletar o funcionário.");
      setBarberToDelete(null);
    }
  };

  const handleResendSetupEmail = async () => {
    if (!currentBarberForm._id || !barbershopId) return;

    setIsResendingEmail(true);
    setError(null);

    try {
      const response = await apiClient.post(
        `${API_BASE_URL}/barbershops/${barbershopId}/barbers/${currentBarberForm._id}/resend-setup-email`
      );

      if (response.data.emailSent) {
        toast.success("Email reenviado com sucesso!", {
          description: `Um novo email foi enviado para ${currentBarberForm.email} com o link de configuração.`,
        });
      } else if (response.data.emailSent === false) {
        // Email falhou, mostra o link
        toast.warning("Atenção: Email não enviado", {
          description: response.data.warning || "Houve um problema ao enviar o email.",
        });
        if (response.data.setupLink) {
          setSetupLink(response.data.setupLink);
        }
      }
    } catch (err: any) {
      console.error("Erro ao reenviar email:", err);
      const errorMessage = err.response?.data?.error || "Falha ao reenviar o email.";

      // Se a conta já está ativa, mostra mensagem específica
      if (err.response?.status === 400) {
        toast.info("Conta já ativada", {
          description: err.response?.data?.info || "Este funcionário já configurou sua senha.",
        });
      } else {
        toast.error("Erro ao reenviar email", {
          description: errorMessage,
        });
      }
    } finally {
      setIsResendingEmail(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(setupLink);
    toast("Link criado com sucesso", {
      description: "Envie para seu barbeiro criar uma senha e acessar os seus horários agendados. valido até 72 horas.",
    });
  };

  const closeDialogAndReset = () => {
    setIsDialogOpen(false);
    setSetupLink("");
  };

  if (isLoading && barbers.length === 0) return <p className="text-center p-10">Carregando funcionários...</p>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start md:items-center justify-between">
        <div className="mb-4">
          <CardTitle>Gerenciar Funcionários</CardTitle>
        </div>
        {!isMobile && (
          <Button onClick={openAddDialog}>
            <PlusCircle className="mr-2 h-4 w-4" /> Adicionar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {error && <p className="mb-4 text-sm text-red-600 bg-red-100 p-3 rounded-md">{error}</p>}
        <Table className="mb-0">
          <TableCaption>{barbers.length === 0 && !isLoading && "Nenhum funcionário cadastrado."}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Barbeiro</TableHead>
              <TableHead className="text-left">Disponibilidade</TableHead>
              <TableHead className="text-left">Pausa</TableHead>
              <TableHead className="text-center">Comissão</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {barbers.map((barber) => (
              <TableRow key={barber._id} onClick={() => openEditDialog(barber)} className="cursor-pointer">
                <TableCell className="font-medium flex gap-1 flex-col md:flex-row pt-4 items-center sm:items-baseline md:items-center">
                  {barber.image ? (
                    <img src={barber.image} alt={barber.name} className="h-10 w-10 rounded-full object-cover md:mr-3" />
                  ) : (
                    <UserCircle className="h-10 w-10 text-gray-300 mr-4" />
                  )}
                  {barber.name}
                </TableCell>
                <TableCell className="text-xs">
                  {barber.availability && barber.availability.length > 0 ? (
                    barber.availability.map((a, index) => <div key={index}>{`${a.day}: ${a.start} - ${a.end}`}</div>)
                  ) : (
                    <span className="text-muted-foreground">Não definida</span>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {barber.availability && barber.availability.length > 0 ? (
                    <>
                      {barber.break?.enabled && (
                        <p className="text-orange-600 mt-1 ">
                          Pausa: {barber.break.start} - {barber.break.end}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Não definida</span>
                  )}
                </TableCell>
                <TableCell className="text-xs font-medium text-blue-600 text-center">
                  {barber.commission || 0}%
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation(); // Impede a propagação do evento
                      openEditDialog(barber);
                    }}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBarberToDelete(barber);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {isMobile && (
              <TableRow>
                <TableCell colSpan={5} className="text-center pt-4 pb-0">
                  <Button onClick={openAddDialog}>Adicionar</Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Dialog para Adicionar/Editar Funcionário */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className=" max-h-[90vh] flex flex-col">
          {!setupLink ? (
            <>
              <DialogHeader>
                <DialogTitle>{dialogMode === "add" ? "Adicionar Novo Funcionário" : "Editar Funcionário"}</DialogTitle>
                <DialogDescription>
                  {" "}
                  {dialogMode === "add"
                    ? "Preencha os dados e crie as credenciais de login para o profissional."
                    : "Edite os dados de perfil e disponibilidade do profissional."}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSaveBarber} className="flex-grow overflow-y-auto pr-6 -mr-4 md:-mr-6">
                <div className="grid gap-6 py-4">
                  <div className="space-y-1.5">
                    <Label>Foto de Perfil</Label>
                    <ImageUploader
                      initialImageUrl={currentBarberForm.image || null}
                      onFileSelect={(file) => setProfileImageFile(file)}
                      aspectRatio="square"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="name">Nome do Funcionário</Label>
                    <Input id="name" name="name" value={currentBarberForm.name || ""} onChange={handleFormInputChange} required />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email de Login <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                    <Input id="email" name="email" type="email" value={currentBarberForm.email || ""} onChange={handleFormInputChange} placeholder="email@exemplo.com" />

                    {dialogMode === "add" ? (
                      <p className="text-xs text-muted-foreground">
                        {currentBarberForm.email
                          ? "O convite para definir a senha será associado a este email."
                          : "Deixe em branco se você (admin) já gerencia os agendamentos. Preencha apenas se quiser dar acesso separado ao funcionário."
                        }
                      </p>
                    ) : currentBarberForm.email ? (
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <p className="text-xs text-muted-foreground flex-1">
                          Se o funcionário não recebeu o email de configuração, você pode reenviá-lo.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleResendSetupEmail}
                          disabled={isResendingEmail}
                          className="shrink-0"
                        >
                          {isResendingEmail ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Enviando...
                            </>
                          ) : (
                            <>
                              📧 Reenviar Email
                            </>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Este funcionário não possui conta de login. Adicione um email se quiser dar acesso ao sistema.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="commission" className="text-right">
                      Comissão (%)
                    </Label>
                    <Input
                      id="commission"
                      name="commission"
                      type="number"
                      min="0"
                      max="100"
                      value={currentBarberForm.commission || ""}
                      onChange={handleFormInputChange}
                      placeholder="Ex: 40"
                      className="col-span-3"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Horários de Disponibilidade</Label>

                    {/* Container para a lista de horários */}
                    <div className="space-y-3">
                      {(currentBarberForm.availability || []).map((slot, index) => (
                        <div
                          key={index}
                          className="grid grid-cols-1 md:grid-cols-[1.5fr_2fr] md:items-end gap-4 p-3 border rounded-lg bg-secondary/50"
                        >
                          {/* Seção do Dia (coluna 1 no desktop) */}
                          <div className="w-full">
                            <Label htmlFor={`day-${index}`} className="text-xs text-muted-foreground">
                              Dia
                            </Label>
                            <Select value={slot.day} onValueChange={(value) => handleAvailabilityChange(index, "day", value)}>
                              <SelectTrigger id={`day-${index}`} className="w-full mt-1">
                                <SelectValue placeholder="Dia" />
                              </SelectTrigger>
                              <SelectContent>
                                {daysOfWeek.map((dayName) => (
                                  <SelectItem key={dayName} value={dayName}>
                                    {dayName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Seção dos Horários e Botão (coluna 2 no desktop) */}
                          <div>
                            <div className="flex flex-col md:flex-row items-end gap-2 ">
                              {/* Container do "Início" */}
                              <div className="flex-grow w-full">
                                <Label htmlFor={`start-${index}`} className="text-xs text-muted-foreground">
                                  Início (24h)
                                </Label>
                                <Input
                                  id={`start-${index}`}
                                  type="time"
                                  step="3600" // Força intervalos de 1 hora
                                  value={slot.start}
                                  onChange={(e) => handleAvailabilityChange(index, "start", e.target.value)}
                                  className="mt-1 w-full text-lg"
                                  placeholder="08:00"
                                />
                              </div>

                              {/* Container do "Fim" */}
                              <div className="flex-grow w-full">
                                <Label htmlFor={`end-${index}`} className="text-xs text-muted-foreground">
                                  Fim (24h)
                                </Label>
                                <Input
                                  id={`end-${index}`}
                                  type="time"
                                  step="3600" // Força intervalos de 1 hora
                                  value={slot.end}
                                  onChange={(e) => handleAvailabilityChange(index, "end", e.target.value)}
                                  className="mt-1 w-full text-lg"
                                  placeholder="18:00"
                                />
                              </div>

                              {/* Container do botão de deletar */}
                              <div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeAvailabilitySlot(index)}
                                  aria-label="Remover horário"
                                  className="h-9 w-9"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button type="button" variant="outline" size="sm" onClick={addAvailabilitySlot} className="mt-2">
                      <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Horário
                    </Button>
                  </div>

                  {/* ✅ SEÇÃO DE PAUSA MELHORADA */}
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label className="text-base font-medium">Horário de Pausa</Label>

                      {/* Toggle mais visível e intuitivo */}
                      <div
                        className={`
                    flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-all
                    ${currentBarberForm.break?.enabled ? "border-primary bg-primary/5 shadow-sm" : "border-gray-200 bg-gray-50 hover:bg-gray-100"}
                  `}
                        onClick={() => handleBreakChange("enabled", !currentBarberForm.break?.enabled)}
                      >
                        <div className="flex items-center space-x-3">
                          <div
                            className={`
                      w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all
                      ${currentBarberForm.break?.enabled ? "border-primary bg-primary" : "border-gray-300 bg-white"}
                    `}
                          >
                            {currentBarberForm.break?.enabled && <div className="w-3 h-3 bg-white rounded-full"></div>}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {currentBarberForm.break?.enabled ? "Pausa Ativada" : "Ativar Horário de Pausa"}
                            </p>
                            <p className="text-sm text-gray-500">
                              {currentBarberForm.break?.enabled
                                ? "Configure os horários e dias da pausa abaixo"
                                : "Defina um intervalo para almoço ou descanso"}
                            </p>
                          </div>
                        </div>
                        <div
                          className={`
                    w-12 h-6 rounded-full transition-all relative
                    ${currentBarberForm.break?.enabled ? "bg-primary" : "bg-gray-300"}
                  `}
                        >
                          <div
                            className={`
                      w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all
                      ${currentBarberForm.break?.enabled ? "left-6" : "left-0.5"}
                    `}
                          ></div>
                        </div>
                      </div>

                      {/* Configurações da pausa - só aparece quando ativado */}
                      {currentBarberForm.break?.enabled && (
                        <div className="space-y-4 p-4 border rounded-lg bg-zinc-50/50 border-zinc-200">
                          {/* Horários da pausa */}
                          <div>
                            <Label className="text-sm font-medium mb-3 block">⏰ Horário da Pausa</Label>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="break-start" className="text-xs text-muted-foreground mb-1 block">
                                  Início da pausa (24h)
                                </Label>
                                <Input
                                  id="break-start"
                                  type="time"
                                  step="1800" // Intervalos de 30 minutos
                                  value={currentBarberForm.break?.start || "12:00"}
                                  onChange={(e) => handleBreakChange("start", e.target.value)}
                                  className="text-lg font-mono"
                                  placeholder="12:00"
                                />
                              </div>
                              <div>
                                <Label htmlFor="break-end" className="text-xs text-muted-foreground mb-1 block">
                                  Fim da pausa (24h)
                                </Label>
                                <Input
                                  id="break-end"
                                  type="time"
                                  step="1800" // Intervalos de 30 minutos
                                  value={currentBarberForm.break?.end || "13:00"}
                                  onChange={(e) => handleBreakChange("end", e.target.value)}
                                  className="text-lg font-mono"
                                  placeholder="13:00"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Dias da semana */}
                          <div>
                            <Label className="text-sm font-medium mb-3 block">📅 Dias da Semana</Label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {daysOfWeek.map((day) => (
                                <div
                                  key={day}
                                  className={`
                              flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-all
                              ${currentBarberForm.break?.days?.includes(day)
                                      ? "border-primary bg-primary/10 shadow-sm"
                                      : "border-gray-200 bg-white hover:bg-gray-50"
                                    }
                            `}
                                  onClick={() => handleBreakDayToggle(day)}
                                >
                                  <div
                                    className={`
                              w-5 h-5 rounded border-2 flex items-center justify-center
                              ${currentBarberForm.break?.days?.includes(day) ? "border-primary bg-primary" : "border-gray-300 bg-white"}
                            `}
                                  >
                                    {currentBarberForm.break?.days?.includes(day) && (
                                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path
                                          fillRule="evenodd"
                                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                          clipRule="evenodd"
                                        />
                                      </svg>
                                    )}
                                  </div>
                                  <Label className="font-medium cursor-pointer">{day}</Label>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer do Dialog fica fora da área de scroll */}
                <DialogFooter className="flex-shrink-0 pt-4 border-t">
                  {error && <p className="text-sm text-red-600 mr-auto">{error}</p>}
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancelar
                    </Button>
                  </DialogClose>
                  <Button type="submit">{dialogMode === "add" ? "Adicionar Funcionário" : "Salvar Alterações"}</Button>
                </DialogFooter>
              </form>
            </>
          ) : (
            <div>
              <DialogHeader>
                <DialogTitle>⚠️ Link de Configuração (Backup)</DialogTitle>
                <DialogDescription>
                  O email automático pode ter falhado. Copie e envie este link manualmente para o funcionário via WhatsApp ou outro meio.
                  Ele poderá definir sua própria senha e acessar o sistema. Este link é de uso único e
                  expira em 72 horas.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center space-x-2 my-4">
                <Input value={setupLink} readOnly />
                <Button type="button" size="icon" onClick={copyToClipboard}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button type="button" onClick={closeDialogAndReset}>
                  Concluído
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AlertDialog para Confirmação de Deleção */}
      <AlertDialog open={!!barberToDelete} onOpenChange={(open) => !open && setBarberToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Remoção</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o funcionário "{barberToDelete?.name}"? Os agendamentos existentes para este profissional não serão
              afetados, mas ele não estará mais disponível para novos agendamentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBarberToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBarber} className="bg-red-600 hover:bg-red-700">
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
