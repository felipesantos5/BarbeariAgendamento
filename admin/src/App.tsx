import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AdminLayout } from "./layouts/AdminLayout";
import { SuperAdminLayout } from "./layouts/SuperAdminLayout";

import { BarbeariaConfigPage } from "./pages/BarbeariaPage";
import { ServicesPage } from "./pages/ServicesPage";
import { BarberPage } from "./pages/BarberPage";
import { AgendamentosPage } from "./pages/AgendamentosPage";
import { LoginPage } from "./pages/LoginPage";
import { TrialSignupPage } from "./pages/TrialSignupPage";
import { AccountExpiredPage } from "./pages/AccountExpiredPage";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { SuperAdminProtectedRoute } from "./components/SuperAdminProtectedRoute";
import { SetPasswordPage } from "./pages/SetPasswordPage.tsx";
import { useAuth } from "./contexts/AuthContext.tsx";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.tsx";
import { AbsencesPage } from "./pages/folga.tsx";
import { NewBookingPage } from "./pages/NewBookingPage.tsx";
import { PlansPage } from "./pages/PlansPage.tsx";
import { CustomersPage } from "./pages/CustomersPage.tsx";
import { AgendamentosList } from "./pages/agendamentosList.tsx";
import { ProductManagement } from "./pages/Products.tsx";
import DashboardMetricsPage from "./pages/DashboardMetricsPage.tsx";
import { BarberPerformancePage } from "./pages/BarberPerformancePage.tsx";
import { RecurrencePage } from "./pages/RecurrencePage.tsx";
import { CheckoutConfigPage } from "./pages/CheckoutConfigPage.tsx";
import { OperationalCostsPage } from "./pages/OperationalCostsPage.tsx";
import { WhatsAppConfigPage } from "./pages/WhatsAppConfigPage";
import { SuperAdminLoginPage } from "./pages/superadmin/SuperAdminLoginPage";
import { SuperAdminDashboardPage } from "./pages/superadmin/SuperAdminDashboardPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Super Admin Routes */}
        <Route path="/superadmin/login" element={<SuperAdminLoginPage />} />
        <Route element={<SuperAdminProtectedRoute />}>
          <Route path="/superadmin" element={<SuperAdminLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<SuperAdminDashboardPage />} />
          </Route>
        </Route>

        {/* Regular Admin Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/criar-conta" element={<TrialSignupPage />} />
        <Route path="/conta-expirada" element={<AccountExpiredPage />} />
        <Route path="/configurar-senha/:token" element={<SetPasswordPage />} />
        <Route path="/resetar-senha/:token" element={<ResetPasswordPage />} />

        {/* Envolve todas as rotas do painel com uma verificação básica de login */}
        <Route element={<ProtectedRoute />}>
          <Route path="/:barbershopSlug" element={<AdminLayout />}>
            <Route index element={<DefaultPageBasedOnRole />} />

            <Route path="agendamentos" element={<AgendamentosPage />} />
            <Route path="agendamentos/lista" element={<AgendamentosList />} />
            <Route path="agendamentos/novo-agendamento" element={<NewBookingPage />} />
            <Route path="folgas" element={<AbsencesPage />} />
            <Route path="clientes" element={<CustomersPage />} />
            <Route path="metricas-barbeiro" element={<BarberPerformancePage />} />

            <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
              <Route path="metricas" element={<DashboardMetricsPage />} />
              <Route path="configuracoes" element={<BarbeariaConfigPage />} />
              <Route path="checkout" element={<CheckoutConfigPage />} />
              <Route path="servicos" element={<ServicesPage />} />
              <Route path="funcionarios" element={<BarberPage />} />
              <Route path="planos" element={<PlansPage />} />
              <Route path="produtos" element={<ProductManagement />} />
              <Route path="recorrencia" element={<RecurrencePage />} />
              <Route path="custos-operacionais" element={<OperationalCostsPage />} />
              <Route path="whatsapp" element={<WhatsAppConfigPage />} />
            </Route>

            <Route path="*" element={<>nao encontrado</>} />
          </Route>

          <Route path="/" element={null} />
        </Route>

        <Route path="*" element={<div>Erro 404 - Página Não Encontrada</div>} />
      </Routes>
    </BrowserRouter>
  );
}

// Componente auxiliar para redirecionar com base na função do usuário
function DefaultPageBasedOnRole() {
  const { user } = useAuth();

  if (user?.role === "admin") {
    // Admins são redirecionados para o dashboard (métricas)
    return <Navigate to="metricas" replace />;
  }

  // Barbeiros (e qualquer outra função) são redirecionados para os agendamentos
  return <Navigate to="agendamentos" replace />;
}
