import { useState, FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, Navigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import apiClient from "@/services/api";
import { API_BASE_URL } from "@/config/BackendUrl";
import { Eye, EyeOff, CheckCircle2, Lock } from "lucide-react";
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
  const [searchParams] = useSearchParams();
  const isFirstAccess = searchParams.get("primeiro-acesso") === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Estado para setup de senha no primeiro acesso
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  const [setupBarbershopName, setSetupBarbershopName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [setupError, setSetupError] = useState("");

  const auth = useAuth();
  const navigate = useNavigate();

  if (auth.isAuthenticated) {
    return <Navigate to={`/${auth.user?.barbershopSlug}/configuracoes`} replace />;
  }

  const isPasswordValid = newPassword.length >= 6;

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const response = await apiClient.post(`${API_BASE_URL}/api/auth/admin/login`, {
        email,
        password: password || undefined,
      });

      // Primeiro acesso — precisa criar senha
      if (response.data.needsPasswordSetup) {
        setSetupToken(response.data.setupToken);
        setSetupBarbershopName(response.data.user?.barbershopName || "");
        setShowPasswordSetup(true);
        return;
      }

      auth.login(response.data.token, response.data.user);
      navigate(`/${response.data.user.barbershopSlug}/dashboard`, {
        replace: true,
      });
    } catch (err: any) {
      setError(err.response?.data?.error || "Falha no login. Verifique suas credenciais.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupPassword = async () => {
    if (!isPasswordValid) return;
    setSetupError("");
    setIsSettingPassword(true);
    try {
      const response = await apiClient.post(`${API_BASE_URL}/api/auth/admin/setup-first-password`, {
        setupToken,
        password: newPassword,
      });

      auth.login(response.data.token, response.data.user);
      navigate(`/${response.data.user.barbershopSlug}/dashboard`, {
        replace: true,
      });
    } catch (err: any) {
      setSetupError(err.response?.data?.error || "Erro ao criar senha. Tente novamente.");
    } finally {
      setIsSettingPassword(false);
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
          <CardTitle className="text-2xl">
            {isFirstAccess ? "Primeiro Acesso" : "Login do Painel"}
          </CardTitle>
          <CardDescription>
            {isFirstAccess
              ? "Digite o email cadastrado na sua assinatura para configurar sua conta."
              : "Acesse o painel de controle da sua barbearia."}
          </CardDescription>
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
                autoFocus={isFirstAccess}
              />
            </div>

            {!isFirstAccess && (
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="pr-10"
                    placeholder="Digite sua senha"
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
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading
                ? "Entrando..."
                : isFirstAccess
                ? "Continuar"
                : "Entrar"}
            </Button>
          </form>
          <p className="text-sm text-red-500 mt-3">{error}</p>

          {!isFirstAccess && (
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
          )}

          {isFirstAccess && (
            <p className="text-xs text-muted-foreground mt-4 text-center">
              Já tem uma senha?{" "}
              <a href="/login" className="underline text-primary hover:text-primary/80">
                Fazer login normal
              </a>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Modal de criação de senha — primeiro acesso */}
      <Dialog open={showPasswordSetup} onOpenChange={(open) => {
        if (!open) {
          setShowPasswordSetup(false);
          setNewPassword("");
          setSetupError("");
          setShowNewPassword(false);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center space-y-4 pb-2">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Crie sua senha</DialogTitle>
              <DialogDescription className="mt-2">
                {setupBarbershopName ? (
                  <>Bem-vindo ao painel da <strong>{setupBarbershopName}</strong>! Para sua segurança, crie uma senha de acesso.</>
                ) : (
                  <>Bem-vindo! Para sua segurança, crie uma senha de acesso.</>
                )}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-medium">
                Sua nova senha
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="pr-20"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && isPasswordValid) {
                      handleSetupPassword();
                    }
                  }}
                />
                <div className="absolute right-0 top-0 h-full flex items-center gap-1 pr-2">
                  {isPasswordValid && (
                    <CheckCircle2 className="h-4 w-4 text-green-500 animate-in fade-in zoom-in duration-200" />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-transparent"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    tabIndex={-1}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Indicador de progresso */}
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      newPassword.length === 0
                        ? "w-0"
                        : newPassword.length < 6
                        ? "bg-red-500"
                        : newPassword.length < 10
                        ? "bg-yellow-500"
                        : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(100, (newPassword.length / 10) * 100)}%` }}
                  />
                </div>
                <span className={`text-xs font-medium ${isPasswordValid ? "text-green-500" : "text-muted-foreground"}`}>
                  {newPassword.length === 0
                    ? ""
                    : isPasswordValid
                    ? "Senha válida"
                    : `${6 - newPassword.length} caractere${6 - newPassword.length !== 1 ? "s" : ""} restante${6 - newPassword.length !== 1 ? "s" : ""}`}
                </span>
              </div>
            </div>

            {setupError && (
              <p className="text-sm text-red-500">{setupError}</p>
            )}
          </div>

          <Button
            onClick={handleSetupPassword}
            disabled={!isPasswordValid || isSettingPassword}
            className="w-full"
            size="lg"
          >
            {isSettingPassword ? "Criando senha..." : "Criar senha e entrar"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
