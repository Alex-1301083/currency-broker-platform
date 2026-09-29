const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,

  limit: 120,

  standardHeaders: "draft-8",

  legacyHeaders: false,

  message: {
    success: false,
    error: "Too many requests. Please try again later.",
  },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,

  limit: 10,

  standardHeaders: "draft-8",

  legacyHeaders: false,

  message: {
    success: false,
    error:
      "Too many authentication requests. Please try again later.",
  },
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,

  limit: 30,

  standardHeaders: "draft-8",

  legacyHeaders: false,

  keyGenerator: (req) => {
    if (req.user?.userId) {
      return `user:${req.user.userId}`;
    }

    return `ip:${ipKeyGenerator(req.ip)}`;
  },

  message: {
    success: false,
    error:
      "Too many trading requests. Please try again later.",
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  orderLimiter,
};