import { useState, FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import apiClient from "@/services/api";
import { API_BASE_URL } from "@/config/BackendUrl";
import { Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const auth = useAuth();
  const navigate = useNavigate();

  if (auth.isAuthenticated) {
    // Se já autenticado, redireciona para o dashboard da barbearia do usuário
    return <Navigate to={`/${auth.user?.barbershopSlug}/configuracoes`} replace />;
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const response = await apiClient.post(`${API_BASE_URL}/api/auth/admin/login`, { email, password });
      auth.login(response.data.token, response.data.user);
      // Redireciona para o dashboard da barbearia específica após o login
      navigate(`/${response.data.user.barbershopSlug}/dashboard`, {
        replace: true,
      });
    } catch (err: any) {
      setError(err.response?.data?.error || "Falha no login. Verifique suas credenciais.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestPasswordReset = async () => {
    if (!resetEmail) {
      return;
    }
    setIsSendingLink(true);
    try {
      await apiClient.post(`${API_BASE_URL}/api/auth/admin/forgot-password`, {
        email: resetEmail,
      });
      document.getElementById("close-dialog-btn")?.click();
    } catch (error: any) {
    } finally {
      setIsSendingLink(false);
      setResetEmail("");
    }
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-950 p-4 pb-32">
      <img
        src="https://res.cloudinary.com/de1f7lccc/image/upload/v1750783948/logo-barbearia_hiymjm.png"
        alt="logo BarbeariAgendamento"
        className="w-72"
      />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Login do Painel</CardTitle>
          <CardDescription>Acesse o painel de controle da sua barbearia.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="exemplo@email.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          <p className="text-sm text-red-500 mt-3">{error}</p>

          <div className="mt-4 text-sm">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="link" className="p-0 h-auto font-normal">
                  Esqueceu a senha?
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Recuperar Senha</DialogTitle>
                  <DialogDescription>
                    Digite seu e-mail abaixo. Se ele estiver cadastrado, enviaremos um link para você criar uma nova senha.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="reset-email" className="text-right">
                      Email
                    </Label>
                    <Input
                      id="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="col-span-3"
                      placeholder="seu.email@cadastrado.com"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost" id="close-dialog-btn" className="hidden" />
                  </DialogClose>
                  <Button onClick={handleRequestPasswordReset} disabled={isSendingLink}>
                    {isSendingLink ? "Enviando..." : "Enviar Link de Recuperação"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
