// src/pages/Products.tsx
import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Filter,
  AlertTriangle,
  MoreHorizontal,
  Edit,
  Package,
  Trash2,
  Loader2,
  BadgePercent,
  History,
  TrendingUp,
  TrendingDown,
  PackageMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ImageUploader } from "../components/ImageUploader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

import { API_BASE_URL } from "@/config/BackendUrl";
import { useOutletContext } from "react-router-dom";
import apiClient from "@/services/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Product } from "@/types/product"; // Importa o tipo atualizado

interface AdminOutletContext {
  barbershopId: string;
  barbershopName: string;
}

interface Barber {
  _id: string;
  name: string;
}

interface StockMovement {
  _id: string;
  product: {
    _id: string;
    name: string;
  };
  type: "entrada" | "saida" | "ajuste" | "perda" | "venda";
  quantity: number;
  reason?: string;
  unitCost?: number;
  totalCost?: number;
  barber?: {
    _id: string;
    name: string;
  };
  notes?: string;
  createdAt: string;
}

export const ProductManagement = () => {
  const { barbershopId } = useOutletContext<AdminOutletContext>();

  const [products, setProducts] = useState<Product[]>([]);
  const [allBarbers, setAllBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: "",
    category: "all",
    status: "ativo",
    lowStock: false,
  });

  // Estados para histórico de estoque
  const [activeTab, setActiveTab] = useState("produtos");
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const currentYear = new Date().getFullYear();
  const currentMonth = (new Date().getMonth() + 1).toString();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [movementFilters, setMovementFilters] = useState({
    type: "all",
    product: "all",
  });

  // Modals
  const [productModal, setProductModal] = useState(false);
  const [stockModal, setStockModal] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Form states
  interface ProductForm {
    name: string;
    brand: string;
    category: string;
    description: string;
    price: { purchase: number; sale: number };
    stock: { current: number; minimum: number; maximum?: number };
    status: "ativo" | "inativo" | "descontinuado";
    image: string;
    commissionRate?: number;
  }

  const [productForm, setProductForm] = useState<ProductForm>({
    name: "",
    brand: "",
    category: "",
    description: "",
    price: { purchase: 0, sale: 0 },
    stock: { current: 0, minimum: 5, maximum: 0 },
    status: "ativo",
    image: "",
    commissionRate: undefined,
  });
  const [productImageFile, setProductImageFile] = useState<File | null>(null);

  const [stockForm, setStockForm] = useState({
    type: "entrada",
    quantity: 1,
    reason: "",
    unitCost: 0,
    notes: "",
    barberId: "", // Mantém como "" para o placeholder funcionar
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // API Calls
  const fetchPageData = useCallback(async () => {
    if (!barbershopId) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.search) params.append("search", filters.search);
      if (filters.category !== "all") params.append("category", filters.category);
      if (filters.status !== "all") params.append("status", filters.status);
      if (filters.lowStock) params.append("lowStock", "true");

      const productsUrl = `${API_BASE_URL}/api/barbershops/${barbershopId}/products?${params}`;
      const barbersUrl = `${API_BASE_URL}/barbershops/${barbershopId}/barbers`;

      const [productsRes, barbersRes] = await Promise.all([apiClient.get(productsUrl), apiClient.get(barbersUrl)]);

      setProducts(productsRes.data.products);
      setAllBarbers(barbersRes.data);
    } catch (error) {
      toast.error("Erro ao carregar dados da página");
    } finally {
      setLoading(false);
    }
  }, [barbershopId, filters]);

  const fetchStockMovements = useCallback(async () => {
    if (!barbershopId) return;
    try {
      setLoadingMovements(true);

      // Calcula o intervalo de datas baseado no mês/ano selecionado
      const year = parseInt(selectedYear);
      const month = parseInt(selectedMonth) - 1; // JavaScript months are 0-indexed
      const startDate = startOfMonth(new Date(year, month));
      const endDate = endOfMonth(new Date(year, month));

      const params = new URLSearchParams();
      params.append("startDate", format(startDate, "yyyy-MM-dd"));
      params.append("endDate", format(endDate, "yyyy-MM-dd"));

      if (movementFilters.type !== "all") params.append("type", movementFilters.type);
      if (movementFilters.product !== "all") params.append("productId", movementFilters.product);

      const url = `${API_BASE_URL}/api/barbershops/${barbershopId}/products/stock-movements?${params}`;
      const response = await apiClient.get(url);
      setStockMovements(response.data);
    } catch (error) {
      toast.error("Erro ao carregar histórico de estoque");
    } finally {
      setLoadingMovements(false);
    }
  }, [barbershopId, movementFilters, selectedYear, selectedMonth]);

  // Validations
  const validateProduct = () => {
    const newErrors: Record<string, string> = {};

    if (!productForm.name.trim()) newErrors.name = "Nome é obrigatório";
    if (!productForm.category) newErrors.category = "Categoria é obrigatória";
    if (productForm.price.purchase < 0) newErrors.purchasePrice = "Preço de compra deve ser positivo";
    if (productForm.price.sale < 0) newErrors.salePrice = "Preço de venda deve ser positivo";
    if (productForm.stock.current < 0) newErrors.currentStock = "Estoque atual deve ser positivo";
    if (productForm.stock.minimum < 0) newErrors.minimumStock = "Estoque mínimo deve ser positivo";

    if (productForm.commissionRate && (productForm.commissionRate < 0 || productForm.commissionRate > 100)) {
      newErrors.commissionRate = "Comissão deve ser entre 0 e 100";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStock = () => {
    const newErrors: Record<string, string> = {};

    if (stockForm.quantity <= 0) newErrors.quantity = "Quantidade deve ser maior que zero";
    if (stockForm.unitCost < 0) newErrors.unitCost = "Custo unitário deve ser positivo";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const saveProduct = async () => {
    if (!validateProduct()) return;

    setSubmitting(true);
    let finalImageUrl = productForm.image || "";

    try {
      if (productImageFile) {
        setIsUploadingImage(true);
        const imageFormData = new FormData();
        imageFormData.append("productImageFile", productImageFile);

        try {
          const uploadResponse = await apiClient.post(`${API_BASE_URL}/api/upload/product-image`, imageFormData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          finalImageUrl = uploadResponse.data.imageUrl;
          setProductImageFile(null);
        } catch (uploadError: any) {
          console.error("Erro no upload da imagem:", uploadError);
          toast.error(uploadError.response?.data?.error || "Falha ao fazer upload da imagem.");
          setIsUploadingImage(false);
          setSubmitting(false);
          return;
        } finally {
          setIsUploadingImage(false);
        }
      }

      const productDataPayload = {
        ...productForm,
        image: finalImageUrl,
        _id: selectedProduct?._id,
        commissionRate: productForm.commissionRate ? Number(productForm.commissionRate) : undefined,
      };
      const { _id, ...payloadWithoutId } = productDataPayload;

      if (selectedProduct) {
        await apiClient.put(`${API_BASE_URL}/api/barbershops/${barbershopId}/products/${selectedProduct._id}`, payloadWithoutId);
        toast.success("Produto atualizado");
      } else {
        await apiClient.post(`${API_BASE_URL}/api/barbershops/${barbershopId}/products`, payloadWithoutId);
        toast.success("Produto criado");
      }

      setProductModal(false);
      resetProductForm();
      fetchPageData();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || "Erro ao salvar produto";
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteProduct = async () => {
    if (!selectedProduct) return;

    try {
      setSubmitting(true);
      await apiClient.delete(`${API_BASE_URL}/api/barbershops/${barbershopId}/products/${selectedProduct._id}`);

      toast.success("Produto deletado");
      setDeleteDialog(false);
      setSelectedProduct(null);
      fetchPageData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Erro ao deletar produto");
    } finally {
      setSubmitting(false);
    }
  };

  const moveStock = async () => {
    if (!validateStock() || !selectedProduct) return;

    try {
      setSubmitting(true);

      const payload: any = {
        type: stockForm.type,
        quantity: stockForm.quantity,
        reason: stockForm.reason,
        unitCost: stockForm.unitCost,
        notes: stockForm.notes,
      };

      // ✅ *** CORREÇÃO APLICADA AQUI ***
      // Envia o barberId APENAS se ele for selecionado e não for a string "none"
      if (stockForm.type === "venda" && stockForm.barberId && stockForm.barberId !== "none") {
        payload.barberId = stockForm.barberId;
      }

      await apiClient.post(`${API_BASE_URL}/api/barbershops/${barbershopId}/products/${selectedProduct._id}/stock`, payload);

      toast.success("Estoque movimentado");
      setStockModal(false);
      resetStockForm();
      fetchPageData();
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || "Erro ao movimentar estoque";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Form helpers
  const resetProductForm = () => {
    setProductForm({
      name: "",
      brand: "",
      category: "",
      description: "",
      price: { purchase: 0, sale: 0 },
      stock: { current: 0, minimum: 5, maximum: 0 },
      status: "ativo",
      image: "",
      commissionRate: undefined,
    });
    setProductImageFile(null);
    setSelectedProduct(null);
    setErrors({});
  };

  const resetStockForm = () => {
    setStockForm({
      type: "entrada",
      quantity: 1,
      reason: "",
      unitCost: 0,
      notes: "",
      barberId: "", // Reseta para "" (string vazia) para mostrar o placeholder
    });
    setSelectedProduct(null);
    setErrors({});
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (barbershopId) fetchPageData();
    }, 500);
    return () => clearTimeout(timer);
  }, [filters, barbershopId, fetchPageData]);

  useEffect(() => {
    if (activeTab === "historico" && barbershopId) {
      fetchStockMovements();
    }
  }, [activeTab, barbershopId, movementFilters, fetchStockMovements]);

  const openProductModal = (product?: Product) => {
    if (product) {
      setSelectedProduct(product);
      setProductForm({
        name: product.name,
        brand: product.brand || "",
        category: product.category,
        description: product.description || "",
        price: product.price,
        stock: {
          current: product.stock.current,
          minimum: product.stock.minimum,
          maximum: product.stock.maximum || 0,
        },
        status: product.status,
        image: product.image || "",
        commissionRate: product.commissionRate || undefined,
      });
      setProductImageFile(null);
    } else {
      resetProductForm();
    }
    setErrors({});
    setProductModal(true);
  };

  const openStockModal = (product: Product) => {
    setSelectedProduct(product);
    setStockForm({
      type: "entrada",
      quantity: 1,
      reason: "",
      unitCost: product.price.purchase,
      notes: "",
      barberId: "", // Inicia com "" para o placeholder
    });
    setErrors({});
    setStockModal(true);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  const lowStockCount = products.filter((p) => p.isLowStock).length;

  const getCommissionDisplay = (product: Product) => {
    if (product.commissionRate && product.commissionRate > 0) {
      return (
        <Badge variant="outline" className="gap-1">
          <BadgePercent className="h-3 w-3" />
          {product.commissionRate}%
        </Badge>
      );
    }
    return <span className="text-xs text-muted-foreground">--</span>;
  };

  return (
    <div className="space-y-6">
      {lowStockCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            <span className="font-medium text-orange-800">
              {lowStockCount} produto{lowStockCount > 1 ? "s" : ""} com estoque baixo
            </span>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
            <div>
              <CardTitle>Produtos</CardTitle>
              <CardDescription>
                Gerencie o estoque da sua barbearia
              </CardDescription>
            </div>
            <Button onClick={() => openProductModal()}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Produto
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-2xl grid-cols-2 mb-8 h-14 p-1.5 bg-muted/50">
              <TabsTrigger
                value="produtos"
                className="gap-2.5 text-base font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
              >
                <Package className="w-5 h-5" />
                Produtos
              </TabsTrigger>
              <TabsTrigger
                value="historico"
                className="gap-2.5 text-base font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
              >
                <History className="w-5 h-5" />
                Histórico de Estoque
              </TabsTrigger>
            </TabsList>

            <TabsContent value="produtos" className="mt-0">
              <div className="space-y-4">
                {/* Header com contagem */}
                <div>
                  <p className="text-sm text-muted-foreground">
                    {products.length} produto{products.length !== 1 ? "s" : ""} encontrado{products.length !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Filtros */}
                <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar produtos..."
                      className="pl-10"
                      value={filters.search}
                      onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                    />
                  </div>

                  <Select value={filters.category} onValueChange={(value) => setFilters((prev) => ({ ...prev, category: value }))}>
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue placeholder="Todas Categorias" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas Categorias</SelectItem>
                      <SelectItem value="pomada">Pomada</SelectItem>
                      <SelectItem value="gel">Gel</SelectItem>
                      <SelectItem value="shampoo">Shampoo</SelectItem>
                      <SelectItem value="condicionador">Condicionador</SelectItem>
                      <SelectItem value="minoxidil">Minoxidil</SelectItem>
                      <SelectItem value="oleo">Óleo</SelectItem>
                      <SelectItem value="cera">Cera</SelectItem>
                      <SelectItem value="spray">Spray</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filters.status} onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                      <SelectItem value="descontinuado">Descontinuado</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    onClick={() => setFilters((prev) => ({ ...prev, lowStock: !prev.lowStock }))}
                    className={filters.lowStock ? "bg-orange-50 border-orange-300" : ""}
                  >
                    <Filter className="w-4 h-4 mr-2" />
                    Baixo Estoque
                  </Button>
                </div>
              </div>

              {/* Tabela */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="pl-12 md:px-2">Estoque</TableHead>
                      <TableHead>Preços</TableHead>
                      <TableHead>Comissão</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12 text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                        </TableCell>
                      </TableRow>
                    ) : products.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum produto encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      products.map((product) => (
                        <TableRow key={product._id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {product.image ? (
                                <img src={product.image} alt={product.name} className="h-10 w-10 rounded object-cover" />
                              ) : (
                                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-muted-foreground">
                                  <Package className="h-5 w-5" />
                                </div>
                              )}
                              <div>
                                <div className="font-medium">{product.name}</div>
                                {product.brand && <div className="text-sm text-muted-foreground">{product.brand}</div>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="pl-12 md:px-2">
                            <div className="space-y-1 sm:text-left">
                              {product.isLowStock ? (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  {product.stock.current}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">{product.stock.current}</Badge>
                              )}
                              <div className="text-xs text-muted-foreground">Mín: {product.stock.minimum}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-right sm:text-left">
                              <div>Venda: {formatCurrency(product.price.sale)}</div>
                              <div className="text-muted-foreground">Compra: {formatCurrency(product.price.purchase)}</div>
                              <div className="text-xs text-green-600">Margem: {product.profitMargin ? product.profitMargin.toFixed(1) + "%" : "--"}</div>
                            </div>
                          </TableCell>
                          <TableCell>{getCommissionDisplay(product)}</TableCell>
                          <TableCell className="text-center sm:text-left">
                            <Badge
                              variant={product.status === "ativo" ? "default" : product.status === "inativo" ? "secondary" : "outline"}
                              className={product.status === "ativo" ? "bg-green-100 text-green-800 border-green-200" : ""}
                            >
                              {product.status.charAt(0).toUpperCase() + product.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openProductModal(product)}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openStockModal(product)}>
                                  <Package className="w-4 h-4 mr-2" />
                                  Movimentar Estoque
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedProduct(product);
                                    setDeleteDialog(true);
                                  }}
                                  className="text-red-600 focus:bg-red-50 focus:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Deletar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="historico" className="mt-0">
              <div className="space-y-4">
                {/* Header com Título e Filtros */}
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Histórico de Movimentações</h3>
                    <p className="text-sm text-muted-foreground">
                      {stockMovements.length} movimentaç{stockMovements.length !== 1 ? "ões" : "ão"} em{" "}
                      {["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][parseInt(selectedMonth) - 1]} de {selectedYear}
                    </p>
                  </div>

                  {/* Filtros */}
                  <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger className="w-full sm:w-[150px]">
                        <SelectValue placeholder="Mês" />
                      </SelectTrigger>
                      <SelectContent>
                        {["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"].map((name, index) => (
                          <SelectItem key={index} value={(index + 1).toString()}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger className="w-full sm:w-[120px]">
                        <SelectValue placeholder="Ano" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 5 }, (_, i) => (currentYear - 2 + i).toString()).map((year) => (
                          <SelectItem key={year} value={year}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={movementFilters.product} onValueChange={(value) => setMovementFilters((prev) => ({ ...prev, product: value }))}>
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Todos os produtos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os produtos</SelectItem>
                        {products.map((product) => (
                          <SelectItem key={product._id} value={product._id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={movementFilters.type} onValueChange={(value) => setMovementFilters((prev) => ({ ...prev, type: value }))}>
                      <SelectTrigger className="w-full sm:w-[150px]">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="entrada">Entrada</SelectItem>
                        <SelectItem value="saida">Saída</SelectItem>
                        <SelectItem value="venda">Venda</SelectItem>
                        <SelectItem value="ajuste">Ajuste</SelectItem>
                        <SelectItem value="perda">Perda</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Tabela */}
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-center">Quantidade</TableHead>
                        <TableHead>Custo/Valor</TableHead>
                        <TableHead>Barbeiro</TableHead>
                        <TableHead>Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingMovements ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8">
                            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                          </TableCell>
                        </TableRow>
                      ) : stockMovements.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            Nenhuma movimentação encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        stockMovements.map((movement) => (
                          <TableRow key={movement._id}>
                            <TableCell className="font-medium">
                              {format(new Date(movement.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </TableCell>
                            <TableCell>{movement.product?.name || "Produto removido"}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  movement.type === "entrada"
                                    ? "default"
                                    : movement.type === "venda"
                                      ? "secondary"
                                      : movement.type === "saida"
                                        ? "destructive"
                                        : "outline"
                                }
                                className={`gap-1 ${movement.type === "entrada"
                                  ? "bg-green-100 text-green-800 border-green-200"
                                  : movement.type === "venda"
                                    ? "bg-blue-100 text-blue-800 border-blue-200"
                                    : ""
                                  }`}
                              >
                                {movement.type === "entrada" && <TrendingUp className="w-3 h-3" />}
                                {movement.type === "saida" && <TrendingDown className="w-3 h-3" />}
                                {movement.type === "venda" && <PackageMinus className="w-3 h-3" />}
                                {movement.type === "ajuste" && <Package className="w-3 h-3" />}
                                {movement.type === "perda" && <AlertTriangle className="w-3 h-3" />}
                                {movement.type.charAt(0).toUpperCase() + movement.type.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <span
                                className={`font-semibold ${movement.type === "entrada" ? "text-green-600" : movement.type === "saida" || movement.type === "venda" || movement.type === "perda" ? "text-red-600" : ""
                                  }`}
                              >
                                {movement.type === "entrada" ? "+" : "-"}
                                {movement.quantity}
                              </span>
                            </TableCell>
                            <TableCell>
                              {movement.totalCost ? formatCurrency(movement.totalCost) : movement.unitCost ? formatCurrency(movement.unitCost) : "--"}
                            </TableCell>
                            <TableCell>{movement.barber?.name || "--"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {movement.reason || movement.notes || "--"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Modal Produto (Atualizado) */}
      <Dialog open={productModal} onOpenChange={setProductModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedProduct ? "Editar Produto" : "Novo Produto"}</DialogTitle>
            <DialogDescription>{selectedProduct ? "Atualize os detalhes do produto." : "Preencha as informações do novo produto."}</DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-grow pr-6 -mr-6 overflow-y-scroll">
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label>Imagem do Produto</Label>
                <ImageUploader initialImageUrl={productForm.image || null} onFileSelect={setProductImageFile} aspectRatio="square" />
                {isUploadingImage && <p className="text-sm text-blue-500">Enviando imagem...</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={productForm.name}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Nome do produto"
                  />
                  {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand">Marca</Label>
                  <Input
                    id="brand"
                    value={productForm.brand}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        brand: e.target.value,
                      }))
                    }
                    placeholder="Marca"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Categoria *</Label>
                  <Select value={productForm.category} onValueChange={(value) => setProductForm((prev) => ({ ...prev, category: value }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pomada">Pomada</SelectItem>
                      <SelectItem value="gel">Gel</SelectItem>
                      <SelectItem value="shampoo">Shampoo</SelectItem>
                      <SelectItem value="condicionador">Condicionador</SelectItem>
                      <SelectItem value="minoxidil">Minoxidil</SelectItem>
                      <SelectItem value="oleo">Óleo</SelectItem>
                      <SelectItem value="cera">Cera</SelectItem>
                      <SelectItem value="spray">Spray</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.category && <p className="text-sm text-red-500">{errors.category}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status *</Label>
                  <Select
                    value={productForm.status}
                    onValueChange={(value: "ativo" | "inativo" | "descontinuado") => setProductForm((prev) => ({ ...prev, status: value }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                      <SelectItem value="descontinuado">Descontinuado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* ✅ NOVO CAMPO DE COMISSÃO */}
                <div className="space-y-2">
                  <Label htmlFor="commissionRate">Comissão (%)</Label>
                  <Input
                    id="commissionRate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={productForm.commissionRate || ""}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        commissionRate: e.target.value === "" ? undefined : parseFloat(e.target.value),
                      }))
                    }
                    placeholder="Ex: 15"
                  />
                  {errors.commissionRate && <p className="text-sm text-red-500">{errors.commissionRate}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={productForm.description}
                  onChange={(e) =>
                    setProductForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Descrição do produto"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="purchasePrice">Preço de Compra *</Label>
                  <Input
                    id="purchasePrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={productForm.price.purchase}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        price: {
                          ...prev.price,
                          purchase: parseFloat(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                  {errors.purchasePrice && <p className="text-sm text-red-500">{errors.purchasePrice}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salePrice">Preço de Venda *</Label>
                  <Input
                    id="salePrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={productForm.price.sale}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        price: {
                          ...prev.price,
                          sale: parseFloat(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                  {errors.salePrice && <p className="text-sm text-red-500">{errors.salePrice}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currentStock">Estoque Atual *</Label>
                  <Input
                    id="currentStock"
                    type="number"
                    min="0"
                    value={productForm.stock.current}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        stock: {
                          ...prev.stock,
                          current: parseInt(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                  {errors.currentStock && <p className="text-sm text-red-500">{errors.currentStock}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minimumStock">Estoque Mínimo *</Label>
                  <Input
                    id="minimumStock"
                    type="number"
                    min="0"
                    value={productForm.stock.minimum}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        stock: {
                          ...prev.stock,
                          minimum: parseInt(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                  {errors.minimumStock && <p className="text-sm text-red-500">{errors.minimumStock}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maximumStock">Estoque Máximo</Label>
                  <Input
                    id="maximumStock"
                    type="number"
                    min="0"
                    value={productForm.stock.maximum || ""}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        stock: {
                          ...prev.stock,
                          maximum: e.target.value === "" ? undefined : parseInt(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Sticky Footer */}
          <DialogFooter className="pt-4 border-t flex-shrink-0">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={saveProduct} disabled={submitting || isUploadingImage}>
              {(submitting || isUploadingImage) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isUploadingImage ? "Enviando Imagem..." : submitting ? "Salvando..." : selectedProduct ? "Atualizar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Estoque (Atualizado) */}
      <Dialog open={stockModal} onOpenChange={setStockModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Movimentar Estoque</DialogTitle>
            <DialogDescription>Ajuste a quantidade em estoque do produto selecionado.</DialogDescription>
          </DialogHeader>

          {selectedProduct && (
            <div className="bg-muted/50 p-4 rounded-lg my-4 border">
              <div className="flex items-center gap-3">
                {selectedProduct.image ? (
                  <img src={selectedProduct.image} alt={selectedProduct.name} className="h-12 w-12 rounded object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded bg-muted flex items-center justify-center text-muted-foreground">
                    <Package className="h-6 w-6" />
                  </div>
                )}
                <div>
                  <h3 className="font-medium">{selectedProduct.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedProduct.brand}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm">Estoque atual:</span>
                    <Badge variant="outline">{selectedProduct.stock.current}</Badge>
                    {selectedProduct.commissionRate && (
                      <Badge variant="outline" className="gap-1">
                        <BadgePercent className="h-3 w-3" />
                        {selectedProduct.commissionRate}%
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="stockType">Tipo *</Label>
              <Select
                value={stockForm.type}
                onValueChange={(value: "entrada" | "saida" | "ajuste" | "perda" | "venda") => setStockForm((prev) => ({ ...prev, type: value }))}
              >
                <SelectTrigger id="stockType" className="w-full">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada (Compra)</SelectItem>
                  <SelectItem value="venda">Venda (Saída)</SelectItem>
                  <SelectItem value="perda">Perda (Saída)</SelectItem>
                  <SelectItem value="ajuste">Ajuste Manual</SelectItem>
                  <SelectItem value="saida">Saída (Outro)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantidade *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={stockForm.quantity}
                onChange={(e) =>
                  setStockForm((prev) => ({
                    ...prev,
                    quantity: parseInt(e.target.value) || 1,
                  }))
                }
              />
              {errors.quantity && <p className="text-sm text-red-500">{errors.quantity}</p>}
            </div>

            {/* ✅ NOVO CAMPO CONDICIONAL PARA BARBEIRO */}
            {stockForm.type === "venda" && selectedProduct?.commissionRate && selectedProduct.commissionRate > 0 && (
              <div className="space-y-2">
                <Label htmlFor="barberId">Associar Venda ao Barbeiro (Comissão)</Label>
                <Select
                  value={stockForm.barberId} // O valor é a string vazia ou o ID
                  onValueChange={(value) => setStockForm((prev) => ({ ...prev, barberId: value }))}
                >
                  <SelectTrigger id="barberId" className="w-full">
                    <SelectValue placeholder="Selecione um barbeiro (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* ✅ *** CORREÇÃO APLICADA AQUI ***
                        O item "Nenhum" agora tem um valor não-vazio "none" 
                    */}
                    <SelectItem value="none">Nenhum / Venda no balcão</SelectItem>
                    {allBarbers.map((barber) => (
                      <SelectItem key={barber._id} value={barber._id}>
                        {barber.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">A comissão de {selectedProduct.commissionRate}% será registrada para este barbeiro.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reason">Motivo</Label>
              <Input
                id="reason"
                value={stockForm.reason}
                onChange={(e) => setStockForm((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Ex: Compra de fornecedor, Venda balcão (opcional)"
              />
              {errors.reason && <p className="text-sm text-red-500">{errors.reason}</p>}
            </div>
            {(stockForm.type === "entrada" || stockForm.type === "ajuste") && (
              <div className="space-y-2">
                <Label htmlFor="unitCost">Custo Unitário (R$)</Label>
                <Input
                  id="unitCost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={stockForm.unitCost}
                  onChange={(e) =>
                    setStockForm((prev) => ({
                      ...prev,
                      unitCost: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
                {errors.unitCost && <p className="text-sm text-red-500">{errors.unitCost}</p>}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={stockForm.notes}
                onChange={(e) => setStockForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Alguma nota adicional?"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="pt-4 border-t">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={moveStock} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar Movimentação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Delete */}
      <AlertDialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar "{selectedProduct?.name}"? Esta ação não pode ser desfeita e removerá o produto permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteProduct} className="bg-destructive hover:bg-destructive/90" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  );
};
