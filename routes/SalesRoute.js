import express from "express";
import {
    createSale,
    getSales,
    getSaleById
} from "../controller/SalesController.js";
import { authenticateToken } from "../auth/authMiddleware.js";

const router = express.Router();

// Protect all sales routes with authentication
router.get('/', authenticateToken, getSales);
router.get('/:id', authenticateToken, getSaleById);
router.post('/', authenticateToken, createSale); // This ensures req.user is available

export default router;