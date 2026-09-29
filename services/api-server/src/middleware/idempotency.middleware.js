const {
  normalizeIdempotencyKey,
} = require("../services/idempotency.service");

function validateIdempotencyKey(req, res, next) {
  try {
    const rawKey = req.get("Idempotency-Key");

    if (!rawKey) {
      return res.status(400).json({
        success: false,
        message:
          "Idempotency-Key header is required for trading orders.",
      });
    }

    const idempotencyKey =
      normalizeIdempotencyKey(rawKey);

    if (!idempotencyKey) {
      return res.status(400).json({
        success: false,
        message:
          "Idempotency-Key header must not be empty.",
      });
    }

    req.idempotencyKey = idempotencyKey;

    next();
  } catch (error) {
    console.error(
      "[IDEMPOTENCY VALIDATION ERROR]",
      error.message,
    );

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

module.exports = {
  validateIdempotencyKey,
};