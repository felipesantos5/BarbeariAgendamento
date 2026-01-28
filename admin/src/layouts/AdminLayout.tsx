// admin-frontend/src/layouts/AdminLayout.tsx

import React, { useEffect, useState } from "react";
import { Outlet, Link, useParams, useLocation } from "react-router-dom";
import {
  Settings,
  Scissors,
  CalendarDays,
  ShieldAlert,
  LogOut,
  X,
  Menu,
  CalendarOff,
  Package,
  Users2,
  ShoppingCart,
  Contact,
  LayoutDashboard,
  ChartBar,
  Repeat,
  MessageSquare,
  AlertTriangle,
  CreditCard,
  Receipt,
} from "lucide-react"; // Ícones de exemplo
import { useAuth } from "@/contexts/AuthContext";
import apiClient from "@/services/api";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/config/BackendUrl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SetupWizard } from "@/components/SetupWizard";

// Tipo para os dados básicos da barbearia que podem ser úteis no layout
interface BarbershopContextData {
  _id: string;
  name: string;
  slug: string;
  image: string;
  paymentsEnabled: boolean;
  loyaltyProgramEnable?: boolean;
  loyaltyProgramCount?: number;
  isTrial?: boolean;
  trialEndsAt?: string;
  accountStatus?: string;
}

// Contexto para compartilhar dados da barbearia com as páginas filhas (opcional, mas útil)
// Você pode preferir passar props via Outlet context.
export const BarbershopAdminContext = React.createContext<BarbershopContextData | null>(null);

export function AdminLayout() {
  const { barbershopSlug } = useParams<{ barbershopSlug: string }>();
  const { user, logout } = useAuth();
  const location = useLocation(); // Para destacar o link ativo

  const [barbershop, setBarbershop] = useState<BarbershopContextData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [barbersCount, setBarbersCount] = useState<number>(0);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    if (!barbershopSlug) {
      setError("Slug da barbearia não fornecido na URL.");
      setIsLoading(false);
      return;
    }

    const fetchBarbershopForLayout = async () => {
      setIsLoading(true);
      try {
        // Esta rota já existe no seu backend para buscar por slug
        const response = await apiClient.get(`${API_BASE_URL}/barbershops/slug/${barbershopSlug}`);
        if (response.data) {
          setBarbershop({
            _id: response.data._id,
            name: response.data.name,
            image: response.data.logoUrl,
            slug: response.data.slug,
            paymentsEnabled: response.data.paymentsEnabled,
            loyaltyProgramEnable: response.data.loyaltyProgram.enabled,
            loyaltyProgramCount: response.data.loyaltyProgram.targetCount,
            isTrial: response.data.isTrial,
            trialEndsAt: response.data.trialEndsAt,
            accountStatus: response.data.accountStatus,
          });
          setError(null);

          // Busca quantidade de barbeiros e serviços
          try {
            const [barbersResponse, servicesResponse] = await Promise.all([
              apiClient.get(`${API_BASE_URL}/barbershops/${response.data._id}/barbers`),
              apiClient.get(`${API_BASE_URL}/barbershops/${response.data._id}/services`),
            ]);
            const barbersLen = barbersResponse.data?.length || 0;
            const servicesLen = servicesResponse.data?.length || 0;
            setBarbersCount(barbersLen);


            // Verifica se precisa do wizard de configuração (admin only)
            if (user?.role === "admin" && (barbersLen === 0 || servicesLen === 0)) {
              setNeedsSetup(true);
            }
          } catch (barbersErr) {
            console.error("Erro ao buscar barbeiros/serviços:", barbersErr);
            setBarbersCount(0);
          }
        } else {
          setError("Barbearia não encontrada.");
        }
      } catch (err) {
        console.error("Erro ao buscar dados da barbearia para o layout:", err);
        setError("Não foi possível carregar os dados da barbearia.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchBarbershopForLayout();
  }, [barbershopSlug]);

  // Controla exibição do modal de conta expirada
  useEffect(() => {
    if (barbershop?.accountStatus === "inactive") {
      // Verifica se o usuário já fechou o modal nesta sessão
      const modalDismissed = sessionStorage.getItem(`expiredModal_${barbershop._id}`);
      if (!modalDismissed) {
        setShowExpiredModal(true);
      }
    }
  }, [barbershop]);

  if (isLoading) {
    return <div className="flex justify-center items-center min-h-screen">Carregando painel da barbearia...</div>;
  }

  if (error || !barbershop) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-red-600">
        <ShieldAlert size={48} className="mb-4" />
        <p className="text-xl">{error || "Barbearia não encontrada."}</p>
        <Link to="/" className="mt-4 text-blue-500 hover:underline">
          Voltar para o início
        </Link>
      </div>
    );
  }

  // Wizard de configuração inicial
  if (needsSetup && barbershop) {
    return (
      <SetupWizard
        barbershopId={barbershop._id}
        barbershopName={barbershop.name}
        onComplete={() => {
          setNeedsSetup(false);
          // Recarrega os dados para atualizar os contadores
          window.location.reload();
        }}
      />
    );
  }

  // Passando o _id da barbearia para as rotas filhas via Outlet context
  // As páginas filhas poderão acessar isso com useOutletContext()
  const outletContextData = {
    barbershopId: barbershop._id,
    barbershopName: barbershop.name,
    paymentsEnabled: barbershop.paymentsEnabled,
    loyaltyProgramEnable: barbershop.loyaltyProgramEnable,
    loyaltyProgramCount: barbershop.loyaltyProgramCount,
  };

  // Estrutura de navegação organizada por seções
  const navSections = [
    {
      title: "Agenda",
      roles: ["admin", "barber"],
      items: [
        {
          to: "agendamentos",
          label: "Agendamentos",
          icon: <CalendarDays className="mr-2 h-4 w-4" />,
          roles: ["admin", "barber"],
        },
        {
          to: "folgas",
          label: "Folgas",
          icon: <CalendarOff className="mr-2 h-4 w-4" />,
          roles: ["admin", "barber"],
        },
        {
          to: "agendamentos/lista",
          label: "Histórico",
          icon: <CalendarDays className="mr-2 h-4 w-4" />,
          roles: ["admin", "barber"],
        },
      ],
    },
    {
      title: "Visualização",
      roles: ["admin", "barber"],
      items: [
        {
          to: "metricas",
          label: "Métricas",
          icon: <LayoutDashboard className="mr-2 h-4 w-4" />,
          roles: ["admin"],
        },
        {
          to: "metricas-barbeiro",
          label: "Métricas",
          icon: <ChartBar className="mr-2 h-4 w-4" />,
          roles: ["barber"],
        },
        {
          to: "clientes",
          label: "Clientes",
          icon: <Users2 className="mr-2 h-4 w-4" />,
          roles: ["admin", "barber"],
        },
      ],
    },
    {
      title: "Cadastro",
      roles: ["admin"],
      items: [
        {
          to: "funcionarios",
          label: "Funcionários",
          icon: <Contact className="mr-2 h-4 w-4" />,
          roles: ["admin"],
        },
        {
          to: "servicos",
          label: "Serviços",
          icon: <Scissors className="mr-2 h-4 w-4" />,
          roles: ["admin"],
        },
        {
          to: "produtos",
          label: "Produtos",
          icon: <ShoppingCart className="mr-2 h-4 w-4" />,
          roles: ["admin"],
        },
        {
          to: "planos",
          label: "Planos",
          icon: <Package className="mr-2 h-4 w-4" />,
          roles: ["admin"],
        },
      ],
    },
    {
      title: "Configurações",
      roles: ["admin"],
      items: [
        {
          to: "configuracoes",
          label: "Minha Barbearia",
          icon: <Settings className="mr-2 h-4 w-4" />,
          roles: ["admin"],
        },
        {
          to: "checkout",
          label: "Pagamento",
          icon: <CreditCard className="mr-2 h-4 w-4" />,
          roles: ["admin"],
        },
        {
          to: "custos-operacionais",
          label: "Custos Operacionais",
          icon: <Receipt className="mr-2 h-4 w-4" />,
          roles: ["admin"],
        },
        {
          to: "recorrencia",
          label: "Recorrência",
          icon: <Repeat className="mr-2 h-4 w-4" />,
          roles: ["admin"],
        },
      ],
    },
  ];

  // Filtra seções e itens baseado na role do usuário
  const visibleSections = navSections
    .filter((section) => user?.role && section.roles.includes(user.role))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => user?.role && item.roles.includes(user.role)),
    }))
    .filter((section) => section.items.length > 0);

  // Função para calcular dias restantes do trial
  const calculateDaysRemaining = (trialEndsAt: string): number => {
    const endDate = new Date(trialEndsAt);
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const SidebarContent = () => (
    <>
      <div className="p-5 pt-3">
        <h1 className="text-2xl font-bold text-white mb-1">Painel</h1>
        <div>
          <div>
            {/* <h2 className="text-sm font-medium text-rose-400 truncate" title={barbershop!.name}>
              {barbershop!.name}
            </h2> */}
            <img src={barbershop.image} alt="Logo Barbearia" className="w-2/3" />
            {/* Botão Link de Agendamento */}
            <a
              href={`https://barbeariagendamento.com.br/${barbershop.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block"
            >
              <Button
                variant="default"
                className="w-full bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white shadow-lg"
              >
                Página de Agendamento
              </Button>
            </a>
          </div>

          {/* Indicador de Trial */}
          {barbershop.isTrial && barbershop.trialEndsAt && barbershop.accountStatus === "trial" && (
            <div className="mt-3 p-2.5 px-1 bg-amber-500/20 border border-amber-500/50 rounded-lg">
              <div className="flex items-center justify-center gap-2">
                <div className="">
                  <span className="text-sm text-amber-300 font-medium">Teste Grátis</span>
                  <span className="font-bold text-amber-400 mx-2">
                    {calculateDaysRemaining(barbershop.trialEndsAt)}
                  </span>
                  <span className="text-sm text-amber-300">
                    {calculateDaysRemaining(barbershop.trialEndsAt) === 1 ? "dia restante" : "dias restantes"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Banner de Conta Inativa */}
          {barbershop.accountStatus === "inactive" && (
            <div className="mt-3 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
              <div className="flex flex-col gap-1 text-center">
                <span className="text-xs font-bold text-red-400">CONTA DESATIVADA</span>
                <span className="text-[10px] text-red-300">
                  Você pode visualizar seus dados.
                </span>
                <span className="text-[10px] text-red-200 mt-1">
                  Entre em contato para reativar.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      <nav className="flex flex-col flex-grow px-3 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-600 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-neutral-700">
        {visibleSections.map((section, sectionIndex) => (
          <div key={section.title}>
            {/* Separador visual entre seções */}
            {sectionIndex > 0 && <div className="h-px bg-zinc-700/50 my-2" />}

            {/* Título da seção */}
            <span className="px-3 text-[12px] font-semibold text-zinc-500 uppercase tracking-wider">
              {section.title}
            </span>

            {/* Itens da seção */}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const pathToCheck = `/${barbershopSlug}/${item.to}`;
                const isActive = location.pathname === pathToCheck || (item.to === "dashboard" && location.pathname === `/${barbershopSlug}`);

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 ease-in-out
                      ${isActive
                        ? "bg-rose-600 text-white shadow-lg"
                        : "text-gray-300 hover:bg-zinc-800 hover:text-white hover:shadow-md"
                      }`}
                    onClick={() => setIsMobileSidebarOpen(false)}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-3 mt-auto">
        <Button
          variant="ghost"
          onClick={logout}
          className="w-full flex items-center justify-start px-3 py-2.5 text-sm font-medium rounded-md text-gray-400 hover:bg-red-700 hover:text-white"
        >
          <LogOut size={18} className="mr-3" />
          Sair
        </Button>
      </div>
    </>
  );

  return (
    <BarbershopAdminContext.Provider value={barbershop}>
      {/* Modal de Conta Expirada */}
      <Dialog open={showExpiredModal} onOpenChange={setShowExpiredModal}>
        <DialogContent className="sm:max-w-[500px] bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-400">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-200 rounded-full">
                <AlertTriangle className="h-6 w-6 text-amber-700" />
              </div>
              <DialogTitle className="text-2xl text-amber-900">Teste Grátis Expirado</DialogTitle>
            </div>
            <DialogDescription className="text-amber-800 text-base">
              Seu período de teste de 7 dias chegou ao fim. Você pode continuar visualizando seus dados, mas não
              poderá mais criar ou editar informações.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4">
            <div className="bg-white p-4 rounded-lg border border-amber-200">
              <h3 className="font-semibold text-amber-900 mb-2">O que você ainda pode fazer:</h3>
              <ul className="space-y-1 text-sm text-gray-700">
                <li className="flex items-center gap-2">
                  <span className="text-green-600">✓</span> Visualizar todos os seus dados
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-600">✓</span> Consultar histórico de agendamentos
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-600">✓</span> Ver relatórios e métricas
                </li>
              </ul>
            </div>

            <div className="bg-amber-200 p-4 rounded-lg border border-amber-300">
              <p className="text-sm text-amber-900 font-medium">
                Para continuar recebendo agendamentos e gerenciando sua barbearia, assine um plano agora!
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-col gap-2">
            <a
              href="https://wa.me/5548996994257?text=Olá,%20gostaria%20de%20contratar%20o%20sistema%20de%20agendamento"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full"
            >
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                <MessageSquare className="mr-2 h-4 w-4" />
                Falar com Atendente no WhatsApp
              </Button>
            </a>

            <a
              href={
                barbersCount >= 4
                  ? "https://compre.barbeariagendamento.com.br/plano-plus" // Link X - 4 ou mais barbeiros
                  : "https://compre.barbeariagendamento.com.br/plano-basico" // Link Y - 3 ou menos barbeiros
              }
              target="_blank"
              rel="noopener noreferrer"
              className="w-full"
            >
              <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                Comprar Plano Agora
              </Button>
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex min-h-screen bg-gray-100">
        <aside className="hidden lg:flex lg:flex-col lg:w-60 bg-neutral-950 text-gray-200 fixed h-full">
          <SidebarContent />
        </aside>

        {/* Sidebar para Mobile (Overlay) */}
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setIsMobileSidebarOpen(false)} aria-hidden="true" />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-neutral-950 text-gray-200 flex flex-col
                   transform transition-transform duration-300 ease-in-out lg:hidden 
                   ${isMobileSidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}
        >
          <div className="flex justify-end p-2 absolute right-0">
            <Button variant="ghost" size="icon" onClick={() => setIsMobileSidebarOpen(false)} className="text-gray-300">
              <X size={24} />
            </Button>
          </div>
          <SidebarContent />
        </aside>

        {/* Botão para Abrir Sidebar em Mobile */}
        <div className="lg:hidden fixed top-4 left-4 z-50">
          {!isMobileSidebarOpen && (
            <Button
              variant="outline"
              size="default"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="bg-zinc-900 backdrop-blur-sm shadow-md hover:bg-black/70"
              aria-label="Abrir menu"
            >
              <Menu size={24} className="text-white fill-white" color="white" fill="white" />
            </Button>
          )}
        </div>

        <main className="flex-1 p-2 lg:p-6 overflow-y-auto lg:ml-60 pt-20">
          <Outlet context={outletContextData} />
        </main>
      </div>
    </BarbershopAdminContext.Provider>
  );
}
