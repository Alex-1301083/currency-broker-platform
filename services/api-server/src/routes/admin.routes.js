const express = require("express");

const { authenticateToken } = require("../middleware/auth.middleware");
const { requireAdmin } = require("../middleware/admin.middleware");

const {
  adminLogin,
  getAdminDashboard,
  getAdminUsers,
  getAdminUserById,
  updateAdminUserStatus,
  getAdminOrders,
  getAdminPositions,
  getAdminTrades,
  getAdminSymbols,
  updateAdminSymbolStatus,
  getAdminAuditLogs,
getAdminAuditLogById,
} = require("../controllers/admin.controller");

const router = express.Router();

// Admin login
router.post("/login", adminLogin);

// Admin dashboard
router.get(
  "/dashboard",
  authenticateToken,
  requireAdmin,
  getAdminDashboard,

);

// Users list
router.get(
  "/users",
  authenticateToken,
  requireAdmin,
  getAdminUsers
);

router.get(
  "/orders",
  authenticateToken,
  requireAdmin,
  getAdminOrders
);

router.get(
  "/positions",
  authenticateToken,
  requireAdmin,
  getAdminPositions
);

router.get(
  "/trades",
  authenticateToken,
  requireAdmin,
  getAdminTrades
);

router.get(
  "/symbols",
  authenticateToken,
  requireAdmin,
  getAdminSymbols
);

router.patch(
  "/symbols/:symbolId/status",
  authenticateToken,
  requireAdmin,
  updateAdminSymbolStatus
);

// Audit logs

router.get(
  "/audit-logs",
  authenticateToken,
  requireAdmin,
  getAdminAuditLogs,
);

router.get(
  "/audit-logs/:auditLogId",
  authenticateToken,
  requireAdmin,
  getAdminAuditLogById,
);

// User details
router.get(
  "/users/:userId",
  authenticateToken,
  requireAdmin,
  getAdminUserById
);

// Activate / Deactivate user
router.patch(
  "/users/:userId/status",
  authenticateToken,
  requireAdmin,
  updateAdminUserStatus
);

module.exports = router;