import express from "express";
import {
    getBatchStok,
    getBatchStokById,
    getBatchStokByProductCode,
    getMinimumStockAlert,
    createBatchStok
} from "../controller/BatchStockController.js";
import { authenticateToken, authorizeRole } from "../auth/authMiddleware.js";

const router = express.Router();

router.get('/stock', authenticateToken, getBatchStok);
router.get('/minstock', authenticateToken, getMinimumStockAlert);
router.get('/:batch_id', authenticateToken, getBatchStokById);
router.post('/create', authenticateToken, authorizeRole('admin'), createBatchStok);
router.get('/product/:code_product', authenticateToken, getBatchStokByProductCode);

export default router;
