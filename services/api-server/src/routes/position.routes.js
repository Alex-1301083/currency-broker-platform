const express = require("express");

const {
  getMyPositions,
  closeMyPosition,
  getMyPositionHistory
} = require("../controllers/position.controller");

const {
  authenticateToken
} = require("../middleware/auth.middleware");


const router = express.Router();

router.get(
  "/",
  authenticateToken,
  getMyPositions
);
router.post(
  "/:positionId/close",
  authenticateToken,
  closeMyPosition
);

router.get(
  "/history",
  authenticateToken,
  getMyPositionHistory
);

module.exports = router;