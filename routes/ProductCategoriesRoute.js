import express from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  upload,
  importProductsFromCSV,
} from "../controller/ProductCategoriesController.js";
import { authorizeRole, authenticateToken } from "../auth/authMiddleware.js";

const router = express.Router();

// Product routes
router.get("/products", authenticateToken, getProducts);
router.get("/products/:code_product", authenticateToken, getProductById);
router.post("/products", authenticateToken, createProduct);
router.put("/products/:code_product", authenticateToken,  authorizeRole('admin'), updateProduct,);
router.delete("/products/:code_product", authenticateToken, authorizeRole('admin'), deleteProduct, );

// Category routes
router.get("/categories", authenticateToken, getCategories); 
router.get("/categories/:code_categories", authenticateToken, getCategoryById);
router.post("/categories", authenticateToken, createCategory);
router.put("/categories/:code_categories", authorizeRole('admin'), updateCategory, );
router.delete("/categories/:code_categories", authorizeRole('admin'), deleteCategory, );

// CSV routes
router.post("/products/import", upload.single('file'), importProductsFromCSV)
export default router;  