import Sales from "../models/SalesModel.js";
import SalesDetail from "../models/SalesDetailModel.js";
import BatchStock from "../models/BatchstockModel.js";
import Product from "../models/ProductModel.js";
import db from "../config/Database.js";

export const createSale = async (req, res) => {
    const t = await db.transaction();
    
    try {
        const { sales_date, items } = req.body;
        const user_id = req.user?.user_id; // From auth middleware

        if (!user_id) {
            await t.rollback();
            return res.status(401).json({ msg: "User ID is required" });
        }

        // Create the sale record
        const sale = await Sales.create({
            user_id,
            sales_date: new Date(sales_date),
            total_amount: items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0),
            created_at: new Date(),
            updated_at: new Date()
        }, { transaction: t });

        // Process each item in the sale
        for (const item of items) {
            const { code_product, quantity, selling_price } = item;
            let remainingQuantity = parseInt(quantity);

            // Get available batches for this product in FIFO order (oldest first)
            const availableBatches = await BatchStock.findAll({
                where: {
                    code_product,
                    stock_quantity: {
                        [db.Sequelize.Op.gt]: 0
                    }
                },
                order: [
                    ['exp_date', 'ASC'],
                    ['arrival_date', 'ASC']
                ],
                transaction: t,
                lock: t.LOCK.UPDATE // Lock rows for update
            });

            // Validate if enough stock is available
            const totalAvailableStock = availableBatches.reduce((sum, batch) => 
                sum + parseInt(batch.stock_quantity || 0), 0);

            if (totalAvailableStock < quantity) {
                await t.rollback();
                return res.status(400).json({ 
                    msg: `Insufficient stock for product ${code_product}. Available: ${totalAvailableStock}, Requested: ${quantity}` 
                });
            }

            // Process batches in FIFO order
            for (const currentBatch of availableBatches) {
                if (remainingQuantity <= 0) break;

                const batchStock = parseInt(currentBatch.stock_quantity);
                const quantityToDeduct = Math.min(remainingQuantity, batchStock);

                if (quantityToDeduct > 0) {
                    // Create sales detail record
                    await SalesDetail.create({
                        sales_id: sale.sales_id,
                        code_product,
                        batch_id: currentBatch.batch_id,
                        quantity: quantityToDeduct,
                        selling_price,
                        subtotal: quantityToDeduct * selling_price,
                        created_by: user_id,
                        created_at: new Date(),
                        updated_at: new Date()
                    }, { transaction: t });

                    // Update batch stock
                    await currentBatch.update({
                        stock_quantity: batchStock - quantityToDeduct,
                        updated_at: new Date()
                    }, { transaction: t });

                    remainingQuantity -= quantityToDeduct;
                }
            }

            if (remainingQuantity > 0) {
                await t.rollback();
                return res.status(400).json({ 
                    msg: `Unexpected error: Could not fulfill entire quantity for product ${code_product}` 
                });
            }
        }

        await t.commit();
        res.status(201).json({ 
            msg: "Sale created successfully", 
            sale_id: sale.sales_id 
        });

    } catch (error) {
        await t.rollback();
        res.status(500).json({ msg: error.message });
    }
};

export const getSales = async (req, res) => {
    try {
        const response = await Sales.findAll({
            include: [{
                model: SalesDetail,
                include: [{
                    model: Product,
                    attributes: ['name_product']
                }, {
                    model: BatchStock,
                    attributes: ['batch_code', 'exp_date']
                }]
            }],
            order: [['sales_date', 'DESC']]
        });
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

export const getSaleById = async (req, res) => {
    try {
        const sale = await Sales.findOne({
            where: { sales_id: req.params.id },
            include: [{
                model: SalesDetail,
                include: [{
                    model: Product,
                    attributes: ['code_product', 'name_product']
                }, {
                    model: BatchStock,
                    attributes: ['batch_code', 'exp_date']
                }]
            }]
        });
        
        if (!sale) {
            return res.status(404).json({ msg: "Sale not found" });
        }
        
        res.status(200).json(sale);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};