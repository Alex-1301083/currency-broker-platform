const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,

  limit: 120,

  standardHeaders: "draft-8",

  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many requests. Please try again later.",
    error: "Too many requests. Please try again later.",
  },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,

  limit: 20,

  standardHeaders: "draft-8",

  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Too many login attempts. Please wait a minute and try again.",
    error:
      "Too many login attempts. Please wait a minute and try again.",
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
    message:
      "Too many trading requests. Please try again later.",
    error:
      "Too many trading requests. Please try again later.",
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  orderLimiter,
};