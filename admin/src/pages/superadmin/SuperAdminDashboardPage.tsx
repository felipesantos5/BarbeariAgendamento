import { useState, useEffect } from "react";
import superAdminApiClient from "@/services/superAdminApi";
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
import {
  Store,
  CalendarDays,
  Clock,
  AlertCircle,
  RefreshCw,
  Trash2,
  Plus,
  Power,
  Ban,
  MoreVertical,
  DollarSign,
  Archive,
  ArchiveRestore,
  Loader2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CreateBarbershopModal } from "@/components/CreateBarbershopModal";
import { ManagePlanModal } from "@/components/ManagePlanModal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  isArchived: boolean;
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
  totalArchived: number;
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
  const [deleteConfirmationPassword, setDeleteConfirmationPassword] = useState("");
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");

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
  const [statusModal, setStatusModal] = useState<{ open: boolean; shop: BarbershopData | null }>({
    open: false,
    shop: null,
  });
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [trialOption, setTrialOption] = useState<string>("7");
  const [customDays, setCustomDays] = useState<string>("");
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const { token } = useSuperAdminAuth();

  const handleOpenStatusModal = (shop: BarbershopData) => {
    setTrialOption("7");
    setCustomDays("");
    // Pequeno atraso para garantir que o DropdownMenu fechou completamente
    // Isso evita conflitos de foco e scroll lock do Radix UI
    setTimeout(() => {
      setStatusModal({ open: true, shop });
    }, 100);
  };

  const handleCloseStatusModal = (isOpen: boolean) => {
    if (!isOpen) {
      setStatusModal(prev => ({ ...prev, open: false }));
      // Let the animation finish before clearing the shop data
      // This prevents the Dialog from unmounting while its backdrop/scroll-lock is active
      setTimeout(() => {
        setStatusModal(prev => ({ ...prev, shop: null }));
      }, 300);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await superAdminApiClient.get("/api/superadmin/barbershops-overview");
      setData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || "Erro ao carregar dados");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleArchive = async (shop: BarbershopData) => {
    try {
      await superAdminApiClient.patch(`/api/superadmin/barbershops/${shop._id}/archive`);
      fetchData(); // Recarrega os dados
    } catch (err: any) {
      alert(err.response?.data?.error || err.message || "Erro ao processar arquivamento");
    }
  };


  const handleCloseDeleteModal = (isOpen: boolean) => {
    if (!isOpen) {
      setDeleteModal(prev => ({ ...prev, open: false }));
      setDeleteConfirmationPassword("");
      setDeleteConfirmationName("");
      setTimeout(() => {
        setDeleteModal(prev => ({ ...prev, shop: null }));
      }, 300);
    }
  };


  const handleDelete = async () => {
    if (!deleteModal.shop) return;

    if (deleteConfirmationName !== deleteModal.shop.name) {
      alert("O nome da barbearia está incorreto. Digite exatamente como mostrado para confirmar.");
      return;
    }

    if (!deleteConfirmationPassword) {
      alert("Por favor, digite sua senha de Super Admin.");
      return;
    }

    setIsDeleting(true);
    try {
      await superAdminApiClient.delete(`/api/superadmin/barbershops/${deleteModal.shop._id}`, {
        data: { password: deleteConfirmationPassword }
      });

      handleCloseDeleteModal(false);
      fetchData(); // Recarrega os dados
    } catch (err: any) {
      alert(err.response?.data?.error || err.message || "Erro ao deletar barbearia");
    } finally {
      setIsDeleting(false);
    }
  };


  const handleUpdateStatus = async (status: string, trialDays?: number) => {
    if (!statusModal.shop) return;

    setUpdatingStatus(true);
    try {
      await superAdminApiClient.patch(
        `/api/superadmin/barbershops/${statusModal.shop._id}/status`,
        { status, trialDays }
      );

      handleCloseStatusModal(false);
      fetchData(); // Recarrega os dados
    } catch (err: any) {
      alert(err.message || "Erro ao alterar status da barbearia");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleManagePlan = async (barbershopId: string, barbershopName: string) => {
    // Pequeno atraso para fechar o dropdown antes de iniciar o loading ou abrir modal
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      // Busca assinatura existente
      const response = await superAdminApiClient.get(
        `/api/superadmin/billing/subscriptions/barbershop/${barbershopId}`
      );

      let subscription = response.data;

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

  const getStatusBadge = (status: string, isTrial: boolean, trialEndsAt: string | null) => {
    if (status === "active" && !isTrial) {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20">
          Ativo
        </Badge>
      );
    }
    if (status === "trial" && isTrial) {
      const daysRemaining = trialEndsAt ? Math.ceil((new Date(trialEndsAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0;
      return (
        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20">
          Trial - {daysRemaining > 0 ? `${daysRemaining}d` : 'Expirado'}
        </Badge>
      );
    }
    if (status === "inactive") {
      return (
        <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20">
          Inativo
        </Badge>
      );
    }
    return <Badge variant="outline" className="text-slate-400 border-slate-700">{status}</Badge>;
  };

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <div className="text-slate-400 font-medium font-sans">Carregando dados...</div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-rose-500" />
        </div>
        <div className="space-y-2">
          <p className="text-white font-bold text-lg">Erro ao carregar dados</p>
          <p className="text-slate-400 max-w-xs mx-auto text-sm">{error}</p>
        </div>
        <Button
          onClick={fetchData}
          variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800 rounded-xl"
        >
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
            className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Barbearia
          </Button>
          <Button
            onClick={fetchData}
            variant="outline"
            size="sm"
            className="bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-slate-900/40 border-slate-800/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Barbearias
            </CardTitle>
            <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400">
              <Store className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{data?.totalBarbershops || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Agendamentos
            </CardTitle>
            <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400">
              <CalendarDays className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{data?.totalBookings || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Trials Ativos
            </CardTitle>
            <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{data?.activeTrials || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Contas Inativas
            </CardTitle>
            <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-400">
              <AlertCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{data?.inactiveAccounts || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de barbearias */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-white">Barbearias</CardTitle>
          <div className="flex bg-slate-800/50 border border-slate-700 p-1 rounded-xl mr-2">
            <button
              onClick={() => setViewMode('active')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'active'
                ? 'bg-blue-500/20 text-blue-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
                }`}
            >
              <Store className="w-3.5 h-3.5" />
              Ativas
            </button>
            <button
              onClick={() => setViewMode('archived')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'archived'
                ? 'bg-amber-500/20 text-amber-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
                }`}
            >
              <Archive className="w-3.5 h-3.5" />
              Arquivadas
            </button>
          </div>
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
                {(data?.barbershops || [])
                  .filter((shop) => (viewMode === 'archived' ? shop.isArchived : !shop.isArchived))
                  .map((shop) => (
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
                        {getStatusBadge(shop.accountStatus, shop.isTrial, shop.trialEndsAt)}
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
                              onClick={() => handleOpenStatusModal(shop)}
                              className="cursor-pointer hover:bg-slate-700 focus:bg-slate-700"
                            >
                              <Power className="w-4 h-4 mr-2 text-green-400" />
                              Gerenciar Status
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
                              onClick={() => handleArchive(shop)}
                              className="cursor-pointer hover:bg-slate-700 focus:bg-slate-700"
                            >
                              {shop.isArchived ? (
                                <>
                                  <ArchiveRestore className="w-4 h-4 mr-2 text-amber-400" />
                                  Desarquivar
                                </>
                              ) : (
                                <>
                                  <Archive className="w-4 h-4 mr-2 text-amber-400" />
                                  Arquivar
                                </>
                              )}
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => {
                                setTimeout(() => {
                                  setDeleteModal({ open: true, shop });
                                }, 100);
                              }}
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
                {(data?.barbershops || []).filter((shop) =>
                  viewMode === 'archived' ? shop.isArchived : !shop.isArchived
                ).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                        {viewMode === 'archived' ? 'Nenhuma barbearia arquivada' : 'Nenhuma barbearia ativa'}
                      </TableCell>
                    </TableRow>
                  )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteModal.open} onOpenChange={handleCloseDeleteModal}>
        <DialogContent className="bg-slate-900/95 border-slate-800 text-white backdrop-blur-xl shadow-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-rose-400">
              <AlertCircle className="w-5 h-5" />
              Exclusão Permanente
            </DialogTitle>
            <DialogDescription className="text-slate-400 pt-2 leading-relaxed">
              Você está prestes a excluir <strong className="text-slate-100">{deleteModal.shop?.name}</strong>.
              Esta ação é <span className="text-rose-400 font-bold underline">irreversível</span>.
              <br /><br />
              <div className="p-3 bg-rose-500/5 border border-rose-500/10 rounded-lg">
                <span className="text-rose-400 text-xs font-semibold uppercase tracking-wider">Dados Perdidos:</span>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
                  <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-rose-500/50" /> Agendamentos</li>
                  <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-rose-500/50" /> Profissionais</li>
                  <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-rose-500/50" /> Serviços</li>
                  <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-rose-500/50" /> Faturamento</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">Digite o nome da barbearia para confirmar:</Label>
              <Input
                value={deleteConfirmationName}
                onChange={(e) => setDeleteConfirmationName(e.target.value)}
                placeholder={deleteModal.shop?.name}
                className="bg-slate-800/50 border-slate-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-400">Senha do Super Admin:</Label>
              <Input
                type="password"
                value={deleteConfirmationPassword}
                onChange={(e) => setDeleteConfirmationPassword(e.target.value)}
                placeholder="Sua senha root"
                className="bg-slate-800/50 border-slate-700 text-white"
              />
            </div>
          </div>

          <DialogFooter className="gap-3">
            <Button
              variant="ghost"
              onClick={() => handleCloseDeleteModal(false)}
              className="text-slate-500 hover:text-slate-300 hover:bg-slate-800"
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || deleteConfirmationName !== deleteModal.shop?.name || !deleteConfirmationPassword}
              className="bg-rose-500 hover:bg-rose-600 text-white border-0 shadow-lg shadow-rose-500/20"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deletando...
                </>
              ) : (
                "Deletar Permanentemente"
              )}
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
      />

      {/* Modal de Gerenciamento de Status */}
      <Dialog open={statusModal.open} onOpenChange={handleCloseStatusModal}>
        <DialogContent className="bg-slate-900/95 border-slate-800 text-white max-w-md backdrop-blur-xl shadow-2xl">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl font-bold tracking-tight">
              Gerenciar Status
              <span className="block text-sm font-normal text-slate-400 mt-1">
                {statusModal.shop?.name}
              </span>
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm leading-relaxed">
              Alterar o status operacional da barbearia ou configurar período de teste.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-6">
            <div className="space-y-4">
              <Label className="text-sm font-semibold text-white uppercase tracking-wider opacity-80">
                Status da Conta
              </Label>

              <div className="grid gap-3">
                {/* Opção Ativo */}
                <button
                  onClick={() => handleUpdateStatus("active")}
                  disabled={updatingStatus}
                  className={`flex items-start gap-4 p-4 rounded-xl border transition-all duration-200 text-left group ${statusModal.shop?.accountStatus === "active" && !statusModal.shop?.isTrial
                    ? "bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20"
                    : "bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80 hover:border-slate-600"
                    }`}
                >
                  <div className={`p-2 rounded-lg transition-colors ${statusModal.shop?.accountStatus === "active" && !statusModal.shop?.isTrial
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-slate-700/50 text-slate-400 group-hover:text-slate-300"
                    }`}>
                    <Power className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold transition-colors ${statusModal.shop?.accountStatus === "active" && !statusModal.shop?.isTrial
                      ? "text-emerald-400"
                      : "text-white"
                      }`}>
                      Ativar Mensalidade
                    </p>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Status ativo sem restrições. Ideal para clientes recorrentes.
                    </p>
                  </div>
                </button>

                {/* Seção Trial */}
                <div className={`p-4 rounded-xl border space-y-4 transition-all duration-200 ${statusModal.shop?.accountStatus === "trial"
                  ? "bg-amber-500/10 border-amber-500/30 ring-1 ring-amber-500/20"
                  : "bg-slate-800/40 border-slate-700/50"
                  }`}>
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${statusModal.shop?.accountStatus === "trial"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-slate-700/50 text-slate-400"
                      }`}>
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${statusModal.shop?.accountStatus === "trial" ? "text-amber-400" : "text-white"
                        }`}>
                        Período de Teste
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">Acesso temporário sem cobrança imediata.</p>
                    </div>
                  </div>

                  <div className="space-y-4 pl-11">
                    <RadioGroup value={trialOption} onValueChange={setTrialOption} className="grid grid-cols-2 gap-2">
                      {["7", "14", "30"].map((days) => (
                        <Label
                          key={days}
                          className={`flex items-center space-x-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${trialOption === days
                            ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                            : "bg-slate-800/40 border-slate-700/50 text-slate-300 hover:border-slate-600"
                            }`}
                        >
                          <RadioGroupItem value={days} id={`t${days}`} className="border-slate-600 text-amber-500" />
                          <span className="text-xs font-semibold">{days} Dias</span>
                        </Label>
                      ))}
                      <Label
                        className={`flex items-center space-x-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${trialOption === "custom"
                          ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                          : "bg-slate-800/40 border-slate-700/50 text-slate-300 hover:border-slate-600"
                          }`}
                      >
                        <RadioGroupItem value="custom" id="tcustom" className="border-slate-600 text-amber-500" />
                        <span className="text-xs font-semibold">Outro</span>
                      </Label>
                    </RadioGroup>

                    {trialOption === "custom" && (
                      <Input
                        type="number"
                        placeholder="Nº de dias"
                        value={customDays}
                        onChange={(e) => setCustomDays(e.target.value)}
                        className="bg-slate-800/40 border-slate-700/50 text-white h-11 focus:ring-amber-500/20 rounded-xl"
                      />
                    )}

                    <Button
                      onClick={() => handleUpdateStatus("trial", trialOption === "custom" ? parseInt(customDays) : parseInt(trialOption))}
                      disabled={updatingStatus}
                      className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 h-11 text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
                    >
                      {updatingStatus ? "Processando..." : "Confirmar Trial"}
                    </Button>
                  </div>
                </div>

                {/* Opção Inativo */}
                <button
                  onClick={() => handleUpdateStatus("inactive")}
                  disabled={updatingStatus}
                  className={`flex items-start gap-4 p-4 rounded-xl border transition-all duration-200 text-left group ${statusModal.shop?.accountStatus === "inactive"
                    ? "bg-rose-500/10 border-rose-500/30 ring-1 ring-rose-500/20"
                    : "bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80 hover:border-slate-600"
                    }`}
                >
                  <div className={`p-2 rounded-lg transition-colors ${statusModal.shop?.accountStatus === "inactive"
                    ? "bg-rose-500/20 text-rose-400"
                    : "bg-slate-700/50 text-slate-400 group-hover:text-rose-400/70"
                    }`}>
                    <Ban className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold transition-colors ${statusModal.shop?.accountStatus === "inactive"
                      ? "text-rose-400"
                      : "text-white"
                      }`}>
                      Desativar Conta
                    </p>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Suspende imediatamente o acesso administrativo desta barbearia.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-800/50 pt-4">
            <Button
              variant="ghost"
              onClick={() => handleCloseStatusModal(false)}
              className="text-white/60 hover:text-white hover:bg-slate-800/50 px-8 h-11 rounded-xl transition-colors font-medium"
              disabled={updatingStatus}
            >
              Fechar Painel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
