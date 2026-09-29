const { executeMarketOrder } = require("../services/trading.service");
const { getOrderHistory } = require("../models/order.model");
const { findAccountByUserId } = require("../models/account.model");

function validateOrderPayload(req) {
const body = req.body || {};

const symbol = body.symbol;
const side = body.side;
const volume = body.volume;
const stopLoss = body.stopLoss;
const takeProfit = body.takeProfit;

if (typeof symbol !== "string" || symbol.trim() === "") {
return "symbol is required and must be a non-empty string";
}

if (typeof side !== "string" || side.trim() === "") {
return "side is required and must be a non-empty string";
}

if (volume === undefined || volume === null || volume === "") {
return "volume is required";
}

if (typeof volume === "boolean") {
return "volume must be a valid number";
}

const normalizedVolume = Number(volume);

if (!Number.isFinite(normalizedVolume)) {
return "volume must be a valid number";
}

if (normalizedVolume <= 0) {
return "volume must be greater than 0";
}

if (
stopLoss !== undefined &&
stopLoss !== null &&
stopLoss !== ""
) {
if (typeof stopLoss === "boolean") {
return "stopLoss must be a valid number";
}


const normalizedStopLoss = Number(stopLoss);

if (!Number.isFinite(normalizedStopLoss)) {
  return "stopLoss must be a valid number";
}

if (normalizedStopLoss <= 0) {
  return "stopLoss must be greater than 0";
}


}

if (
takeProfit !== undefined &&
takeProfit !== null &&
takeProfit !== ""
) {
if (typeof takeProfit === "boolean") {
return "takeProfit must be a valid number";
}


const normalizedTakeProfit = Number(takeProfit);

if (!Number.isFinite(normalizedTakeProfit)) {
  return "takeProfit must be a valid number";
}

if (normalizedTakeProfit <= 0) {
  return "takeProfit must be greater than 0";
}


}

return null;
}

async function placeMarketOrder(req, res) {
try {
const validationError = validateOrderPayload(req);


if (validationError !== null) {
  return res.status(400).json({
    success: false,
    message: validationError,
  });
}

const {
  symbol,
  side,
  volume,
  stopLoss = null,
  takeProfit = null,
} = req.body;

const result = await executeMarketOrder({
  userId: req.user.userId,
  symbol: symbol.trim(),
  side: side.trim(),
  volume: Number(volume),
  stopLoss:
    stopLoss === undefined || stopLoss === ""
      ? null
      : stopLoss,
  takeProfit:
    takeProfit === undefined || takeProfit === ""
      ? null
      : takeProfit,
  idempotencyKey: req.idempotencyKey,
});

return res.status(201).json({
  success: true,
  message: "Market order executed successfully",
  data: result,
});


} catch (error) {
console.error("Place order error:", error);


const statusCode = Number(error.statusCode) || 400;

return res.status(statusCode).json({
  success: false,
  message: error.message,
});


}
}

async function getMyOrderHistory(req, res) {
try {
const account = await findAccountByUserId(req.user.userId);


if (!account) {
  return res.status(404).json({
    success: false,
    message: "Trading account not found",
  });
}

const orders = await getOrderHistory(account.id);

return res.json({
  success: true,
  data: {
    orders,
  },
});


} catch (error) {
console.error("Get order history error:", error);


return res.status(500).json({
  success: false,
  message: "Failed to fetch order history",
});


}
}

module.exports = {
placeMarketOrder,
getMyOrderHistory,
validateOrderPayload,
};