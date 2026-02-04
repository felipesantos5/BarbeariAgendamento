import { useEffect, useState, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import apiClient from "@/services/api";
import { toast } from "sonner";
import axios from "axios";
import { Barbershop, Barber } from "@/types/barberShop";
import { Loader2 } from "lucide-react";
import { CategoryTabs } from "@/components/CategoryTabs";
import { BookingPane } from "./sections/BookingPane";
import { ShopHeader } from "@/components/ShopHeader/ShopHeader";
import { ReviewsPane } from "./sections/ReviewsPane";
import { ShopInfo } from "@/components/ShopInfo";
import { PlansPane } from "./sections/PlansPane";
import { Plan } from "@/types/plans";
import { CustomerProductsPage } from "./sections/Products";
import { ProductsApiResponse } from "@/types/Products";
import { Service } from "@/types/Service";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useMetaTags } from "@/hooks/useMetaTags";

export type Tab = {
  id: string;
  label: string;
};

// Tipo para controlar a aba ativa
type TabId = "agendamento" | "avaliacoes" | "planos" | "products";

export function Loja() {
  const { slug } = useParams<{ slug: string }>();

  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [allBarbers, setAllBarbers] = useState<Barber[]>([]);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [products, setProducts] = useState<ProductsApiResponse[]>([]);

  const [activeTab, setActiveTab] = useState<TabId>("agendamento");
  const [isLoading, setIsLoading] = useState(true);

  const bookingSectionRef = useRef<HTMLDivElement>(null);

  // Atualizar título da página dinamicamente
  useDocumentTitle(
    barbershop
      ? `${barbershop.name} - Agendamento Online`
      : "Barbearia Agendamento - Sistema de Agendamento Online"
  );

  // Atualizar meta tags para compartilhamento correto em redes sociais
  useMetaTags({
    title: barbershop
      ? `${barbershop.name} - Agendamento Online`
      : "Barbearia Agendamento - Sistema de Agendamento Online",
    description: barbershop?.description || "Agende seu horário na barbearia de forma online. Rápido, prático e seguro.",
    image: barbershop?.logoUrl || "https://www.barbeariagendamento.com.br/logo.jpg",
    url: slug ? `https://www.barbeariagendamento.com.br/${slug}` : "https://www.barbeariagendamento.com.br",
    type: "website"
  });

  useEffect(() => {
    if (!slug) {
      setIsLoading(false);
      return;
    }

    const fetchAllData = async () => {
      try {
        setIsLoading(true);
        const barbershopResponse = await apiClient.get(`/barbershops/slug/${slug}`);
        const currentBarbershop = barbershopResponse.data;

        if (!currentBarbershop) {
          throw new Error("Barbearia não encontrada");
        }

        setBarbershop(currentBarbershop);
        document.title = `Agendar em ${currentBarbershop.name}`;

        if (currentBarbershop.themeColor) {
          document.documentElement.style.setProperty("--loja-theme-color", currentBarbershop.themeColor);
        }

        const [servicesResponse, barbersResponse, plansResponse, productsResponse] = await Promise.all([
          apiClient.get(`/barbershops/${currentBarbershop._id}/services`),
          apiClient.get(`/barbershops/${currentBarbershop._id}/barbers`),
          apiClient.get(`/api/barbershops/${currentBarbershop._id}/plans`),
          apiClient.get(`/api/barbershops/${currentBarbershop._id}/products`),
        ]);

        setAllServices(Array.isArray(servicesResponse.data) ? servicesResponse.data : []);
        setAllBarbers(Array.isArray(barbersResponse.data) ? barbersResponse.data : []);
        setPlans(Array.isArray(plansResponse.data) ? plansResponse.data : []);
        setProducts(productsResponse.data?.products || []);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          window.location.replace("https://compre.barbeariagendamento.com.br");
        } else {
          console.error("Erro ao carregar dados da barbearia:", error);
          toast.error("Não foi possível carregar os dados da barbearia.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData();
  }, [slug]);

  const visibleTabs = useMemo(() => {
    // Abas que sempre aparecem
    const tabs: Tab[] = [
      { id: "agendamento", label: "Serviços" },
      { id: "avaliacoes", label: "Avaliações" },
    ];

    // Adiciona a aba 'Planos' condicionalmente
    if (plans && plans.length > 0) {
      tabs.push({ id: "planos", label: "Planos" });
    }

    // Adiciona a aba 'Produtos' condicionalmente
    if (products && products.length > 0) {
      tabs.push({ id: "products", label: "Produtos" });
    }

    return tabs;
  }, [plans, products]);

  const handleBookNowClick = () => {
    setActiveTab("agendamento");

    setTimeout(() => {
      bookingSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-gray-700" />
      </div>
    );
  }

  if (!barbershop) {
    return <div className="flex h-screen items-center justify-center">Ocorreu um erro ao carregar esta página.</div>;
  }

  return (
    <div className="bg-background dark:bg-gray-950">
      <div className="max-w-4xl mx-auto">
        <ShopHeader barbershop={barbershop} onBookNowClick={handleBookNowClick} />

        <CategoryTabs activeTab={activeTab} onTabChange={setActiveTab} tabs={visibleTabs} />

        <main>
          <div ref={bookingSectionRef}>
            {activeTab === "agendamento" && (
              <>
                {barbershop?.accountStatus === "inactive" ? (
                  <div className="mx-4 my-8 p-6 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex flex-col items-center text-center space-y-3">
                      <div className="text-3xl">😔</div>
                      <h2 className="text-xl font-bold text-red-700">Agendamentos Temporariamente Indisponíveis</h2>
                      <p className="text-sm text-red-600">
                        O período de teste gratuito desta barbearia expirou.
                      </p>
                      <p className="text-sm text-gray-600">
                        A barbearia está temporariamente impossibilitada de receber novos agendamentos.
                      </p>
                      <div className="mt-4 p-3 bg-white rounded-md border border-red-200">
                        <p className="text-xs text-gray-700">
                          Se você é o proprietário desta barbearia, entre em contato conosco para reativar sua conta.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <BookingPane barbershop={barbershop} allServices={allServices} allBarbers={allBarbers} />
                )}
              </>
            )}
          </div>

          {activeTab === "avaliacoes" && barbershop && <ReviewsPane barbershopId={barbershop._id} />}

          {activeTab === "planos" && barbershop && <PlansPane barbershopId={barbershop._id} barbershopSlug={barbershop.slug} />}

          {activeTab === "products" && <CustomerProductsPage />}
        </main>
        {barbershop && <ShopInfo barbershop={barbershop} availability={barbershop.workingHours} />}
      </div>
    </div>
  );
}
