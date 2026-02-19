import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { LogOut, LayoutDashboard, DollarSign, TrendingDown, Menu, X } from "lucide-react";
import { useSuperAdminAuth } from "@/contexts/SuperAdminAuthContext";
import { Button } from "@/components/ui/button";

export function SuperAdminLayout() {
  const { logout } = useSuperAdminAuth();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  const SidebarContent = () => (
    <>
      <div className="p-5 border-b border-slate-700 flex items-center justify-between lg:block">
        <p className="text-2xl font-semibold text-slate-400 mt-1">Painel Master</p>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden text-gray-400 hover:text-white"
          onClick={() => setIsMobileSidebarOpen(false)}
        >
          <X size={24} />
        </Button>
      </div>

      <nav className="flex flex-col space-y-1 mt-4 flex-grow px-3">
        <NavLink
          to="/superadmin/dashboard"
          onClick={() => setIsMobileSidebarOpen(false)}
          className={({ isActive }) =>
            `flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${isActive
              ? "bg-blue-600 text-white shadow-lg"
              : "text-gray-400 hover:bg-slate-700 hover:text-white"
            }`
          }
        >
          <LayoutDashboard className="mr-3 h-4 w-4" />
          Dashboard
        </NavLink>

        <NavLink
          to="/superadmin/billing"
          onClick={() => setIsMobileSidebarOpen(false)}
          className={({ isActive }) =>
            `flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${isActive
              ? "bg-blue-600 text-white shadow-lg"
              : "text-gray-400 hover:bg-slate-700 hover:text-white"
            }`
          }
        >
          <DollarSign className="mr-3 h-4 w-4" />
          Faturamento
        </NavLink>

        <NavLink
          to="/superadmin/expenses"
          onClick={() => setIsMobileSidebarOpen(false)}
          className={({ isActive }) =>
            `flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${isActive
              ? "bg-blue-600 text-white shadow-lg"
              : "text-gray-400 hover:bg-slate-700 hover:text-white"
            }`
          }
        >
          <TrendingDown className="mr-3 h-4 w-4" />
          Despesas
        </NavLink>
      </nav>

      <div className="p-3 mt-auto border-t border-slate-700">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full flex items-center justify-start px-3 py-2.5 text-sm font-medium rounded-md text-gray-400 hover:bg-red-700 hover:text-white transition-colors"
        >
          <LogOut size={18} className="mr-3" />
          Sair
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-900 overflow-x-hidden">
      {/* Sidebar para Desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-800 text-gray-200 fixed inset-y-0 left-0">
        <SidebarContent />
      </aside>

      {/* Sidebar para Mobile (Overlay + Gaveta) */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-800 text-gray-200 flex flex-col transform transition-transform duration-300 ease-in-out lg:hidden ${isMobileSidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
          }`}
      >
        <SidebarContent />
      </aside>

      {/* Conteúdo Principal */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        {/* Header Mobile */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 sticky top-0 z-30">
          <p className="text-xl font-bold text-slate-300">Admin Master</p>
          <Button
            variant="ghost"
            size="icon"
            className="text-gray-400"
            onClick={() => setIsMobileSidebarOpen(true)}
          >
            <Menu size={24} />
          </Button>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

