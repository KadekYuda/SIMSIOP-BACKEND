import express from 'express';
import { 
    createOrder, 
    getAllOrders, 
    getOrderById, 
    getOrdersByUserId, 
    updateOrderStatus, 
    deleteOrder,
    getOrderDetailsByOrderId,
    getAvailableBatchesByProductCode,
    updateOrderItem,
    createOrderBatches
} from '../controller/OrderController.js';
import { authenticateToken } from '../auth/authMiddleware.js';


const router = express.Router();

// Protected routes (require authentication)
router.post('/',  authenticateToken, createOrder);
router.get('/user/:userId',  authenticateToken, getOrdersByUserId);
router.get('/:id',  authenticateToken, getOrderById);
router.get('/:orderId/details', authenticateToken, getOrderDetailsByOrderId);

// Admin routes
router.get('/', authenticateToken, getAllOrders);
router.patch('/:id/status', authenticateToken, updateOrderStatus);
router.delete('/:id', authenticateToken, deleteOrder);
router.get('/:code_product/batches', authenticateToken,  getAvailableBatchesByProductCode);
router.put('/:id/details/:detailId', authenticateToken, updateOrderItem);
router.post('/:id/create-batches', authenticateToken, createOrderBatches);

export default router;