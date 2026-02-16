import { Outlet, NavLink } from "react-router-dom";
import { LogOut, LayoutDashboard, DollarSign, TrendingDown } from "lucide-react";
import { useSuperAdminAuth } from "@/contexts/SuperAdminAuthContext";
import { Button } from "@/components/ui/button";

export function SuperAdminLayout() {
  const { logout } = useSuperAdminAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="flex min-h-screen bg-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-800 text-gray-200 flex flex-col">
        <div className="p-5 border-b border-slate-700">
          <p className="text-2xl font-semibold text-slate-400 mt-1">Painel de controle</p>
        </div>

        <nav className="flex flex-col space-y-1 mt-4 flex-grow px-3">
          <NavLink
            to="/superadmin/dashboard"
            className={({ isActive }) =>
              `flex items-center px-3 py-2.5 text-sm font-medium rounded-md ${isActive
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:bg-slate-700 hover:text-white"
              }`
            }
          >
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </NavLink>

          <NavLink
            to="/superadmin/billing"
            className={({ isActive }) =>
              `flex items-center px-3 py-2.5 text-sm font-medium rounded-md ${isActive
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:bg-slate-700 hover:text-white"
              }`
            }
          >
            <DollarSign className="mr-2 h-4 w-4" />
            Faturamento
          </NavLink>

          <NavLink
            to="/superadmin/expenses"
            className={({ isActive }) =>
              `flex items-center px-3 py-2.5 text-sm font-medium rounded-md ${isActive
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:bg-slate-700 hover:text-white"
              }`
            }
          >
            <TrendingDown className="mr-2 h-4 w-4" />
            Despesas
          </NavLink>
        </nav>

        <div className="p-3 mt-auto border-t border-slate-700">
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full flex items-center justify-start px-3 py-2.5 text-sm font-medium rounded-md text-gray-400 hover:bg-red-700 hover:text-white"
          >
            <LogOut size={18} className="mr-3" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
