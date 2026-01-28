import express from "express";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import Barbershop from "../models/Barbershop.js";
import StockMovement from "../models/StockMovement.js";
import { requireRole, protectAdmin, checkAccountStatus } from "../middleware/authAdminMiddleware.js";

const router = express.Router({ mergeParams: true });

// GET /api/barbershops/:barbershopId/products - Listar produtos
router.get("/", async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { category, status = "ativo", lowStock, search, page = 1, limit = 20 } = req.query;

    const query = { barbershop: barbershopId };

    // Filtros
    if (category && category !== "all") {
      query.category = category;
    }

    if (status && status !== "all") {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { brand: { $regex: search, $options: "i" } },
        { barcode: { $regex: search, $options: "i" } },
      ];
    }

    let products = await Product.find(query)
      .sort({ name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Filtro de baixo estoque (aplicado após a consulta)
    if (lowStock === "true") {
      products = products.filter((product) => product.isLowStock);
    }

    const total = await Product.countDocuments(query);

    res.json({
      products,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.get("/store", async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { category, search, page = 1, limit = 12 } = req.query;

    // Primeiro, buscar a barbearia pelo barbershopId
    const barbershop = await Barbershop.findOne({ slug: barbershopId });
    if (!barbershop) {
      return res.status(404).json({ error: "Barbearia não encontrada" });
    }

    const query = {
      barbershop: barbershop._id,
      status: "ativo", // ✅ Apenas produtos ativos
      "stock.current": { $gt: 0 }, // ✅ Apenas produtos em estoque (opcional)
    };

    // Filtros
    if (category && category !== "all") {
      query.category = category;
    }

    if (search) {
      query.$or = [{ name: { $regex: search, $options: "i" } }, { brand: { $regex: search, $options: "i" } }];
    }

    const products = await Product.find(query)
      .select("name description category brand price.sale unit image") // ✅ Apenas campos públicos
      .sort({ name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Product.countDocuments(query);

    // ✅ Resposta limpa e otimizada
    const publicProducts = products.map((product) => ({
      _id: product._id,
      name: product.name,
      description: product.description,
      category: product.category,
      brand: product.brand,
      price: product.price.sale,
      unit: product.unit,
      image: product.image,
    }));

    res.json({
      products: publicProducts,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar produtos públicos:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// GET /api/barbershops/:barbershopId/products/stock-movements - Listar movimentações de estoque
router.get("/stock-movements", protectAdmin, checkAccountStatus, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { type, productId, startDate, endDate, limit = 100 } = req.query;

    // Validação do ID da barbearia
    if (!mongoose.Types.ObjectId.isValid(barbershopId)) {
      return res.status(400).json({ error: "ID da barbearia inválido" });
    }

    const query = { barbershop: new mongoose.Types.ObjectId(barbershopId) };

    // Filtro de data
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // Filtros
    if (type && type !== "all") {
      query.type = type;
    }

    if (productId && productId !== "all") {
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ error: "ID do produto inválido" });
      }
      query.product = new mongoose.Types.ObjectId(productId);
    }

    const movements = await StockMovement.find(query)
      .populate("product", "name")
      .populate("barber", "name")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(movements);
  } catch (error) {
    console.error("Erro ao buscar movimentações de estoque:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.get("/:productId", protectAdmin, checkAccountStatus, async (req, res) => {
  try {
    const { barbershopId, productId } = req.params;

    // A busca já inclui todos os campos do schema, incluindo 'image' se existir no documento
    const product = await Product.findOne({
      _id: productId,
      barbershop: barbershopId,
    });

    if (!product) {
      return res.status(404).json({ error: "Produto não encontrado" });
    }

    res.json(product); // Retorna o produto com todos os campos, incluindo 'image'
  } catch (error) {
    console.error("Erro ao buscar produto:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// POST /api/barbershops/:barbershopId/products - Criar produto
router.post("/", protectAdmin, checkAccountStatus, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId } = req.params;

    // --- ALTERAÇÃO AQUI ---
    // Explicitamente pegue 'image' do corpo da requisição
    const { image, ...otherData } = req.body;

    const productData = {
      ...otherData, // Pega todos os outros dados (name, price, stock, etc.)
      image: image, // Adiciona o campo 'image' explicitamente
      barbershop: barbershopId,
    };
    // ---------------------

    const product = new Product(productData);
    await product.save(); // Salva o produto com a imagem

    // Registrar movimentação inicial (código existente)
    if (product.stock && product.stock.current > 0) {
      // Adicionado verificação para product.stock
      const stockMovement = new StockMovement({
        product: product._id,
        type: "entrada",
        quantity: product.stock.current,
        reason: "Estoque inicial",
        previousStock: 0,
        newStock: product.stock.current,
        unitCost: product.price?.purchase, // Acesso seguro
        totalCost: (product.price?.purchase || 0) * product.stock.current, // Acesso seguro e valor padrão
        barbershop: barbershopId,
        notes: "Cadastro inicial do produto",
      });
      await stockMovement.save();
    }

    // Não é necessário buscar novamente, 'product' já contém o documento salvo
    res.status(201).json(product); // Retorna o produto recém-criado, incluindo a imagem
  } catch (error) {
    console.error("Erro ao criar produto:", error);
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({ error: `O campo '${field}' já está em uso.` });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: "Dados inválidos para o produto.", details: error.errors });
    }
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// PUT /api/barbershops/:barbershopId/products/:productId - Atualizar produto
router.put("/:productId", protectAdmin, checkAccountStatus, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId, productId } = req.params;

    // --- ALTERAÇÃO AQUI (Garantir que image está incluído) ---
    const { image, ...otherUpdateData } = req.body; // Separa image
    const updateData = { ...otherUpdateData };
    if (image !== undefined) {
      // Adiciona image apenas se foi enviado no body
      updateData.image = image;
    }
    // ---------------------------------------------------------

    // Remover campos indefinidos (se houver)
    Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);

    // Remover campos que não devem ser atualizados diretamente
    delete updateData.stock;
    delete updateData.barbershop;

    const product = await Product.findOneAndUpdate(
      { _id: productId, barbershop: barbershopId },
      { $set: updateData }, // Usa $set para atualizar apenas os campos fornecidos
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ error: "Produto não encontrado" });
    }

    res.json(product); // Retorna o produto atualizado, incluindo a imagem
  } catch (error) {
    // ... (mesmo tratamento de erro da resposta anterior) ...
    console.error("Erro ao atualizar produto:", error);
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({ error: `O campo '${field}' já está em uso.` });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: "Dados inválidos.", details: error.errors });
    }
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// DELETE /api/barbershops/:barbershopId/products/:productId - Deletar produto
router.delete("/:productId", protectAdmin, checkAccountStatus, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId, productId } = req.params;

    const product = await Product.findOneAndDelete({
      _id: productId,
      barbershop: barbershopId,
    });

    if (!product) {
      return res.status(404).json({ error: "Produto não encontrado" });
    }

    // Deletar todas as movimentações relacionadas
    await StockMovement.deleteMany({ product: productId });

    res.json({ message: "Produto deletado com sucesso" });
  } catch (error) {
    console.error("Erro ao deletar produto:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// POST /api/barbershops/:barbershopId/products/:productId/stock - Movimentar estoque
router.post("/:productId/stock", protectAdmin, checkAccountStatus, async (req, res) => {
  try {
    const { barbershopId, productId } = req.params;
    const { type, quantity, reason, unitCost, notes, barberId } = req.body;

    // --- 1. AJUSTE AQUI ---
    // Adicionado "venda" à lista de tipos permitidos
    if (!["entrada", "saida", "ajuste", "perda", "venda"].includes(type)) {
      // <-- MUDANÇA AQUI
      return res.status(400).json({ error: "Tipo de movimentação inválido" });
    }
    // ---------------------

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: "Quantidade deve ser maior que zero" });
    }

    const product = await Product.findOne({
      _id: productId,
      barbershop: barbershopId,
    });

    if (!product) {
      return res.status(404).json({ error: "Produto não encontrado" });
    }

    const previousStock = product.stock.current;
    let newStock;

    // Calcular novo estoque baseado no tipo de movimentação
    switch (type) {
      case "entrada":
        newStock = previousStock + quantity;
        break;

      // --- 2. AJUSTE AQUI ---
      // Adicionado "venda" ao caso de diminuição de estoque
      case "saida":
      case "perda":
      case "venda": // <-- MUDANÇA AQUI
        newStock = Math.max(0, previousStock - quantity);
        if (newStock === 0 && previousStock < quantity) {
          console.warn(`[StockVenda] Venda de ${quantity} unidades, mas só havia ${previousStock} em estoque.`);
          // (Opcional: você pode querer bloquear a venda se o estoque ficar negativo,
          // mas por enquanto, apenas garantimos que não fique abaixo de 0)
        }
        break;
      // ---------------------

      case "ajuste":
        newStock = quantity; // Para ajuste, a quantidade é o valor final
        break;
    }

    // Atualizar estoque do produto
    product.stock.current = newStock;
    await product.save();

    // Registrar movimentação
    const stockMovement = new StockMovement({
      product: productId,
      type,
      // Se for 'ajuste', a quantidade real é a diferença
      quantity: type === "ajuste" ? newStock - previousStock : quantity,
      reason: reason || (type === "venda" ? "Venda PDV" : "Ajuste manual"), // Adiciona um motivo padrão para venda
      previousStock,
      newStock,
      // Para vendas, o unitCost (custo de compra) é crucial para o dashboard
      unitCost: unitCost || product.price.purchase,
      // Custo total dos bens vendidos
      totalCost: (unitCost || product.price.purchase) * quantity,
      barbershop: barbershopId,
      barber: type === "venda" && barberId ? barberId : null,
      notes,
    });

    await stockMovement.save();

    const updatedProduct = await Product.findById(productId);

    res.json({
      product: updatedProduct,
      movement: stockMovement,
    });
  } catch (error) {
    console.error("Erro ao movimentar estoque:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// GET /api/barbershops/:barbershopId/products/:productId/movements - Histórico de movimentações
router.get("/:productId/movements", protectAdmin, checkAccountStatus, async (req, res) => {
  try {
    const { barbershopId, productId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const movements = await StockMovement.find({
      product: productId,
      barbershop: barbershopId,
    })
      .populate("name email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await StockMovement.countDocuments({
      product: productId,
      barbershop: barbershopId,
    });

    res.json({
      movements,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar movimentações:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// GET /api/barbershops/:barbershopId/products/reports/low-stock - Relatório de baixo estoque
router.get("/reports/low-stock", protectAdmin, checkAccountStatus, async (req, res) => {
  try {
    const { barbershopId } = req.params;

    const products = await Product.find({
      barbershop: barbershopId,
      status: "ativo",
    });

    const lowStockProducts = products.filter((product) => product.isLowStock);

    res.json({
      total: lowStockProducts.length,
      products: lowStockProducts,
    });
  } catch (error) {
    console.error("Erro ao gerar relatório:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// GET /api/barbershops/:barbershopId/products/reports/categories - Relatório por categorias
router.get("/reports/categories", protectAdmin, checkAccountStatus, requireRole("admin"), async (req, res) => {
  try {
    const { barbershopId } = req.params;

    const categoryReport = await Product.aggregate([
      { $match: { barbershop: new mongoose.Types.ObjectId(barbershopId) } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          totalValue: {
            $sum: { $multiply: ["$stock.current", "$price.purchase"] },
          },
          averageStock: { $avg: "$stock.current" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json(categoryReport);
  } catch (error) {
    console.error("Erro ao gerar relatório por categorias:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

export default router;
