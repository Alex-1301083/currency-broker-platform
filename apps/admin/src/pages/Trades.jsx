import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

function Trades() {
  const navigate = useNavigate();

  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [sideFilter, setSideFilter] = useState("all");
  const [symbolFilter, setSymbolFilter] = useState("all");

  const loadTrades = async (isRefresh = false) => {
    try {
      setError("");

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get("/admin/trades");

      setTrades(response.data?.data || []);
    } catch (err) {
      console.error("Admin trades error:", err);

      setError(
        err.userMessage ||
          err.response?.data?.message ||
          "Unable to load trades."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTrades();
  }, []);

  const symbols = useMemo(() => {
    return [
      ...new Set(
        trades
          .map((trade) => trade.symbol?.symbol)
          .filter(Boolean)
      ),
    ].sort();
  }, [trades]);

  const filteredTrades = useMemo(() => {
    const query = search.trim().toLowerCase();

    return trades.filter((trade) => {
      const matchesSearch =
        !query ||
        trade.id?.toLowerCase().includes(query) ||
        trade.orderId?.toLowerCase().includes(query) ||
        trade.user?.fullName?.toLowerCase().includes(query) ||
        trade.user?.email?.toLowerCase().includes(query) ||
        trade.account?.accountNumber
          ?.toLowerCase()
          .includes(query) ||
        trade.symbol?.symbol?.toLowerCase().includes(query);

      const matchesSide =
        sideFilter === "all" ||
        trade.side?.toLowerCase() === sideFilter;

      const matchesSymbol =
        symbolFilter === "all" ||
        trade.symbol?.symbol === symbolFilter;

      return matchesSearch && matchesSide && matchesSymbol;
    });
  }, [trades, search, sideFilter, symbolFilter]);

  const stats = useMemo(() => {
    const buyCount = trades.filter(
      (trade) => trade.side === "buy"
    ).length;

    const sellCount = trades.filter(
      (trade) => trade.side === "sell"
    ).length;

    const realizedPnl = trades.reduce(
      (total, trade) =>
        total + Number(trade.realizedPnl || 0),
      0
    );

    return {
      total: trades.length,
      buy: buyCount,
      sell: sellCount,
      realizedPnl,
    };
  }, [trades]);

  const formatMoney = (value) => {
    const number = Number(value || 0);

    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number);
  };

  const formatPrice = (value) => {
    if (value === null || value === undefined) {
      return "—";
    }

    return Number(value).toFixed(2);
  };

  const formatDate = (value) => {
    if (!value) {
      return "—";
    }

    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const clearFilters = () => {
    setSearch("");
    setSideFilter("all");
    setSymbolFilter("all");
  };

  const hasFilters =
    search.trim() !== "" ||
    sideFilter !== "all" ||
    symbolFilter !== "all";

  return (
    <div className="admin-page trades-page">
      <div className="page-header">
        <div>
          <button
            className="back-button"
            onClick={() => navigate("/dashboard")}
          >
            ← Dashboard
          </button>

          <h1>Trades History</h1>

          <p>
            Monitor all executed trades across the platform.
          </p>
        </div>

        <button
          className="refresh-button"
          onClick={() => loadTrades(true)}
          disabled={loading || refreshing}
        >
          <RefreshCw
            size={17}
            className={refreshing ? "spin" : ""}
          />

          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="trade-stats">
        <div className="stat-card">
          <div className="stat-icon">
            <TrendingUp size={20} />
          </div>

          <div>
            <span>Total Trades</span>
            <strong>{stats.total}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon buy-icon">
            <ArrowUpRight size={20} />
          </div>

          <div>
            <span>BUY Trades</span>
            <strong>{stats.buy}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon sell-icon">
            <ArrowDownRight size={20} />
          </div>

          <div>
            <span>SELL Trades</span>
            <strong>{stats.sell}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div
            className={`stat-icon ${
              stats.realizedPnl >= 0
                ? "pnl-positive"
                : "pnl-negative"
            }`}
          >
            {stats.realizedPnl >= 0 ? (
              <TrendingUp size={20} />
            ) : (
              <TrendingDown size={20} />
            )}
          </div>

          <div>
            <span>Realized P/L</span>

            <strong
              className={
                stats.realizedPnl >= 0
                  ? "text-positive"
                  : "text-negative"
              }
            >
              {stats.realizedPnl >= 0 ? "+" : "-"}$
              {formatMoney(Math.abs(stats.realizedPnl))}
            </strong>
          </div>
        </div>
      </div>

      <div className="trades-toolbar">
        <div className="search-box">
          <Search size={18} />

          <input
            type="text"
            placeholder="Search user, email, account, symbol or trade ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <select
          value={sideFilter}
          onChange={(event) => setSideFilter(event.target.value)}
        >
          <option value="all">All Sides</option>
          <option value="buy">BUY</option>
          <option value="sell">SELL</option>
        </select>

        <select
          value={symbolFilter}
          onChange={(event) => setSymbolFilter(event.target.value)}
        >
          <option value="all">All Symbols</option>

          {symbols.map((symbol) => (
            <option key={symbol} value={symbol}>
              {symbol}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            className="clear-filter-button"
            onClick={clearFilters}
          >
            <X size={16} />
            Clear
          </button>
        )}
      </div>

      <div className="trades-result-info">
        <span>
          Showing <strong>{filteredTrades.length}</strong> of{" "}
          <strong>{trades.length}</strong> trades
        </span>
      </div>

      {loading ? (
        <div className="state-card">
          <div className="loading-spinner" />
          <p>Loading trades...</p>
        </div>
      ) : error ? (
        <div className="state-card error-state">
          <div className="state-icon">!</div>

          <h3>Unable to load trades</h3>

          <p>{error}</p>

          <button
            className="retry-button"
            onClick={() => loadTrades()}
          >
            Try Again
          </button>
        </div>
      ) : filteredTrades.length === 0 ? (
        <div className="state-card">
          <div className="state-icon">
            <TrendingUp size={24} />
          </div>

          <h3>
            {trades.length === 0
              ? "No trades found"
              : "No matching trades"}
          </h3>

          <p>
            {trades.length === 0
              ? "There are currently no executed trades."
              : "Try changing your search or filters."}
          </p>

          {hasFilters && (
            <button
              className="retry-button"
              onClick={clearFilters}
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="trades-table-wrapper">
          <table className="trades-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Account</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Volume</th>
                <th>Execution Price</th>
                <th>Commission</th>
                <th>Swap</th>
                <th>Realized P/L</th>
                <th>Executed At</th>
              </tr>
            </thead>

            <tbody>
              {filteredTrades.map((trade) => {
                const pnl = Number(
                  trade.realizedPnl || 0
                );

                const isBuy = trade.side === "buy";

                return (
                  <tr key={trade.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">
                          {trade.user?.fullName
                            ?.charAt(0)
                            ?.toUpperCase() || "U"}
                        </div>

                        <div>
                          <strong>
                            {trade.user?.fullName || "Unknown"}
                          </strong>

                          <span>
                            {trade.user?.email || "—"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="account-number">
                        {trade.account?.accountNumber || "—"}
                      </span>

                      <small>
                        {trade.account?.currency || ""}
                      </small>
                    </td>

                    <td>
                      <div className="symbol-cell">
                        <strong>
                          {trade.symbol?.symbol || "—"}
                        </strong>

                        <span>
                          {trade.symbol?.name || "—"}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`side-badge ${
                          isBuy ? "buy" : "sell"
                        }`}
                      >
                        {isBuy ? (
                          <ArrowUpRight size={14} />
                        ) : (
                          <ArrowDownRight size={14} />
                        )}

                        {trade.side?.toUpperCase()}
                      </span>
                    </td>

                    <td>
                      <strong>{trade.volume}</strong>
                    </td>

                    <td>
                      {formatPrice(trade.executionPrice)}
                    </td>

                    <td>
                      $
                      {formatMoney(trade.commission)}
                    </td>

                    <td>
                      $
                      {formatMoney(trade.swap)}
                    </td>

                    <td>
                      <strong
                        className={
                          pnl >= 0
                            ? "text-positive"
                            : "text-negative"
                        }
                      >
                        {pnl >= 0 ? "+" : "-"}$
                        {formatMoney(Math.abs(pnl))}
                      </strong>
                    </td>

                    <td>
                      <span className="date-cell">
                        {formatDate(trade.executedAt)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Trades;