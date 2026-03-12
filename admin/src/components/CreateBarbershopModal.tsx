import { useState } from "react";
import superAdminApiClient from "@/services/superAdminApi";
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
    description: "",
    contact: "",
  });
  const { } = useSuperAdminAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await superAdminApiClient.post("/api/superadmin/barbershops", {
        name: formData.name,
        slug: formData.slug,
        adminEmail: formData.adminEmail,
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
      });

      // Limpa o formulário
      setFormData({
        name: "",
        slug: "",
        adminEmail: "",
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
      <DialogContent className="bg-slate-900/95 border-slate-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto backdrop-blur-xl shadow-2xl">
        <DialogHeader className="space-y-3 pb-4 border-b border-slate-800/50">
          <DialogTitle className="text-2xl font-bold tracking-tight">Nova Barbearia</DialogTitle>
          <DialogDescription className="text-slate-400 text-sm leading-relaxed">
            Preencha os dados básicos e as credenciais de acesso para a nova unidade.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-6">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl text-sm animate-in fade-in zoom-in duration-200 font-medium">
              {error}
            </div>
          )}

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-semibold text-white tracking-tight">
                  Nome da Barbearia *
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="Ex: Barbearia Premium"
                  required
                  className="bg-slate-800/40 border-slate-700/50 text-white placeholder:text-slate-500 focus:ring-blue-500/20 focus:border-blue-500/40 rounded-xl h-11 transition-all"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug" className="text-sm font-semibold text-white tracking-tight">
                  Slug (URL Amigável) *
                </Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => handleChange("slug", e.target.value)}
                  placeholder="ex-barbearia-premium"
                  required
                  className="bg-slate-800/40 border-slate-700/50 text-white placeholder:text-slate-500 focus:ring-blue-500/20 focus:border-blue-500/40 rounded-xl h-11 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact" className="text-sm font-semibold text-white tracking-tight">
                Telefone de Contato
              </Label>
              <Input
                id="contact"
                value={formData.contact}
                onChange={(e) => handleChange("contact", e.target.value)}
                placeholder="(11) 99999-9999"
                className="bg-slate-800/40 border-slate-700/50 text-white placeholder:text-slate-500 focus:ring-blue-500/20 focus:border-blue-500/40 rounded-xl h-11 transition-all"
              />
            </div>

            <div className="p-6 rounded-2xl bg-slate-800/20 border border-slate-700/30 space-y-6 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Credenciais Administrativas</h3>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminEmail" className="text-sm font-medium text-white/90">
                  Email de Acesso *
                </Label>
                <Input
                  id="adminEmail"
                  type="email"
                  value={formData.adminEmail}
                  onChange={(e) => handleChange("adminEmail", e.target.value)}
                  placeholder="admin@unidade.com"
                  required
                  className="bg-slate-800/40 border-slate-700/50 text-white placeholder:text-slate-500 focus:ring-blue-500/20 focus:border-blue-500/40 rounded-xl h-11 transition-all"
                />
                <p className="text-xs text-slate-400">O cliente criará sua própria senha no primeiro acesso.</p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-3 pt-6 border-t border-slate-800/50">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 hover:text-rose-300 transition-all rounded-xl px-8 h-11"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/15 rounded-xl px-10 h-11 border-t border-blue-400/20 transition-all active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                "Criar Unidade"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
