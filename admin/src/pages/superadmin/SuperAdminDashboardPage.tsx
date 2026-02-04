import { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config/BackendUrl";
import { useSuperAdminAuth } from "@/contexts/SuperAdminAuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Store, CalendarDays, Clock, AlertCircle, RefreshCw, Trash2, Plus, Power, Ban, MoreVertical, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateBarbershopModal } from "@/components/CreateBarbershopModal";
import { ManagePlanModal } from "@/components/ManagePlanModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";


interface BarbershopData {
  _id: string;
  name: string;
  slug: string;
  accountStatus: "active" | "trial" | "inactive";
  isTrial: boolean;
  trialEndsAt: string | null;
  trialDayNumber: number | null;
  createdAt: string;
  adminEmail: string | null;
  metrics: {
    totalBookings: number;
    weeklyBookings: number;
  };
}

interface DashboardData {
  totalBarbershops: number;
  totalBookings: number;
  activeTrials: number;
  inactiveAccounts: number;
  barbershops: BarbershopData[];
}

export function SuperAdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; shop: BarbershopData | null }>({
    open: false,
    shop: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [planModal, setPlanModal] = useState<{
    open: boolean;
    barbershopId: string;
    barbershopName: string;
    subscription: any | null;
  }>({
    open: false,
    barbershopId: "",
    barbershopName: "",
    subscription: null,
  });
  const { token } = useSuperAdminAuth();

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/superadmin/barbershops-overview`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Erro ao carregar dados");
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar dados");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleDelete = async () => {
    if (!deleteModal.shop) return;

    setIsDeleting(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/superadmin/barbershops/${deleteModal.shop._id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Erro ao deletar barbearia");
      }

      setDeleteModal({ open: false, shop: null });
      fetchData(); // Recarrega os dados
    } catch (err: any) {
      alert(err.message || "Erro ao deletar barbearia");
    } finally {
      setIsDeleting(false);
    }
  };

  const [togglingStatus, setTogglingStatus] = useState<string | null>(null);

  const handleToggleStatus = async (barbershopId: string) => {
    setTogglingStatus(barbershopId);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/superadmin/barbershops/${barbershopId}/toggle-status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Erro ao alterar status da barbearia");
      }

      fetchData(); // Recarrega os dados
    } catch (err: any) {
      alert(err.message || "Erro ao alterar status da barbearia");
    } finally {
      setTogglingStatus(null);
    }
  };

  const handleManagePlan = async (barbershopId: string, barbershopName: string) => {
    try {
      // Busca assinatura existente
      const response = await fetch(
        `${API_BASE_URL}/api/superadmin/billing/subscriptions/barbershop/${barbershopId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      let subscription = null;
      if (response.ok) {
        subscription = await response.json();
      }

      setPlanModal({
        open: true,
        barbershopId,
        barbershopName,
        subscription,
      });
    } catch (err) {
      console.error("Erro ao buscar assinatura:", err);
      // Abre modal mesmo sem assinatura existente
      setPlanModal({
        open: true,
        barbershopId,
        barbershopName,
        subscription: null,
      });
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  };

  const getStatusBadge = (status: string, isTrial: boolean, trialDayNumber: number | null) => {
    if (status === "active" && !isTrial) {
      return <Badge className="bg-green-600 hover:bg-green-600">Ativo</Badge>;
    }
    if (status === "trial" && isTrial) {
      return (
        <Badge className="bg-amber-500 hover:bg-amber-500">
          Trial - Dia {trialDayNumber}/7
        </Badge>
      );
    }
    if (status === "inactive") {
      return <Badge className="bg-red-600 hover:bg-red-600">Inativo</Badge>;
    }
    return <Badge variant="secondary">{status}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400">Carregando dados...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-red-400">{error}</p>
        <Button onClick={fetchData} variant="outline">
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <div className="flex gap-2">
          <Button
            onClick={() => setCreateModalOpen(true)}
            variant="default"
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Barbearia
          </Button>
          <Button
            onClick={fetchData}
            variant="outline"
            size="sm"
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Total Barbearias
            </CardTitle>
            <Store className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{data?.totalBarbershops || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Total Agendamentos
            </CardTitle>
            <CalendarDays className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{data?.totalBookings || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Trials Ativos
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{data?.activeTrials || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Contas Inativas
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{data?.inactiveAccounts || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de barbearias */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Barbearias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-slate-700 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-slate-700/50">
                  <TableHead className="text-slate-400">Nome</TableHead>
                  <TableHead className="text-slate-400">Email Admin</TableHead>
                  <TableHead className="text-slate-400 text-center">Total</TableHead>
                  <TableHead className="text-slate-400 text-center">Semanal</TableHead>
                  <TableHead className="text-slate-400 text-center w-[160px]">Status</TableHead>
                  <TableHead className="text-slate-400">Criada em</TableHead>
                  <TableHead className="text-slate-400 text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.barbershops.map((shop) => (
                  <TableRow key={shop._id} className="border-slate-700 hover:bg-slate-700/50">
                    <TableCell className="font-medium text-white">
                      <div>
                        <div>{shop.name}</div>
                        <div className="text-xs text-slate-500">/{shop.slug}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {shop.adminEmail || <span className="text-slate-500">-</span>}
                    </TableCell>
                    <TableCell className="text-center text-slate-300">
                      {shop.metrics.totalBookings}
                    </TableCell>
                    <TableCell className="text-center text-slate-300">
                      {shop.metrics.weeklyBookings}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(shop.accountStatus, shop.isTrial, shop.trialDayNumber)}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {formatDate(shop.createdAt)}
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-white hover:bg-slate-700"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-slate-800 border-slate-700 text-white"
                        >
                          <DropdownMenuItem
                            onClick={() => handleToggleStatus(shop._id)}
                            disabled={togglingStatus === shop._id}
                            className="cursor-pointer hover:bg-slate-700 focus:bg-slate-700"
                          >
                            {togglingStatus === shop._id ? (
                              <>
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                Processando...
                              </>
                            ) : shop.accountStatus === "active" ? (
                              <>
                                <Ban className="w-4 h-4 mr-2 text-orange-400" />
                                Desativar
                              </>
                            ) : (
                              <>
                                <Power className="w-4 h-4 mr-2 text-green-400" />
                                Ativar
                              </>
                            )}
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => handleManagePlan(shop._id, shop.name)}
                            className="cursor-pointer hover:bg-slate-700 focus:bg-slate-700"
                          >
                            <DollarSign className="w-4 h-4 mr-2 text-blue-400" />
                            Gerenciar Plano
                          </DropdownMenuItem>

                          <DropdownMenuSeparator className="bg-slate-700" />

                          <DropdownMenuItem
                            onClick={() => setDeleteModal({ open: true, shop })}
                            className="cursor-pointer hover:bg-red-900/30 focus:bg-red-900/30 text-red-400"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Deletar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.barbershops || data.barbershops.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                      Nenhuma barbearia encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de confirmação de exclusão */}
      <Dialog open={deleteModal.open} onOpenChange={(open) => setDeleteModal({ open, shop: open ? deleteModal.shop : null })}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-400">Deletar Barbearia</DialogTitle>
            <DialogDescription className="text-slate-400">
              Tem certeza que deseja deletar a barbearia <strong className="text-white">{deleteModal.shop?.name}</strong>?
              <br /><br />
              <span className="text-red-400">Esta ação é irreversível e irá deletar:</span>
              <ul className="list-disc list-inside mt-2 text-slate-300">
                <li>Todos os agendamentos</li>
                <li>Todos os barbeiros</li>
                <li>Todos os serviços</li>
                <li>Todos os planos e assinaturas</li>
                <li>Todos os usuários admin</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteModal({ open: false, shop: null })}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deletando..." : "Deletar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de criação de barbearia */}
      <CreateBarbershopModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={fetchData}
      />

      {/* Modal de gerenciamento de plano */}
      <ManagePlanModal
        open={planModal.open}
        onOpenChange={(open) => setPlanModal({ ...planModal, open })}
        barbershopId={planModal.barbershopId}
        barbershopName={planModal.barbershopName}
        currentSubscription={planModal.subscription}
        onSuccess={fetchData}
        token={token || ""}
      />
    </div>
  );
}
