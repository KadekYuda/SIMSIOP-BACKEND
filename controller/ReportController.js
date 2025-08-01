import { Op } from "sequelize";
import db from "../config/Database.js";

// Import models directly
import Opname from "../models/OpnameModel.js";
import Sales from "../models/SalesModel.js";
import Order from "../models/OrderModel.js";
import BatchStock from "../models/BatchstockModel.js";
import Product from "../models/ProductModel.js";
import User from "../models/UserModel.js";
import SalesDetail from "../models/SalesDetailModel.js";
import OrderDetail from "../models/OrderDetailsModel.js";

// Get Opname Reports
export const getOpnameReports = async (req, res) => {
    try {
        const { start, end, category } = req.query;
        
        let whereClause = '';
        let params = [];
        
        // Date filtering
        if (start && end) {
            whereClause = 'WHERE o.created_at BETWEEN ? AND ?';
            params = [start, end + ' 23:59:59'];
        }
        
        // Category filtering
        if (category) {
            if (whereClause) {
                whereClause += ' AND c.code_categories = ?';
            } else {
                whereClause = 'WHERE c.code_categories = ?';
            }
            params.push(category);
        }
        
        console.log("Fetching opname reports with filters:", { start, end, category });
        console.log("Opname query WHERE clause:", whereClause);
        console.log("Opname query parameters:", params);

        // Use raw query for better reliability
        const query = `
            SELECT 
                o.opname_id,
                o.scheduled_date,
                o.opname_date,
                o.system_stock,
                o.physical_stock,
                o.expired_stock,
                o.damaged_stock,
                o.difference,
                o.status,
                o.notes,
                o.created_at,
                u.user_id,
                u.name as user_name,
                b.batch_id,
                b.batch_code,
                p.code_product,
                p.name_product,
                c.code_categories,
                c.name_categories
            FROM opnames o
            LEFT JOIN users u ON o.user_id = u.user_id
            LEFT JOIN batch_stock b ON o.batch_id = b.batch_id
            LEFT JOIN products p ON b.code_product = p.code_product
            LEFT JOIN categories c ON p.code_categories = c.code_categories
            ${whereClause}
            ORDER BY o.created_at DESC
        `;
        
        const reports = await db.query(query, {
            replacements: params,
            type: db.QueryTypes.SELECT
        });
        
        console.log(`Found ${reports.length} opname records`);
        
        // Debug: Log sample record to check category data
        if (reports.length > 0) {
            console.log("Sample opname record:", JSON.stringify(reports[0], null, 2));
        }

        // Transform data to match frontend expectations
        const transformedReports = reports.map(item => {
            // Handle numeric values properly
            const systemStock = item.system_stock !== null ? parseInt(item.system_stock) : 0;
            const physicalStock = item.physical_stock !== null ? parseInt(item.physical_stock) : 0;
            const expiredStock = item.expired_stock !== null ? parseInt(item.expired_stock) : 0;
            const damagedStock = item.damaged_stock !== null ? parseInt(item.damaged_stock) : 0;
            const difference = item.difference !== null ? parseInt(item.difference) : (physicalStock - systemStock);
            
            // Calculate total loss
            const totalLoss = expiredStock + damagedStock;
            const effectiveStock = physicalStock - totalLoss;
            
            return {
                id: item.opname_id,
                opname_id: item.opname_id,
                scheduled_date: item.scheduled_date,
                opname_date: item.opname_date,
                system_stock: systemStock,
                physical_stock: physicalStock,
                expired_stock: expiredStock,
                damaged_stock: damagedStock,
                total_loss: totalLoss,
                effective_stock: effectiveStock,
                difference: difference,
                status: item.status || 'scheduled',
                notes: item.notes || '',
                created_at: item.created_at,
                batch_stock: {
                    id: item.batch_id || 0,
                    batch_code: item.batch_code || `BATCH-${item.batch_id}`,
                    product: {
                        code_product: item.code_product || 'Unknown',
                        name: item.name_product || 'Unknown Product',
                        category: item.code_categories || 'Unknown'
                    }
                },
                user: {
                    user_id: item.user_id || 0,
                    name: item.user_name || 'Unknown User'
                },
                final_status: difference === 0 ? 'Match' : (difference > 0 ? 'Surplus' : 'Shortage')
            };
        });

        res.status(200).json(transformedReports);
    } catch (error) {
        console.error('Error fetching opname reports:', error);
        res.status(500).json({ msg: error.message });
    }
};

// Get Sales Reports
export const getSalesReports = async (req, res) => {
    try {
        const { start, end, category } = req.query;
        
        let whereClause = '';
        let params = [];
        
        // Date filtering
        if (start && end) {
            whereClause = 'WHERE s.sales_date BETWEEN ? AND ?';
            params = [start, end + ' 23:59:59'];
        }
        
        // Category filtering
        if (category) {
            if (whereClause) {
                whereClause += ' AND c.code_categories = ?';
            } else {
                whereClause = 'WHERE c.code_categories = ?';
            }
            params.push(category);
        }
        
        console.log("Fetching sales reports with filters:", { start, end, category });
        console.log("Sales query WHERE clause:", whereClause);
        console.log("Sales query parameters:", params);

        // Use raw query for better reliability
        const query = `
            SELECT 
                s.sales_id,
                s.sales_date,
                s.total_amount,
                u.user_id,
                u.name as user_name,
                sd.sales_detail_id,
                sd.quantity,
                sd.selling_price,
                b.batch_id,
                b.batch_code,
                p.code_product,
                p.name_product,
                c.code_categories,
                c.name_categories
            FROM sales s
            LEFT JOIN users u ON s.user_id = u.user_id
            LEFT JOIN sales_details sd ON s.sales_id = sd.sales_id
            LEFT JOIN batch_stock b ON sd.batch_id = b.batch_id
            LEFT JOIN products p ON b.code_product = p.code_product
            LEFT JOIN categories c ON p.code_categories = c.code_categories
            ${whereClause}
            ORDER BY s.sales_date DESC
        `;
        
        const salesData = await db.query(query, {
            replacements: params,
            type: db.QueryTypes.SELECT
        });
        
        console.log(`Found ${salesData.length} sales records`);
        
        // Debug: Log sample record to check category data
        if (salesData.length > 0) {
            console.log("Sample sales record:", JSON.stringify(salesData[0], null, 2));
        }

        // Flatten data for frontend consumption
        const flattenedReports = salesData.map((row, index) => {
            return {
                id: `sale-${row.sales_id}-detail-${row.sales_detail_id || 0}`,
                sale_id: row.sales_id,
                sales_detail_id: row.sales_detail_id || 0,
                product_name: row.name_product || 'Unknown Product',
                batch_code: row.batch_code || `BATCH-${row.batch_id}`,
                quantity: parseInt(row.quantity || 0),
                price: parseFloat(row.selling_price || 0),
                subtotal: (parseInt(row.quantity || 0)) * (parseFloat(row.selling_price || 0)),
                sales_date: row.sales_date,
                total_amount: parseFloat(row.total_amount || 0),
                category: row.code_categories || 'Unknown',
                user: {
                    user_id: row.user_id || 0,
                    name: row.user_name || 'Unknown User'
                },
                created_at: row.sales_date,
                indexNumber: index + 1
            };
        });

        console.log(`Processed ${flattenedReports.length} flattened sales records`);
        res.status(200).json(flattenedReports);
    } catch (error) {
        console.error('Error fetching sales reports:', error);
        res.status(500).json({ msg: error.message });
    }
};

// Get Order Reports
export const getOrderReports = async (req, res) => {
    try {
        const { start, end, category } = req.query;
        
        let whereClause = '';
        let params = [];
        
        // Date filtering
        if (start && end) {
            whereClause = 'WHERE o.created_at BETWEEN ? AND ?';
            params = [start, end + ' 23:59:59'];
        }
        
        // Category filtering
        if (category) {
            if (whereClause) {
                whereClause += ' AND c.code_categories = ?';
            } else {
                whereClause = 'WHERE c.code_categories = ?';
            }
            params.push(category);
        }
        
        console.log("Fetching order reports with filters:", { start, end, category });
        console.log("Orders query WHERE clause:", whereClause);
        console.log("Orders query parameters:", params);

        // Use raw query for better reliability
        const query = `
            SELECT 
                o.order_id,
                o.order_date,
                o.order_status,
                o.total_amount,
                o.created_at,
                u.user_id,
                u.name as user_name,
                od.order_detail_id,
                od.quantity,
                od.ordered_price,
                b.batch_id,
                b.batch_code,
                p.code_product,
                p.name_product,
                c.code_categories,
                c.name_categories
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.user_id
            LEFT JOIN order_details od ON o.order_id = od.order_id
            LEFT JOIN batch_stock b ON od.batch_id = b.batch_id
            LEFT JOIN products p ON b.code_product = p.code_product
            LEFT JOIN categories c ON p.code_categories = c.code_categories
            ${whereClause}
            ORDER BY o.created_at DESC
        `;
        
        const orderData = await db.query(query, {
            replacements: params,
            type: db.QueryTypes.SELECT
        });
        
        console.log(`Found ${orderData.length} order records`);
        
        // Debug: Log sample record to check category data
        if (orderData.length > 0) {
            console.log("Sample order record:", JSON.stringify(orderData[0], null, 2));
        }

        // Flatten data for frontend consumption
        const flattenedReports = orderData.map((row, index) => {
            return {
                id: `order-${row.order_id}-detail-${row.order_detail_id || 0}`,
                order_id: row.order_id,
                order_detail_id: row.order_detail_id || 0,
                product_name: row.name_product || 'Unknown Product',
                batch_code: row.batch_code || `BATCH-${row.batch_id}`,
                quantity: parseInt(row.quantity || 0),
                price: parseFloat(row.ordered_price || 0),
                subtotal: (parseInt(row.quantity || 0)) * (parseFloat(row.ordered_price || 0)),
                order_date: row.order_date,
                order_status: row.order_status || 'pending',
                total_amount: parseFloat(row.total_amount || 0),
                category: row.code_categories || 'Unknown',
                created_at: row.created_at,
                user: {
                    user_id: row.user_id || 0,
                    name: row.user_name || 'Unknown User'
                },
                indexNumber: index + 1
            };
        });

        console.log(`Processed ${flattenedReports.length} flattened order records`);
        res.status(200).json(flattenedReports);
    } catch (error) {
        console.error('Error fetching order reports:', error);
        res.status(500).json({ msg: error.message });
    }
};

// Get Stock Reports
export const getStockReports = async (req, res) => {
    try {
        const { start, end, category } = req.query;
        
        let whereClause = '';
        let params = [];
        
        // Date filtering
        if (start && end) {
            whereClause = 'WHERE b.arrival_date BETWEEN ? AND ?';
            params = [start, end + ' 23:59:59'];
        }
        
        // Category filtering
        if (category) {
            if (whereClause) {
                whereClause += ' AND c.code_categories = ?';
            } else {
                whereClause = 'WHERE c.code_categories = ?';
            }
            params.push(category);
        }
        
        console.log("Fetching stock reports with filters:", { start, end, category });

        // Use raw query for better reliability
        const query = `
            SELECT 
                b.batch_id,
                b.batch_code,
                b.initial_stock,
                b.stock_quantity,
                b.purchase_price,
                b.arrival_date,
                b.exp_date,
                p.code_product,
                p.name_product,
                p.min_stock,
                p.sell_price,
                c.code_categories,
                c.name_categories
            FROM batch_stock b
            LEFT JOIN products p ON b.code_product = p.code_product
            LEFT JOIN categories c ON p.code_categories = c.code_categories
            ${whereClause}
            ORDER BY b.arrival_date DESC
        `;
        
        const stockData = await db.query(query, {
            replacements: params,
            type: db.QueryTypes.SELECT
        });
        
        console.log(`Found ${stockData.length} stock records`);

        // Transform data to match frontend expectations
        const transformedReports = stockData.map((item, index) => {
            // Ensure all numeric values are properly handled
            const purchasePrice = item.purchase_price ? parseFloat(item.purchase_price) : 0;
            const sellingPrice = item.sell_price ? parseFloat(item.sell_price) : 0;
            const initialStock = item.initial_stock || 0;
            const currentStock = item.stock_quantity || 0;
            
            // Handle date formatting
            const arrivalDate = item.arrival_date ? new Date(item.arrival_date) : null;
            const expDate = item.exp_date ? new Date(item.exp_date) : null;
            
            // Determine status based on expiry date
            let status = '-';
            if (expDate) {
                const today = new Date();
                const daysToExpiry = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
                
                if (daysToExpiry < 0) {
                    status = 'Expired';
                } else if (daysToExpiry <= 30) {
                    status = 'Near Expiry';
                } else {
                    status = 'Valid';
                }
            }
            
            return {
                id: item.batch_id,
                batch_id: item.batch_id,
                batch_code: item.batch_code || `BATCH-${item.batch_id}`,
                product: {
                    code_product: item.code_product || 'Unknown',
                    name: item.name_product || 'Unknown Product',
                    min_stock: item.min_stock || 0,
                    category: item.code_categories || 'Unknown'
                },
                category: item.code_categories || 'Unknown',
                initial_stock: initialStock,
                current_stock: currentStock,
                purchase_price: purchasePrice,
                selling_price: sellingPrice,
                arrival_date: arrivalDate,
                exp_date: expDate,
                status: status,
                indexNumber: index + 1
            };
        });

        res.status(200).json(transformedReports);
    } catch (error) {
        console.error('Error fetching stock reports:', error);
        res.status(500).json({ msg: error.message });
    }
};

// Get Summary Reports
export const getSummaryReports = async (req, res) => {
    try {
        const { type, start, end } = req.query;
        
        let whereCondition = {};
        
        // Date filtering based on report type
        if (start && end) {
            switch (type) {
                case 'sales':
                    whereCondition.sales_date = {
                        [Op.between]: [new Date(start), new Date(end + ' 23:59:59')]
                    };
                    break;
                case 'orders':
                case 'opname':
                    whereCondition.created_at = {
                        [Op.between]: [new Date(start), new Date(end + ' 23:59:59')]
                    };
                    break;
                case 'stock':
                    whereCondition.arrival_date = {
                        [Op.between]: [new Date(start), new Date(end + ' 23:59:59')]
                    };
                    break;
                default:
                    break;
            }
        }

        let summary = {};

        switch (type) {
            case 'sales':
                const salesData = await SalesDetail.findAll({
                    include: [{
                        model: Sales,
                        where: whereCondition,
                        required: true
                    }]
                });
                
                summary = {
                    totalSales: salesData.reduce((sum, item) => sum + (parseFloat(item.selling_price) * parseInt(item.quantity)), 0),
                    totalQuantity: salesData.reduce((sum, item) => sum + parseInt(item.quantity), 0),
                    totalTransactions: salesData.length
                };
                break;

            case 'orders':
                const orderData = await Order.findAll({ where: whereCondition });
                
                summary = {
                    completed: orderData.filter(order => order.status === 'completed').length,
                    pending: orderData.filter(order => order.status === 'pending').length,
                    cancelled: orderData.filter(order => order.status === 'cancelled').length,
                    totalOrders: orderData.length
                };
                break;

            case 'opname':
                const opnameData = await Opname.findAll({ where: whereCondition });
                
                summary = {
                    totalPositive: opnameData.filter(item => item.physical_stock > item.system_stock).length,
                    totalNegative: opnameData.filter(item => item.physical_stock < item.system_stock).length,
                    totalZero: opnameData.filter(item => item.physical_stock === item.system_stock).length,
                    totalChecked: opnameData.length
                };
                break;

            case 'stock':
                const stockData = await BatchStock.findAll({
                    where: whereCondition,
                    include: [{ model: Product, required: false }]
                });
                
                const today = new Date();
                const expiredItems = stockData.filter(item => item.exp_date && new Date(item.exp_date) < today).length;
                const validItems = stockData.filter(item => !item.exp_date || new Date(item.exp_date) >= today).length;
                
                summary = {
                    totalStock: stockData.reduce((sum, item) => sum + (item.stock_quantity || 0), 0),
                    totalProducts: stockData.length,
                    totalBatches: stockData.length,
                    expiredItems: expiredItems,
                    validItems: validItems,
                    totalValue: stockData.reduce((sum, item) => sum + ((item.stock_quantity || 0) * (item.purchase_price || 0)), 0)
                };
                break;

            default:
                summary = {};
        }

        res.status(200).json(summary);
    } catch (error) {
        console.error('Error fetching summary reports:', error);
        res.status(500).json({ msg: error.message });
    }
};

// Get Product Count
export const getProductCount = async (req, res) => {
    try {
        const count = await Product.count();
        res.status(200).json({ count });
    } catch (error) {
        console.error('Error fetching product count:', error);
        res.status(500).json({ msg: error.message });
    }
};
