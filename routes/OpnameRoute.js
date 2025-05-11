import express from "express";
import {
    getOpname,
    getOpnameById,
    createOpname,
    updateOpname,
    deleteOpname
} from "../controller/OpnameController.js";
import { verifyToken } from "../auth/authMiddleware.js";

const router = express.Router();

router.get('/', verifyToken, getOpname);
router.get('/:opname_id', verifyToken, getOpnameById);
router.post('/', verifyToken, createOpname);
router.patch('/:opname_id', verifyToken, updateOpname);
router.delete('/:opname_id', verifyToken, deleteOpname);

export default router;
