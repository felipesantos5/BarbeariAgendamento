import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Trash2, PlusCircle, Download } from "lucide-react"; // Ícones
import { PhoneFormat } from "@/helper/phoneFormater";
import { CepFormat } from "@/helper/cepFormarter";
import { ImageUploader } from "../components/ImageUploader";
import apiClient from "@/services/api";
import { ColorSelector } from "@/components/themeColorPicker";
import { API_BASE_URL } from "@/config/BackendUrl";

// Tipos para os dados da barbearia (espelhando seus schemas do backend)
interface Address {
  cep: string;
  estado: string;
  cidade: string;
  bairro: string;
  rua: string;
  numero: string;
  complemento?: string;
}

interface WorkingHour {
  _id?: string; // Mongoose pode adicionar _id a subdocumentos
  day: string;
  start: string;
  end: string;
}

// ✅ ATUALIZADO (1/5): Interface de dados
interface BarbershopData {
  _id: string;
  name: string;
  description: string;
  address: Address;
  logoUrl?: string;
  contact: string;
  slug: string;
  instagram: string;
  workingHours: WorkingHour[];
  themeColor: string;
  LogoBackgroundColor: string;
  qrcode: string;
}

// ✅ ATUALIZADO (2/5): Estado inicial
const initialBarbershopState: Partial<BarbershopData> = {
  name: "",
  description: "",
  address: {
    cep: "",
    estado: "",
    cidade: "",
    bairro: "",
    rua: "",
    numero: "",
    complemento: "",
  },
  logoUrl: "",
  themeColor: "",
  LogoBackgroundColor: "",
  contact: "",
  instagram: "",
  slug: "",
  qrcode: "",
  workingHours: [],
};

const daysOfWeek = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

interface AdminOutletContext {
  barbershopId: string;
  barbershopName: string;
}

export function BarbeariaConfigPage() {
  const { barbershopId } = useOutletContext<AdminOutletContext>();

  const [formData, setFormData] = useState<Partial<BarbershopData>>(initialBarbershopState);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false); // Rastreia se a logo foi removida
  const [isUploading, setIsUploading] = useState(false);
  const [qrCodeBlob, setQrCodeBlob] = useState<Blob | null>(null); // Armazena o blob da imagem
  const [qrCodeUrl, setQrCodeUrl] = useState(""); // Armazena a URL local (blob:)

  useEffect(() => {
    if (!barbershopId) {
      setError("ID da barbearia não fornecido.");
      setIsLoading(false);
      return;
    }

    const fetchBarbershopData = async () => {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);
      try {
        // 1. Busca os dados da barbearia
        const response = await apiClient.get(`${API_BASE_URL}/barbershops/${barbershopId}`);
        setFormData(response.data);

        // 2. Busca o QR Code de forma autenticada
        const qrResponse = await apiClient.get(`${API_BASE_URL}/barbershops/${barbershopId}/qrcode`, {
          responseType: "blob", // Pede a imagem como dados binários
        });

        const blob = qrResponse.data;
        setQrCodeBlob(blob); // Salva o blob para o download

        // 3. Cria uma URL temporária (blob URL) e salva no estado
        const localUrl = URL.createObjectURL(blob);
        setQrCodeUrl(localUrl);
      } catch (err) {
        console.error("Erro ao buscar dados da barbearia ou QR code:", err);
        setError("Falha ao carregar os dados da barbearia.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchBarbershopData();

    // 4. LIMPEZA: Revoga a URL temporária quando o componente é desmontado
    return () => {
      if (qrCodeUrl.startsWith("blob:")) {
        URL.revokeObjectURL(qrCodeUrl);
      }
    };
  }, [barbershopId]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };


  const handleContactChange = (e: ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const digitsOnly = inputValue.replace(/\D/g, "");
    setFormData((prev) => ({
      ...prev,
      contact: digitsOnly.slice(0, 11),
    }));
  };

  const handleCepChange = (e: ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const digitsOnly = inputValue.replace(/\D/g, "");
    setFormData((prev) => ({
      ...prev,
      address: {
        ...(prev?.address as Address),
        cep: digitsOnly.slice(0, 8),
      },
    }));
  };

  const handleAddressChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      address: { ...prev?.address, [name]: value } as Address,
    }));
  };

  const handleThemeColorChange = (newColor: string) => {
    setFormData((prev) => ({
      ...prev,
      themeColor: newColor,
    }));
  };

  const handleWorkingHourChange = (index: number, field: keyof WorkingHour, value: string) => {
    setFormData((prev) => {
      const updatedWorkingHours = [...(prev?.workingHours || [])];
      if (updatedWorkingHours[index]) {
        (updatedWorkingHours[index] as any)[field] = value;
      }
      return { ...prev, workingHours: updatedWorkingHours };
    });
  };

  const addWorkingHour = () => {
    setFormData((prev) => ({
      ...prev,
      workingHours: [...(prev?.workingHours || []), { day: "Segunda-feira", start: "09:00", end: "18:00" }],
    }));
  };

  const removeWorkingHour = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      workingHours: (prev?.workingHours || []).filter((_, i) => i !== index),
    }));
  };

  // ✅ ATUALIZADO (4/5): handleSubmit (limpa dados não editáveis)
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    if (!barbershopId) {
      setError("ID da barbearia não está definido.");
      setIsLoading(false);
      return;
    }

    let finalLogoUrl = formData.logoUrl;

    // Se a logo foi removida, define como string vazia
    if (logoRemoved && !logoFile) {
      finalLogoUrl = "";
    } else if (logoFile) {
      // Se há um novo arquivo para upload
      setIsUploading(true);
      const imageUploadData = new FormData();
      imageUploadData.append("logoFile", logoFile);

      try {
        const uploadResponse = await apiClient.post(`${API_BASE_URL}/api/upload/logo`, imageUploadData);
        finalLogoUrl = uploadResponse.data.logoUrl;
        setLogoFile(null);
        setLogoRemoved(false); // Reset após upload bem-sucedido
      } catch (uploadError: any) {
        console.error("Erro no upload da logo:", uploadError);
        setError(uploadError.response?.data?.error || "Falha ao fazer upload da nova logo. As outras alterações não foram salvas.");
        setIsUploading(false);
        setIsLoading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    // Remove _id e outros campos não editáveis do formData antes de enviar para o PUT
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, qrcode, ...dataToUpdateClean } = formData as any;

    const payload = {
      ...dataToUpdateClean,
      logoUrl: finalLogoUrl,
    };

    try {
      const updateResponse = await apiClient.put(`${API_BASE_URL}/barbershops/${barbershopId}`, payload);
      setSuccessMessage("Dados da barbearia atualizados com sucesso!");
      setFormData(updateResponse.data);
      setLogoRemoved(false); // Reset após salvamento bem-sucedido
    } catch (err: any) {
      console.error("Erro ao atualizar barbearia:", err);
      setError(err.response?.data?.error || "Falha ao atualizar dados da barbearia.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!qrCodeBlob) return; // Usa o blob que já salvamos

    try {
      const url = window.URL.createObjectURL(qrCodeBlob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `qrcode-barbearia-${barbershopId}.png`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao baixar o QR Code:", error);
    }
  };

  if (isLoading && !formData?.name) return <p className="text-center p-10">Carregando configurações...</p>;
  if (error && !formData?.name) return <p className="text-center p-10 text-red-600">{error}</p>;
  if (!formData?.name && !isLoading) return <p className="text-center p-10">Nenhuma configuração encontrada para esta barbearia.</p>;

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Configurações da Barbearia</CardTitle>
        <CardDescription>Edite os detalhes do seu estabelecimento.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          {/* ... (Detalhes Básicos, Slug, Logo, Cor, QR Code, Endereço, Horários) ... */}
          {/* ... (O JSX para os campos anteriores permanece o mesmo) ... */}

          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" value={formData.name || ""} onChange={handleInputChange} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea id="description" name="description" className="h-40" value={formData.description || ""} onChange={handleInputChange} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact">Contato (WhatsApp)</Label>
              <Input
                id="contact"
                name="contact"
                type="tel"
                value={PhoneFormat(formData.contact || "")}
                onChange={handleContactChange}
                maxLength={15}
                placeholder="(XX) XXXXX-XXXX"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Instagram</Label>
              <Input id="instagram" name="instagram" value={formData.instagram || ""} onChange={handleInputChange} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug (URL)</Label>
            <Input id="slug" name="slug" value={formData.slug || ""} onChange={handleInputChange} required />
            <p className="text-xs text-gray-500">Ex: nome-da-barbearia (usado na URL da sua página)</p>
          </div>

          <div className="space-y-2">
            <ImageUploader
              initialImageUrl={formData.logoUrl || null}
              onFileSelect={(file) => {
                setLogoFile(file);
                if (file) {
                  setLogoRemoved(false); // Se selecionou um novo arquivo, não está mais removido
                }
              }}
              aspectRatio="square"
            />
            {isUploading && <p className="text-sm text-blue-600 mt-2">Enviando logo...</p>}
          </div>

          <div className="space-y-2">
            <ColorSelector label="Cor principal" color={formData.themeColor || "#000000"} onChange={handleThemeColorChange} />
            <p className="text-xs text-muted-foreground">Esta cor será usada em botões e destaques na página de agendamento da sua barbearia.</p>
          </div>

          <CardHeader className="px-0!">
            <CardTitle>QR Code para Agendamento</CardTitle>
            <CardDescription>Use este QR Code em materiais de divulgação para que seus clientes possam agendar facilmente.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {qrCodeUrl ? (
              <>
                <div className="p-4 bg-white rounded-lg border">
                  {/* Usa a URL local (blob:) */}
                  <img src={qrCodeUrl} alt="QR Code de Agendamento" width={200} height={200} />
                </div>

                <Button onClick={handleDownload}>
                  <Download className="mr-2 h-4 w-4" />
                  Baixar QR Code
                </Button>
              </>
            ) : (
              <p>Carregando QR Code...</p>
            )}
          </CardContent>

          <fieldset className="border p-4 rounded-md">
            <legend className="text-lg font-semibold px-1">Endereço</legend>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    name="cep"
                    type="text"
                    value={CepFormat(formData.address?.cep || "")}
                    onChange={handleCepChange}
                    maxLength={9}
                    placeholder="00000-000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rua">Rua</Label>
                  <Input id="rua" name="rua" value={formData.address?.rua || ""} onChange={handleAddressChange} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="numero">Número</Label>
                  <Input id="numero" name="numero" value={formData.address?.numero || ""} onChange={handleAddressChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bairro">Bairro</Label>
                  <Input id="bairro" name="bairro" value={formData.address?.bairro || ""} onChange={handleAddressChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="complemento">Complemento</Label>
                  <Input id="complemento" name="complemento" value={formData.address?.complemento || ""} onChange={handleAddressChange} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input id="cidade" name="cidade" value={formData.address?.cidade || ""} onChange={handleAddressChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estado">Estado (UF)</Label>
                  <Input id="estado" name="estado" maxLength={2} value={formData.address?.estado || ""} onChange={handleAddressChange} />
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className="border p-4 rounded-md">
            <legend className="text-lg font-semibold px-1">Horários de Funcionamento</legend>
            <div className="space-y-4 mt-2">
              {(formData.workingHours || []).map((wh, index) => (
                <div
                  key={wh._id || index}
                  className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] items-end gap-3 p-3 border rounded-lg bg-gray-50/50"
                >
                  <div className="md:col-span-1">
                    <Label htmlFor={`wh-day-${index}`} className="text-xs font-medium text-gray-600">
                      Dia da Semana
                    </Label>
                    <Select value={wh.day} onValueChange={(value) => handleWorkingHourChange(index, "day", value)}>
                      <SelectTrigger id={`wh-day-${index}`} className="mt-1 w-full md:w-40">
                        <SelectValue placeholder="Selecione o dia" />
                      </SelectTrigger>
                      <SelectContent>
                        {daysOfWeek.map((day) => (
                          <SelectItem key={day} value={day}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col items-end gap-2 md:flex-row">
                    <div className="w-full">
                      <Label htmlFor={`wh-start-${index}`} className="text-xs font-medium text-gray-600">
                        Início
                      </Label>
                      <Input
                        id={`wh-start-${index}`}
                        type="time"
                        className="mt-1"
                        value={wh.start}
                        onChange={(e) => handleWorkingHourChange(index, "start", e.target.value)}
                      />
                    </div>
                    <div className="w-full">
                      <Label htmlFor={`wh-end-${index}`} className="text-xs font-medium text-gray-600">
                        Fim
                      </Label>
                      <Input
                        id={`wh-end-${index}`}
                        type="time"
                        className="mt-1"
                        value={wh.end}
                        onChange={(e) => handleWorkingHourChange(index, "end", e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => removeWorkingHour(index)}
                      aria-label="Remover este horário"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addWorkingHour} className="mt-2">
                <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Horário
              </Button>
            </div>
          </fieldset>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={isLoading || isUploading} className="cursor-pointer mt-4">
            {isLoading ? (isUploading ? "Enviando Imagem..." : "Salvando...") : "Salvar Configurações"}
          </Button>
        </CardFooter>
        <div className="px-6 mt-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {successMessage && <p className="text-sm text-green-600">{successMessage}</p>}
        </div>
      </form>
    </Card>
  );
}
