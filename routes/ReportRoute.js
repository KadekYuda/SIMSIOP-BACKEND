import express from "express";
import { 
    getOpnameReports, 
    getSalesReports, 
    getOrderReports,
    getStockReports,
    getSummaryReports,
    getProductCount
} from "../controller/ReportController.js";
import { authenticateToken } from "../auth/authMiddleware.js";

const router = express.Router();

// All report routes require authentication
router.get('/report/summary', authenticateToken, getSummaryReports);
router.get('/report/opname', authenticateToken, getOpnameReports);
router.get('/report/sales', authenticateToken, getSalesReports);
router.get('/report/orders', authenticateToken, getOrderReports);
router.get('/report/stock', authenticateToken, getStockReports);
router.get('/report/product-count', authenticateToken, getProductCount);

export default router;
