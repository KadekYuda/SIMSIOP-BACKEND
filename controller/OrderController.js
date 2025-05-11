import Order from "../models/OrderModel.js";
import User from "../models/UserModel.js";
import OrderDetail from "../models/OrderDetailsModel.js";
import BatchStock from "../models/BatchstockModel.js";
import Product from "../models/ProductModel.js";
import db from "../config/Database.js";

// Create a new order with order details
export const createOrder = async (req, res) => {
    const t = await db.transaction();
    
    try {
        const { order_status, order_details } = req.body;
        
        // Check if user is authenticated
        if (!req.user || !req.user.user_id) {       
            await t.rollback();
            return res.status(401).json({ msg: "User not authenticated or user_id not found" });
        }
        
        const user_id = req.user.user_id; // Get from authentication middleware
        console.log("Creating order for user_id:", user_id); // Debug log
        
        // Calculate total amount from order details
        let total_amount = 0;
        for (const detail of order_details) {
            total_amount += parseFloat(detail.subtotal);
        }

        // Create the order
        const newOrder = await Order.create({
            user_id,
            order_status: order_status || 'pending',
            total_amount,
            created_at: new Date(),
            updated_at: new Date()
        }, { transaction: t });

        // Process order details and handle batch creation if needed
        const orderDetailsPromises = [];

        // For each detail of order_details
        for (const detail of order_details) {
            // Get product information
            const product = await Product.findByPk(detail.code_product, { transaction: t });
            if (!product) {
                throw new Error(`Product with code ${detail.code_product} not found`);
            }
            
            // Create order detail with the batch_id
            const orderDetail = await OrderDetail.create({
                order_id: newOrder.order_id,
                code_product: detail.code_product,
                batch_id: null, // Initially set to null, will be set when order is received
                quantity: detail.stock_quantity,
                ordered_price: detail.ordered_price,
                subtotal: detail.subtotal,
                created_at: new Date(),
                updated_at: new Date()
            }, { transaction: t });
            
            orderDetailsPromises.push(orderDetail);
        }

        await Promise.all(orderDetailsPromises);
        await t.commit();
        
        res.status(201).json({ 
            msg: "Order created successfully", 
            order: newOrder 
        });
    } catch (error) {
        await t.rollback();
        res.status(400).json({ msg: error.message });
    }
};

// Get all orders with their details
export const getAllOrders = async (req, res) => {
    try {
        const { order_status, start_date, end_date } = req.query;
        
        // Build where clause
        const whereClause = {};
        if (order_status) {
            whereClause.order_status = order_status;
        }
        if (start_date && end_date) {
            whereClause.created_at = {
                [db.Sequelize.Op.between]: [
                    new Date(start_date),
                    new Date(new Date(end_date).setHours(23, 59, 59))
                ]
            };
        } else if (start_date) {
            whereClause.created_at = {
                [db.Sequelize.Op.gte]: new Date(start_date)
            };
        } else if (end_date) {
            whereClause.created_at = {
                [db.Sequelize.Op.lte]: new Date(new Date(end_date).setHours(23, 59, 59))
            };
        }

        const orders = await Order.findAll({
            where: whereClause,
            include: [
                {
                    model: User,
                    attributes: ['user_id', 'name', 'email']
                },
                {
                    model: OrderDetail,
                    include: [
                        {
                            model: Product,
                            attributes: ['code_product', 'name_product']
                        },
                        {
                            model: BatchStock,
                            attributes: ['batch_id', 'exp_date', 'batch_code']
                        }
                    ]
                }
            ],
            order: [['created_at', 'DESC']]
        });
        
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// Get a single order by ID with details
export const getOrderById = async (req, res) => {
    try {
        const order = await Order.findOne({
            where: {
                order_id: req.params.id
            },
            include: [
                {
                    model: User,
                    attributes: ['user_id', 'name', 'email']
                },
                {
                    model: OrderDetail,
                    include: [
                        {
                            model: Product,
                            attributes: ['code_product', 'name_product']
                        },
                        {
                            model: BatchStock,
                            attributes: ['batch_id', 'exp_date', 'batch_code']
                        }
                    ]
                }
            ]
        });
        
        if (!order) {
            return res.status(404).json({ msg: "Order not found" });
        }
        
        res.status(200).json(order);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// Get orders by user ID
export const getOrdersByUserId = async (req, res) => {
    try {
        const orders = await Order.findAll({
            where: {
                user_id: req.params.userId
            },
            include: [
                {
                    model: OrderDetail,
                    include: [
                        {
                            model: Product,
                            attributes: ['code_product', 'name_product']
                        },
                        {
                            model: BatchStock,
                            attributes: ['batch_id', 'exp_date', 'batch_code']
                        }
                    ]
                }
            ],
            order: [['order_date', 'DESC']]
        });
        
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// Update order status
export const updateOrderStatus = async (req, res) => {
    const t = await db.transaction();
    
    try {
        const { order_status } = req.body;
        const orderId = req.params.id;
        
        // Check if user is admin for status updates
        if (!req.user || req.user.role !== 'admin') {
            await t.rollback();
            return res.status(403).json({ msg: "Only admin can update order status" });
        }

        const order = await Order.findByPk(orderId, {
            include: [{
                model: OrderDetail
            }],
            transaction: t
        });
        
        if (!order) {
            await t.rollback();
            return res.status(404).json({ msg: "Order not found" });
        }

        // Check valid status transitions
        if (order_status === 'received' && order.order_status !== 'approved') {
            await t.rollback();
            return res.status(400).json({ msg: "Order must be approved before being received" });
        }
        
        // Update order status
        await order.update({
            order_status,
            updated_at: new Date()
        }, { transaction: t });
        
        await t.commit();
        res.status(200).json({ 
            msg: "Order status updated successfully", 
            order: {
                ...order.toJSON(),
                order_status
            }
        });
    } catch (error) {
        await t.rollback();
        res.status(400).json({ msg: error.message });
    }
};

// New endpoint to create batches for received order
export const createOrderBatches = async (req, res) => {
    const t = await db.transaction();
    
    try {
        const { expiration_dates } = req.body;
        const orderId = req.params.id;

        // Get order with its details
        const orderDetails = await OrderDetail.findAll({
            where: { order_id: orderId },
            include: [{ 
                model: Product,
                attributes: ['code_product', 'name_product']
            }],
            transaction: t
        });

        if (!orderDetails || orderDetails.length === 0) {
            await t.rollback();
            return res.status(404).json({ msg: "Order details not found" });
        }

        // Get the order to check status
        const order = await Order.findByPk(orderId, { transaction: t });
        if (!order) {
            await t.rollback();
            return res.status(404).json({ msg: "Order not found" });
        }

        if (order.order_status !== 'received') {
            await t.rollback();
            return res.status(400).json({ msg: "Order must be in received status" });
        }

        // Create or update batches for each order detail
        for (const detail of orderDetails) {
            const product = await Product.findByPk(detail.code_product, {
                attributes: ['code_product', 'name_product'],
                transaction: t
            });

            if (!product) {
                await t.rollback();
                return res.status(404).json({ msg: `Product with code ${detail.code_product} not found` });
            }

            // Check if there's an existing batch with same purchase price and valid expiry
            const existingBatchWithPrice = await BatchStock.findOne({
                where: { 
                    code_product: detail.code_product,
                    purchase_price: detail.ordered_price,
                    [db.Sequelize.Op.or]: [
                        {
                            exp_date: {
                                [db.Sequelize.Op.gt]: new Date()
                            }
                        },
                        {
                            exp_date: null
                        }
                    ]
                },
                transaction: t
            });

            const currentDate = new Date();
            let batchToUse;

            if (existingBatchWithPrice) {
                // Jika batch sudah ada dan masih valid
                const updateData = {
                    initial_stock: existingBatchWithPrice.initial_stock + parseInt(detail.quantity),
                    updated_at: currentDate
                };

                // Update exp_date hanya jika batch belum punya exp_date dan ada exp_date baru
                if (!existingBatchWithPrice.exp_date && expiration_dates[detail.order_detail_id]) {
                    updateData.exp_date = new Date(expiration_dates[detail.order_detail_id]);
                }

                await existingBatchWithPrice.update(updateData, { transaction: t });
                batchToUse = existingBatchWithPrice;
            } else {
                // Buat batch baru - gunakan initial_stock untuk order pertama
                const allBatches = await BatchStock.findAll({
                    where: { code_product: detail.code_product },
                    transaction: t
                });

                const batchNumber = allBatches.length + 1;
                const batchCode = `${product.name_product}-${String(batchNumber).padStart(3, '0')}`;

                const existingBatchesWithSamePrice = allBatches.filter(b => 
                    parseFloat(b.purchase_price) === parseFloat(detail.ordered_price)
                );

                if (existingBatchesWithSamePrice.length > 0) {
                    // Jika ada batch dengan harga yang sama, tambahkan ke stock_quantity
                    const batchToUpdate = existingBatchesWithSamePrice[0];
                    await batchToUpdate.update({
                        stock_quantity: batchToUpdate.stock_quantity + parseInt(detail.quantity),
                        updated_at: currentDate
                    }, { transaction: t });
                    batchToUse = batchToUpdate;
                } else {
                    // Jika batch baru dengan harga berbeda
                    const quantity = parseInt(detail.quantity);
                    batchToUse = await BatchStock.create({
                        code_product: detail.code_product,
                        batch_code: batchCode,
                        purchase_price: detail.ordered_price,
                        initial_stock: quantity,
                        stock_quantity: quantity, // Set sama dengan initial_stock
                        arrival_date: currentDate,
                        exp_date: expiration_dates[detail.order_detail_id] ? new Date(expiration_dates[detail.order_detail_id]) : null,
                        created_at: currentDate,
                        updated_at: currentDate
                    }, { transaction: t });
                }
            }

            // Update the order detail with the batch ID
            await detail.update({
                batch_id: batchToUse.batch_id
            }, { transaction: t });
        }
        
        await t.commit();
        res.status(200).json({ 
            msg: "Batches created successfully",
            order_id: orderId
        });
    } catch (error) {
        await t.rollback();
        res.status(400).json({ msg: error.message });
    }
};

// Delete an order (for admin purposes only)
export const deleteOrder = async (req, res) => {
    const t = await db.transaction();
    
    try {
        const orderId = req.params.id;
        const order = await Order.findByPk(orderId, { transaction: t });
        
        if (!order) {
            await t.rollback();
            return res.status(404).json({ msg: "Order not found" });
        }
        
        // If not cancelled, restore the batch stock quantities
        if (order.order_status !== 'cancelled') {
            const orderDetails = await OrderDetail.findAll({
                where: { order_id: orderId },
                transaction: t
            });
            
            for (const detail of orderDetails) {
                const batch = await BatchStock.findByPk(detail.batch_id, { transaction: t });
                if (batch) {
                    // Check if this is a batch that might need to update initial_stock
                    // If batch has no initial_stock but has stock_quantity, it's already been "converted"
                    if (batch.initial_stock === 0 && batch.stock_quantity > 0) {
                        // Normal restore to stock_quantity
                        await batch.update({
                            stock_quantity: batch.stock_quantity + detail.quantity,
                            updated_at: new Date()
                        }, { transaction: t });
                    } else {
                        // This might be a batch that was in its "initial stock" phase
                        // Restore to initial_stock if this batch hasn't been fully transitioned yet
                        await batch.update({
                            initial_stock: batch.initial_stock + detail.quantity,
                            updated_at: new Date()
                        }, { transaction: t });
                    }
                }
            }
        }
        
        // Delete order details first
        await OrderDetail.destroy({
            where: { order_id: orderId },
            transaction: t
        });
        
        // Then delete the order
        await order.destroy({ transaction: t });
        
        await t.commit();
        res.status(200).json({ msg: "Order deleted successfully" });
    } catch (error) {
        await t.rollback();
        res.status(500).json({ msg: error.message });
    }
};

export const getOrderDetailsByOrderId = async (req, res) => {
    try {
        // First, log the request to make sure we're getting the right orderId
        // console.log("Fetching details for order ID:", req.params.orderId);
        
        // Fetch order details with explicit joins
        const orderDetails = await OrderDetail.findAll({
            where: {
                order_id: req.params.orderId
            },
            include: [
                {
                    model: Product,
                    required: false, // Use LEFT JOIN to ensure we get results even if product isn't found
                    attributes: ['code_product', 'name_product']
                },
                {
                    model: BatchStock,
                    required: false, // Use LEFT JOIN to ensure we get results even if batch isn't found
                    attributes: ['batch_id', 'batch_code', 'exp_date', 'purchase_price']
                }
            ],
            raw: false // Ensure we get Sequelize model instances, not raw data
        });
        
        // Log what we got back from the database
        console.log("Raw order details from DB:", JSON.stringify(orderDetails, null, 2));
        
        // If we're not getting Product or BatchStock, let's try to fetch them separately
        const formattedOrderDetails = await Promise.all(orderDetails.map(async (detail) => {
            let productData = detail.Product;
            let batchData = detail.BatchStock;
            
            // If Product data is missing, try to fetch it directly
            if (!productData || !productData.name_product) {
                try {
                    productData = await Product.findByPk(detail.code_product);
                    console.log("Fetched product separately:", productData ? productData.name_product : "Not found");
                } catch (err) {
                    console.error("Error fetching product:", err);
                }
            }
            
            // If BatchStock data is missing, try to fetch it directly
            if (!batchData || !batchData.batch_code) {
                try {
                    batchData = await BatchStock.findByPk(detail.batch_id);
                    console.log("Fetched batch separately:", batchData ? batchData.batch_code : "Not found");
                } catch (err) {
                    console.error("Error fetching batch:", err);
                }
            }
            
            return {
                order_detail_id: detail.order_detail_id,
                order_id: detail.order_id,
                product_id: detail.code_product,
                product_name: productData ? productData.name_product : 'Unknown Product',
                code_product: detail.code_product,
                batch_id: detail.batch_id,
                batch_code: batchData ? batchData.batch_code : 'Unknown Batch',
                quantity: detail.quantity,
                ordered_price: detail.ordered_price,
                subtotal: detail.subtotal
            };
        }));
        
        // Log the formatted results
        console.log("Formatted order details:", JSON.stringify(formattedOrderDetails, null, 2));
        
        res.status(200).json({ result: formattedOrderDetails });
    } catch (error) {
        console.error("Error in getOrderDetailsByOrderId:", error);
        res.status(500).json({ msg: error.message });
    }
};


// Get available batches by product code
export const getAvailableBatchesByProductCode = async (req, res) => {
    try {
        const productCode = req.params.code_product;
        
        // Pastikan code_product valid
        const product = await Product.findByPk(productCode);
        if (!product) {
            return res.status(404).json({ msg: "Product not found" });
        }
        
        // Dapatkan semua batch yang tersedia untuk product ini
        const batches = await BatchStock.findAll({
            where: {
                code_product: productCode
            },
            attributes: ['batch_id', 'batch_code', 'stock_quantity', 'purchase_price', 'exp_date'],
            order: [['exp_date', 'ASC']]
        });
        
        res.status(200).json(batches);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

// Update order item
export const updateOrderItem = async (req, res) => {
    const t = await db.transaction();
    
    try {
        const orderId = req.params.id;
        const orderDetailId = req.params.detailId;
        const { batch_id, quantity, ordered_price, subtotal } = req.body;
        
        // Cek apakah order ada dan statusnya pending
        const order = await Order.findByPk(orderId, { transaction: t });
        if (!order) {
            await t.rollback();
            return res.status(404).json({ msg: "Order not found" });
        }
        
        if (order.order_status !== 'pending') {
            await t.rollback();
            return res.status(400).json({ msg: "Only pending orders can be modified" });
        }
        
        // Cek apakah order detail ada
        const orderDetail = await OrderDetail.findByPk(orderDetailId, { transaction: t });
        if (!orderDetail) {
            await t.rollback();
            return res.status(404).json({ msg: "Order detail not found" });
        }
        
        // Jika batch berubah atau quantity berubah, perbarui stok
        if (orderDetail.batch_id !== batch_id || orderDetail.quantity !== quantity) {
            // Kembalikan stok yang lama
            const oldBatch = await BatchStock.findByPk(orderDetail.batch_id, { transaction: t });
            if (oldBatch) {
                await oldBatch.update({
                    stock_quantity: oldBatch.stock_quantity + orderDetail.quantity,
                    updated_at: new Date()
                }, { transaction: t });
            }
            
            // Kurangi stok yang baru
            const newBatch = await BatchStock.findByPk(batch_id, { transaction: t });
            if (!newBatch) {
                await t.rollback();
                return res.status(404).json({ msg: "Batch not found" });
            }
            
            if (newBatch.stock_quantity < quantity) {
                await t.rollback();
                return res.status(400).json({ msg: "Insufficient stock for the selected batch" });
            }
            
            await newBatch.update({
                stock_quantity: newBatch.stock_quantity - quantity,
                updated_at: new Date()
            }, { transaction: t });
        }
        
        // Update order detail
        await orderDetail.update({
            batch_id,
            quantity,
            ordered_price,
            subtotal,
            updated_at: new Date()
        }, { transaction: t });
        
        // Recalculate and update order total amount
        const allOrderDetails = await OrderDetail.findAll({
            where: { order_id: orderId },
            transaction: t
        });
        
        let newTotalAmount = 0;
        for (const detail of allOrderDetails) {
            // Use the updated value for the current detail we're updating
            if (detail.order_detail_id === parseInt(orderDetailId)) {
                newTotalAmount += parseFloat(subtotal);
            } else {
                newTotalAmount += parseFloat(detail.subtotal);
            }
        }
        
        await order.update({
            total_amount: newTotalAmount,
            updated_at: new Date()
        }, { transaction: t });
        
        await t.commit();
        res.status(200).json({ 
            msg: "Order item updated successfully",
            orderDetail: {
                ...orderDetail.toJSON(),
                quantity,
                ordered_price,
                subtotal
            } 
        });
    } catch (error) {
        await t.rollback();
        res.status(400).json({ msg: error.message });
    }
};