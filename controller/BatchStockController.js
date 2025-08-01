import BatchStok from "../models/BatchstockModel.js";
import Products from "../models/ProductModel.js";
import Categories from "../models/CategoriesModel.js";
import { Op } from "sequelize";

export const getBatchStok = async (req, res) => {
    try {
        let { page, limit, search } = req.query;

        page = parseInt(page) || 0;
        limit = parseInt(limit) || 2500; 
        const offset = page * limit;

        const whereCondition = {};
        
        if (search) {
            whereCondition[Op.or] = [
                { batch_code: { [Op.like]: `%${search}%` } },
                { code_product: { [Op.like]: `%${search}%` } },
                { '$Product.name_product$': { [Op.like]: `%${search}%` } }
            ];
        }        const totalCount = await BatchStok.count({
            where: whereCondition,
            include: [{
                model: Products,
                attributes: ['code_product', 'name_product', 'code_categories'],
                required: false,
                include: [{
                    model: Categories,
                    attributes: ['code_categories', 'name_categories']
                }]
            }],
            distinct: true
        });const rows = await BatchStok.findAll({
            where: whereCondition,
            include: [{
                model: Products,
                attributes: ['code_product', 'name_product', 'code_categories'],
                required: false,
                include: [{
                    model: Categories,
                    attributes: ['code_categories', 'name_categories']
                }]
            }],
            order: [
                [{ model: Products }, 'name_product', 'ASC'],
                ['exp_date', 'ASC'],
                ['batch_code', 'ASC']
            ],
            limit: limit,
            offset: offset
        });

        const productCodes = [...new Set(rows.map(item => item.code_product))];

        // Menghitung total stock untuk setiap produk (hanya stock_quantity)
        const productTotalStocks = {};
        const productInitialStocks = {};
        
        for (const code of productCodes) {
            const allBatches = await BatchStok.findAll({
                where: { code_product: code }
            });
            
            const totalStock = allBatches.reduce((sum, batch) => 
                sum + (parseInt(batch.stock_quantity) || 0), 0
            );
            
            const totalInitial = allBatches.reduce((sum, batch) => 
                sum + (parseInt(batch.initial_stock) || 0), 0
            );
            
            productTotalStocks[code] = totalStock;
            productInitialStocks[code] = totalInitial;
        }

        const formattedResponse = rows.map(item => {
            const plainItem = item.get({ plain: true });
            
            if (plainItem.Product && plainItem.Product.code_product) {
                plainItem.Product.code_product = String(plainItem.Product.code_product);
            }
            if (plainItem.code_product) {
                plainItem.code_product = String(plainItem.code_product);
            }

            // Pisahkan total initial_stock dan stock_quantity
            plainItem.total_stock = productTotalStocks[plainItem.code_product] || 0;
            plainItem.total_initial = productInitialStocks[plainItem.code_product] || 0;
            
            // Batch specific totals (terpisah)
            plainItem.batch_stock = parseInt(plainItem.stock_quantity) || 0;
            plainItem.batch_initial = parseInt(plainItem.initial_stock) || 0;

            return plainItem;
        });

        res.status(200).json({
            result: formattedResponse,
            totalRows: totalCount,
            totalPages: Math.ceil(totalCount / limit),
            page: page,
            limit: limit
        });
    } catch (error) {
        console.error("Error in getBatchStok:", error);
        res.status(500).json({ msg: error.message });
    }
};

export const getBatchStokById = async (req, res) => {
    try {
        const response = await BatchStok.findOne({
            where: {
                batch_id: req.params.batch_id
            },
            include: [{
                model: Products,
                attributes: ['code_product', 'name_product'] // Pastikan kolom ini ada di tabel Products
            }]
        });
        if (!response) return res.status(404).json({ msg: "Batch stock not found" });
        
        // Format the response
        const plainResponse = response.get({ plain: true });
        if (plainResponse.Product && plainResponse.Product.code_product) {
            plainResponse.Product.code_product = String(plainResponse.Product.code_product);
        }
        if (plainResponse.code_product) {
            plainResponse.code_product = String(plainResponse.code_product);
        }
        
        res.status(200).json({ result: plainResponse });
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

export const getBatchStokByProductCode = async (req, res) => {
    try {
        const batchStocks = await BatchStok.findAll({
            where: {
                code_product: req.params.code_product
            },
            include: [{
                model: Products,
                attributes: ['code_product', 'name_product']
            }],
            order: [['exp_date', 'ASC']]
        });
        
        // Tambahkan total_stock ke setiap batch
        const response = batchStocks.map(batch => {
            const batchData = batch.get({ plain: true });
            batchData.total_stock = parseInt(batchData.initial_stock || 0) + parseInt(batchData.stock_quantity || 0);
            return batchData;
        });
        
        res.status(200).json({ result: response });
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

export const getMinimumStockAlert = async (req, res) => {
    try {
        // Fetch all products with their categories
        const products = await Products.findAll({
            attributes: ['code_product', 'name_product', 'min_stock', 'code_categories', 'sell_price']
        });

        const alerts = [];

        for (const product of products) {
            // Get all batches for this product, including expired ones
            const batches = await BatchStok.findAll({
                where: { 
                    code_product: product.code_product
                }
            });

            // Calculate total stock from all batches
            const totalStock = batches.reduce((acc, batch) => {
                const initialStock = parseInt(batch.initial_stock) || 0;
                const stockQuantity = parseInt(batch.stock_quantity) || 0;
                return acc + initialStock + stockQuantity;
            }, 0);

            // Include in alerts if stock is at or below minimum
            if (totalStock <= product.min_stock) {
                alerts.push({
                    code_product: product.code_product,
                    name_product: product.name_product,
                    code_categories: product.code_categories,
                    min_stock: product.min_stock,
                    current_stock: totalStock,
                    sell_price: product.sell_price,
                    batches: batches.map(batch => ({
                        batch_code: batch.batch_code,
                        initial_stock: batch.initial_stock || 0,
                        stock_quantity: batch.stock_quantity || 0,
                        total_batch_stock: (parseInt(batch.initial_stock) || 0) + (parseInt(batch.stock_quantity) || 0)
                    }))
                });
            }
        }

        res.status(200).json(alerts);
    } catch (error) {
        console.error("Error fetching minimum stock alerts:", error);
        res.status(500).json({ msg: error.message });
    }
};

export const createBatchStok = async (req, res) => {
    res.status(403).json({ msg: "Operation not allowed" })
};

export const updateBatchStok = async (req, res) => {
    try {
        const { batch_id } = req.params;
        const { expired_date } = req.body;

        if (!batch_id) {
            return res.status(400).json({ error: "Batch ID is required" });
        }

        if (!expired_date) {
            return res.status(400).json({ error: "Expired date is required" });
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(expired_date)) {
            return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
        }

        // Find the batch
        const batch = await BatchStok.findByPk(batch_id);
        if (!batch) {
            return res.status(404).json({ error: "Batch not found" });
        }

        // Update only the expiration date
        await batch.update({ 
            exp_date: expired_date,
            expired_date: expired_date // Update both fields for compatibility
        });

        // Fetch updated batch with product info
        const updatedBatch = await BatchStok.findByPk(batch_id, {
            include: [{
                model: Products,
                attributes: ['code_product', 'name_product', 'code_categories'],
                required: false,
                include: [{
                    model: Categories,
                    attributes: ['code_categories', 'name_categories']
                }]
            }]
        });

        res.status(200).json({
            msg: "Expiration date updated successfully",
            result: updatedBatch
        });
    } catch (error) {
        console.error("Error updating batch expiration date:", error);
        res.status(500).json({ error: error.message });
    }
};

export const deleteBatchStok = async (req, res) => {
    res.status(403).json({ msg: "Operation not allowed" });
};

