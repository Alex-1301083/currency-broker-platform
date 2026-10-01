/*
 Shared layout for the client Login / Register pages:
 brand + feature showcase on the left, the form card on the right.
*/

export function Brand() {
  return (
    <div className="auth-brand">
      <span className="brand-mark">T</span>

      <div>
        <h1>TradeX</h1>
        <p>Currency Trading Platform</p>
      </div>
    </div>
  );
}

export default function AuthShell({ children }) {
  return (
    <div className="auth-page">
      <aside className="auth-showcase">
        <Brand />

        <div className="auth-hero">
          <h2>
            Trade Gold, Forex &amp; Crypto with <span>live prices</span>
          </h2>

          <p>
            A fast, TradingView-style terminal with real-time bid / ask,
            one-click orders and Stop&nbsp;Loss / Take&nbsp;Profit right on the
            chart.
          </p>
        </div>

        <ul className="auth-features">
          <li>
            <b>⚡</b>
            Live streaming prices for XAUUSD, EURUSD, GBPUSD &amp; BTCUSD
          </li>
          <li>
            <b>📈</b>
            Professional candlestick charts with multiple timeframes
          </li>
          <li>
            <b>🛡️</b>
            Built-in margin and stop-out risk protection
          </li>
          <li>
            <b>💰</b>
            Free $10,000 demo account the moment you register
          </li>
        </ul>

        <div className="auth-ticker">
          <span>XAUUSD</span>
          <span>EURUSD</span>
          <span>GBPUSD</span>
          <span>BTCUSD</span>
        </div>
      </aside>

      <main className="auth-panel">{children}</main>
    </div>
  );
}
