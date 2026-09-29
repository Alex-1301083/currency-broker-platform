const providerManager = require("./provider-manager");

async function placeProviderOrder({
  symbol,
  side,
  volume,
  stopLoss = null,
  takeProfit = null,
}) {
  if (!symbol) {
    throw new Error("Order symbol is required.");
  }

  if (!["BUY", "SELL"].includes(side)) {
    throw new Error("Order side must be BUY or SELL.");
  }

  if (
    !Number.isFinite(Number(volume)) ||
    Number(volume) <= 0
  ) {
    throw new Error("Order volume must be greater than 0.");
  }

  const provider = providerManager.getProvider();

  const order = {
    symbol: String(symbol).toUpperCase(),
    side,
    volume: Number(volume),
    stopLoss,
    takeProfit,
  };

  console.log(
    "[ORDER EXECUTION] Sending order to provider:",
    order,
  );

  const result = await provider.placeOrder(order);

  console.log(
    "[ORDER EXECUTION] Provider response:",
    result,
  );

  if (!result) {
    throw new Error(
      "Provider returned an empty order response.",
    );
  }

  if (!result.success) {
    throw new Error(
      result.message || "Provider order execution failed.",
    );
  }

  return result;
}

async function cancelProviderOrder(orderId) {
  if (!orderId) {
    throw new Error("Provider order ID is required.");
  }

  const provider = providerManager.getProvider();

  return provider.cancelOrder(orderId);
}

async function closeProviderPosition(positionId) {
  if (!positionId) {
    throw new Error(
      "Provider position ID is required.",
    );
  }

  const provider = providerManager.getProvider();

  return provider.closePosition(positionId);
}

module.exports = {
  placeProviderOrder,
  cancelProviderOrder,
  closeProviderPosition,
};