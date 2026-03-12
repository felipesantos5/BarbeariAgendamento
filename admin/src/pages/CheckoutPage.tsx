import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { API_BASE_URL } from "@/config/BackendUrl";
import { Loader2, CheckCircle2, Scissors, Calendar, MessageSquare, BarChart3 } from "lucide-react";

export function CheckoutPage() {
  const [barbershopName, setBarbershopName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/saas/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barbershopName, email, contact }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao processar assinatura.");
      }

      // Redireciona para o Mercado Pago
      window.location.href = data.init_point;
    } catch (err: any) {
      setError(err.message || "Erro ao processar. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    { icon: Calendar, text: "Agendamento online 24h" },
    { icon: MessageSquare, text: "Lembretes automáticos via WhatsApp" },
    { icon: BarChart3, text: "Painel completo de métricas" },
    { icon: Scissors, text: "Gestão de barbeiros e serviços" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col items-center justify-center p-4 pb-20">
      <img
        src="https://res.cloudinary.com/de1f7lccc/image/upload/v1750783948/logo-barbearia_hiymjm.png"
        alt="logo BarbeariAgendamento"
        className="w-64 mb-6"
      />

      <div className="w-full max-w-lg space-y-6">
        {/* Valor */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold text-white">Comece agora</h1>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-sm text-gray-400">R$</span>
            <span className="text-5xl font-extrabold text-white">99</span>
            <span className="text-xl font-bold text-white">,90</span>
            <span className="text-gray-400">/mês</span>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-3">
          {features.map((feature, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2.5">
              <feature.icon className="h-4 w-4 text-green-400 shrink-0" />
              <span className="text-sm text-gray-300">{feature.text}</span>
            </div>
          ))}
        </div>

        {/* Formulário */}
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-white">Dados da sua barbearia</CardTitle>
            <CardDescription className="text-gray-400">
              Preencha abaixo e você será redirecionado para o pagamento seguro via Mercado Pago.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="barbershopName" className="text-gray-300">
                  Nome da Barbearia *
                </Label>
                <Input
                  id="barbershopName"
                  value={barbershopName}
                  onChange={(e) => setBarbershopName(e.target.value)}
                  placeholder="Ex: Barbearia do João"
                  required
                  className="bg-white/10 border-white/20 text-white placeholder:text-gray-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-300">
                  Email de acesso *
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="bg-white/10 border-white/20 text-white placeholder:text-gray-500"
                />
                <p className="text-xs text-gray-500">Esse será seu email de login no painel.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact" className="text-gray-300">
                  WhatsApp
                </Label>
                <Input
                  id="contact"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="bg-white/10 border-white/20 text-white placeholder:text-gray-500"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 text-base font-semibold bg-green-600 hover:bg-green-700 text-white"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Redirecionando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    Assinar e começar
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-gray-500">
                Pagamento seguro via Mercado Pago. Cancele quando quiser.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
