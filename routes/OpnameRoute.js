import express from "express";
import {
  createOpnameTasks,
  getTasksForUser,
  submitOpnameResult,
  submitOpnameByID,
  getStaffOpnameHistory,
  reviewAndAdjustOpname,
  directOpnameByAdmin,
  getAllOpnames,
  confirmDirectOpname,
  requestEdit,
  getOpnameById,
  getOpnameDetails,
  debugProductBatches,
  checkCategoryConflict,
  debugOpnameData,
} from "../controller/OpnameController.js";
import { authenticateToken, authorizeRole } from "../auth/authMiddleware.js";

const router = express.Router();

router.post(
  "/create",
  authenticateToken,
  authorizeRole(["admin"]),
  createOpnameTasks
);

router.post(
  "/check-category-conflict",
  authenticateToken,
  authorizeRole(["admin"]),
  checkCategoryConflict
);
router.get(
  "/tasks",
  authenticateToken,
  authorizeRole(["staff"]),
  getTasksForUser
);
router.post(
  "/submit",
  authenticateToken,
  authorizeRole(["staff"]),
  submitOpnameResult
);
router.post(
  "/submit/:id",
  authenticateToken,
  authorizeRole(["staff"]),
  submitOpnameByID
);
router.post(
  "/review",
  authenticateToken,
  authorizeRole(["admin"]),
  reviewAndAdjustOpname
);
router.post(
  "/direct-opname",
  authenticateToken,
  authorizeRole(["admin"]),
  directOpnameByAdmin
);
router.get("/all", authenticateToken, getAllOpnames);
router.post(
  "/confirm",
  authenticateToken,
  authorizeRole(["admin"]),
  confirmDirectOpname
);
router.get(
  "/staff/history",
  authenticateToken,
  authorizeRole(["staff"]),
  getStaffOpnameHistory
);
router.post(
  "/request-edit",
  authenticateToken,
  authorizeRole(["staff"]),
  requestEdit
);

router.get(
  "/debug/product/:productCode",
  authenticateToken,
  authorizeRole(["admin"]),
  debugProductBatches
);

router.get(
  "/debug/opname-data",
  authenticateToken,
  authorizeRole(["admin"]),
  debugOpnameData
);

router.get(
  "/:id/details",
  authenticateToken,
  authorizeRole(["staff", "admin"]),
  getOpnameDetails
);

router.get(
  "/:id",
  authenticateToken,
  authorizeRole(["staff", "admin"]),
  getOpnameById
);

export default router;