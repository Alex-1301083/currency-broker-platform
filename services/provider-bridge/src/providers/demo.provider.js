const TradingProvider = require("./provider.interface");

class DemoProvider extends TradingProvider {
  constructor() {
    super();

    this.connected = false;

    this.symbols = new Map([
      [
        "XAUUSD",
        {
          symbol: "XAUUSD",
          bid: 3400.0,
          ask: 3400.3,
          spread: 0.3,
        },
      ],
      [
        "EURUSD",
        {
          symbol: "EURUSD",
          bid: 1.17000,
          ask: 1.17020,
          spread: 0.00020,
        },
      ],
      [
        "GBPUSD",
        {
          symbol: "GBPUSD",
          bid: 1.35000,
          ask: 1.35020,
          spread: 0.00020,
        },
      ],
      [
        "BTCUSD",
        {
          symbol: "BTCUSD",
          bid: 110000,
          ask: 110050,
          spread: 50,
        },
      ],
    ]);
  }

  async connect() {
    this.connected = true;

    return {
      success: true,
      provider: "demo",
      status: "connected",
    };
  }

  async disconnect() {
    this.connected = false;

    return {
      success: true,
      provider: "demo",
      status: "disconnected",
    };
  }

  async getConnectionStatus() {
    return {
      provider: "demo",
      connected: this.connected,
    };
  }

  async getSymbols() {
    return Array.from(this.symbols.values());
  }

  async getMarketPrice(symbol) {
    const normalizedSymbol = symbol.toUpperCase();

    const price = this.symbols.get(normalizedSymbol);

    if (!price) {
      throw new Error(
        `Symbol ${normalizedSymbol} not found.`
      );
    }

    return {
      ...price,
      timestamp: new Date().toISOString(),
    };
  }

  async getMarketPrices() {
    const prices = [];

    for (const symbol of this.symbols.keys()) {
      prices.push(
        await this.getMarketPrice(symbol)
      );
    }

    return prices;
  }

  async placeOrder(order) {
    return {
      success: true,
      provider: "demo",
      providerOrderId: `DEMO-${Date.now()}`,
      status: "filled",
      order,
    };
  }

  async cancelOrder(orderId) {
    return {
      success: true,
      provider: "demo",
      providerOrderId: orderId,
      status: "cancelled",
    };
  }

  async closePosition(positionId) {
    return {
      success: true,
      provider: "demo",
      providerPositionId: positionId,
      status: "closed",
    };
  }

  async getAccount() {
    return {
      provider: "demo",
      balance: 10000,
      equity: 10000,
      margin: 0,
      freeMargin: 10000,
    };
  }

  async getPositions() {
    return [];
  }

  async getOrders() {
    return [];
  }

  /*
   * Demo price simulation
   */
  updateDemoPrices() {
    // XAUUSD
    const xau = this.symbols.get("XAUUSD");

    const xauMove =
      (Math.random() - 0.5) * 2.0;

    xau.bid = Number(
      (xau.bid + xauMove).toFixed(2)
    );

    xau.ask = Number(
      (xau.bid + xau.spread).toFixed(2)
    );

    // EURUSD
    const eur = this.symbols.get("EURUSD");

    const eurMove =
      (Math.random() - 0.5) * 0.00020;

    eur.bid = Number(
      (eur.bid + eurMove).toFixed(5)
    );

    eur.ask = Number(
      (eur.bid + eur.spread).toFixed(5)
    );

    // GBPUSD
    const gbp = this.symbols.get("GBPUSD");

    const gbpMove =
      (Math.random() - 0.5) * 0.00020;

    gbp.bid = Number(
      (gbp.bid + gbpMove).toFixed(5)
    );

    gbp.ask = Number(
      (gbp.bid + gbp.spread).toFixed(5)
    );

    // BTCUSD
    const btc = this.symbols.get("BTCUSD");

    const btcMove =
      (Math.random() - 0.5) * 200;

    btc.bid = Number(
      (btc.bid + btcMove).toFixed(2)
    );

    btc.ask = Number(
      (btc.bid + btc.spread).toFixed(2)
    );
  }
}

module.exports = DemoProvider;