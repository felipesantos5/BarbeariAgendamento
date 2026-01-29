import { LoginForm } from "@/components/loginForm";
import barberBackground from "@/assets/barber.jpg";
import logo from "@/assets/logo-png.png";
import { useNavigate } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export function CustomerLoginPage() {
  const navigate = useNavigate();

  useDocumentTitle("Entrar - Barbearia Agendamento");

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <button
          type="button"
          className="self-start mb-2 text-sm font-semibold hover:underline cursor-pointer"
          onClick={() => navigate(-1)}
        >
          ← Voltar
        </button>
        <div className="flex justify-center gap-2 lg:justify-start">
          <a href="#" className="flex items-center gap-2 font-medium">
            <img
              src={logo}
              alt="logo barbeariAgendamento"
              className="w-1/2 m-auto"
            />
          </a>
        </div>
        <div className="flex flex-1 justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="bg-muted relative hidden lg:block">
        <img
          src={barberBackground}
          alt="Image"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  );
}
