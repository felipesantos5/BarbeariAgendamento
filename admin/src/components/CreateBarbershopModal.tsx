import { useState } from "react";
import { API_BASE_URL } from "@/config/BackendUrl";
import { useSuperAdminAuth } from "@/contexts/SuperAdminAuthContext";
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

interface CreateBarbershopModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateBarbershopModal({ open, onOpenChange, onSuccess }: CreateBarbershopModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    adminEmail: "",
    adminPassword: "",
    description: "",
    contact: "",
  });
  const { token } = useSuperAdminAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {

      const response = await fetch(`${API_BASE_URL}/api/superadmin/barbershops`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug,
          adminEmail: formData.adminEmail,
          adminPassword: formData.adminPassword,
          description: formData.description,
          contact: formData.contact,
          address: {
            cep: "",
            estado: "",
            cidade: "",
            bairro: "",
            rua: "",
            numero: "",
          },
          workingHours: [
            { day: "Segunda", start: "09:00", end: "18:00" },
            { day: "Terça", start: "09:00", end: "18:00" },
            { day: "Quarta", start: "09:00", end: "18:00" },
            { day: "Quinta", start: "09:00", end: "18:00" },
            { day: "Sexta", start: "09:00", end: "18:00" },
            { day: "Sábado", start: "09:00", end: "14:00" },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao criar barbearia");
      }

      // Limpa o formulário
      setFormData({
        name: "",
        slug: "",
        adminEmail: "",
        adminPassword: "",
        description: "",
        contact: "",
      });

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Erro ao criar barbearia");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Auto-gera slug baseado no nome
    if (field === "name") {
      const slug = value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^a-z0-9\s-]/g, "") // Remove caracteres especiais
        .replace(/\s+/g, "-") // Substitui espaços por hífens
        .replace(/-+/g, "-") // Remove hífens duplicados
        .trim();
      setFormData((prev) => ({ ...prev, slug }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Nova Barbearia</DialogTitle>
          <DialogDescription className="text-slate-400">
            Preencha os dados para criar uma nova barbearia e seu administrador.
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
              <Label htmlFor="name" className="text-slate-300">
                Nome da Barbearia *
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Ex: Barbearia do João"
                required
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug" className="text-slate-300">
                Slug (URL) *
              </Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => handleChange("slug", e.target.value)}
                placeholder="barbearia-do-joao"
                required
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
              />
              <p className="text-xs text-slate-500">
                URL: barbeariagendamento.com.br/{formData.slug || "seu-slug"}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-slate-300">
                Descrição
              </Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Descrição da barbearia"
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact" className="text-slate-300">
                Telefone de Contato
              </Label>
              <Input
                id="contact"
                value={formData.contact}
                onChange={(e) => handleChange("contact", e.target.value)}
                placeholder="(11) 99999-9999"
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
              />
            </div>

            <div className="border-t border-slate-700 pt-4 mt-4">
              <h3 className="text-lg font-semibold mb-4 text-white">Dados do Administrador</h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="adminEmail" className="text-slate-300">
                    Email do Admin *
                  </Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    value={formData.adminEmail}
                    onChange={(e) => handleChange("adminEmail", e.target.value)}
                    placeholder="admin@exemplo.com"
                    required
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminPassword" className="text-slate-300">
                    Senha do Admin *
                  </Label>
                  <Input
                    id="adminPassword"
                    type="password"
                    value={formData.adminPassword}
                    onChange={(e) => handleChange("adminPassword", e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    minLength={6}
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                  />
                </div>
              </div>
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
                  Criando...
                </>
              ) : (
                "Criar Barbearia"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
