import express from "express";
import {
    createSale,
    getSales,
    getSaleById,
    importSalesFromCSV,
    upload
} from "../controller/SalesController.js";
import { authenticateToken } from "../auth/authMiddleware.js";

const router = express.Router();

// Protect all sales routes with authentication
router.get('/', authenticateToken, getSales);
router.get('/:id', authenticateToken, getSaleById);
router.post('/', authenticateToken, createSale);

// Set up error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.error('Multer error:', err);
        return res.status(400).json({
            msg: "Error uploading file: " + err.message,
            error: err.code,
            field: err.field
        });
    } else if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({
            msg: err.message || "File upload failed",
            error: "UPLOAD_ERROR"
        });
    }
    next();
};

// CSV import route with proper middleware chain
router.post('/import', 
    authenticateToken,
    upload.single('file'),
    handleMulterError,
    importSalesFromCSV
);

export default router;