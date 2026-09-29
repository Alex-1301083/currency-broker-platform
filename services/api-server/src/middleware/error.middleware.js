function errorHandler(err, req, res, next) {
  console.error("API Error:", {
    method: req.method,
    path: req.originalUrl,
    message: err.message,
    stack: err.stack,
  });

  if (res.headersSent) {
    return next(err);
  }

  const statusCode =
    Number.isInteger(err.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode < 600
      ? err.statusCode
      : 500;

  const response = {
    success: false,
    error:
      statusCode === 500
        ? "Internal server error"
        : err.message || "Request failed",
  };

  if (process.env.NODE_ENV === "development") {
    response.details = err.message;
  }

  return res.status(statusCode).json(response);
}

module.exports = {
  errorHandler,
};