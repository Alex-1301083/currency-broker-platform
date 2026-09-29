class TradingProvider {
  async connect() {
    throw new Error("connect() is not implemented.");
  }

  async disconnect() {
    throw new Error("disconnect() is not implemented.");
  }

  async getConnectionStatus() {
    throw new Error(
      "getConnectionStatus() is not implemented.",
    );
  }

  async getSymbols() {
    throw new Error(
      "getSymbols() is not implemented.",
    );
  }

  async getMarketPrice(symbol) {
    throw new Error(
      "getMarketPrice() is not implemented.",
    );
  }

  async getMarketPrices() {
    throw new Error(
      "getMarketPrices() is not implemented.",
    );
  }

  async placeOrder(order) {
    throw new Error(
      "placeOrder() is not implemented.",
    );
  }

  async cancelOrder(orderId) {
    throw new Error(
      "cancelOrder() is not implemented.",
    );
  }

  async closePosition(positionId) {
    throw new Error(
      "closePosition() is not implemented.",
    );
  }

  async getAccount() {
    throw new Error(
      "getAccount() is not implemented.",
    );
  }

  async getPositions() {
    throw new Error(
      "getPositions() is not implemented.",
    );
  }

  async getOrders() {
    throw new Error(
      "getOrders() is not implemented.",
    );
  }
}

module.exports = TradingProvider;