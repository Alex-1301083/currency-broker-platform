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

function Positions() {
  const navigate = useNavigate();

  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [sideFilter, setSideFilter] = useState("all");
  const [symbolFilter, setSymbolFilter] = useState("all");

  const loadPositions = async (isRefresh = false) => {
    try {
      setError("");

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get("/admin/positions");

      setPositions(response.data?.data || []);
    } catch (err) {
      console.error("Admin positions error:", err);

      setError(
        err.userMessage ||
          err.response?.data?.message ||
          "Unable to load open positions."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPositions();
  }, []);

  const symbols = useMemo(() => {
    return [
      ...new Set(
        positions
          .map((position) => position.symbol?.symbol)
          .filter(Boolean)
      ),
    ].sort();
  }, [positions]);

  const filteredPositions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return positions.filter((position) => {
      const matchesSearch =
        !query ||
        position.id?.toLowerCase().includes(query) ||
        position.user?.fullName?.toLowerCase().includes(query) ||
        position.user?.email?.toLowerCase().includes(query) ||
        position.account?.accountNumber
          ?.toLowerCase()
          .includes(query) ||
        position.symbol?.symbol?.toLowerCase().includes(query);

      const matchesSide =
        sideFilter === "all" ||
        position.side?.toLowerCase() === sideFilter;

      const matchesSymbol =
        symbolFilter === "all" ||
        position.symbol?.symbol === symbolFilter;

      return matchesSearch && matchesSide && matchesSymbol;
    });
  }, [positions, search, sideFilter, symbolFilter]);

  const stats = useMemo(() => {
    const buyCount = positions.filter(
      (position) => position.side === "buy"
    ).length;

    const sellCount = positions.filter(
      (position) => position.side === "sell"
    ).length;

    const floatingPnl = positions.reduce(
      (total, position) =>
        total + Number(position.unrealizedPnl || 0),
      0
    );

    return {
      total: positions.length,
      buy: buyCount,
      sell: sellCount,
      floatingPnl,
    };
  }, [positions]);

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
    <div className="admin-page positions-page">
      <div className="page-header">
        <div>
          <button
            className="back-button"
            onClick={() => navigate("/dashboard")}
          >
            ← Dashboard
          </button>

          <h1>Open Positions</h1>

          <p>
            Monitor all currently open trading positions across the
            platform.
          </p>
        </div>

        <button
          className="refresh-button"
          onClick={() => loadPositions(true)}
          disabled={loading || refreshing}
        >
          <RefreshCw
            size={17}
            className={refreshing ? "spin" : ""}
          />

          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="position-stats">
        <div className="stat-card">
          <div className="stat-icon">
            <TrendingUp size={20} />
          </div>

          <div>
            <span>Total Open</span>
            <strong>{stats.total}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon buy-icon">
            <ArrowUpRight size={20} />
          </div>

          <div>
            <span>BUY Positions</span>
            <strong>{stats.buy}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon sell-icon">
            <ArrowDownRight size={20} />
          </div>

          <div>
            <span>SELL Positions</span>
            <strong>{stats.sell}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div
            className={`stat-icon ${
              stats.floatingPnl >= 0
                ? "pnl-positive"
                : "pnl-negative"
            }`}
          >
            {stats.floatingPnl >= 0 ? (
              <TrendingUp size={20} />
            ) : (
              <TrendingDown size={20} />
            )}
          </div>

          <div>
            <span>Floating P/L</span>

            <strong
              className={
                stats.floatingPnl >= 0
                  ? "text-positive"
                  : "text-negative"
              }
            >
              {stats.floatingPnl >= 0 ? "+" : "-"}$
              {formatMoney(Math.abs(stats.floatingPnl))}
            </strong>
          </div>
        </div>
      </div>

      <div className="positions-toolbar">
        <div className="search-box">
          <Search size={18} />

          <input
            type="text"
            placeholder="Search user, email, account, symbol or position ID..."
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

      <div className="positions-result-info">
        <span>
          Showing{" "}
          <strong>{filteredPositions.length}</strong> of{" "}
          <strong>{positions.length}</strong> positions
        </span>
      </div>

      {loading ? (
        <div className="state-card">
          <div className="loading-spinner" />
          <p>Loading open positions...</p>
        </div>
      ) : error ? (
        <div className="state-card error-state">
          <div className="state-icon">!</div>

          <h3>Unable to load positions</h3>

          <p>{error}</p>

          <button
            className="retry-button"
            onClick={() => loadPositions()}
          >
            Try Again
          </button>
        </div>
      ) : filteredPositions.length === 0 ? (
        <div className="state-card">
          <div className="state-icon">
            <TrendingUp size={24} />
          </div>

          <h3>
            {positions.length === 0
              ? "No open positions"
              : "No matching positions"}
          </h3>

          <p>
            {positions.length === 0
              ? "There are currently no open trading positions."
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
        <div className="positions-table-wrapper">
          <table className="positions-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Account</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Volume</th>
                <th>Entry Price</th>
                <th>Current Price</th>
                <th>SL</th>
                <th>TP</th>
                <th>Floating P/L</th>
                <th>Margin</th>
                <th>Status</th>
                <th>Opened</th>
              </tr>
            </thead>

            <tbody>
              {filteredPositions.map((position) => {
                const pnl = Number(
                  position.unrealizedPnl || 0
                );

                const isBuy = position.side === "buy";

                return (
                  <tr key={position.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">
                          {position.user?.fullName
                            ?.charAt(0)
                            ?.toUpperCase() || "U"}
                        </div>

                        <div>
                          <strong>
                            {position.user?.fullName || "Unknown"}
                          </strong>

                          <span>
                            {position.user?.email || "—"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="account-number">
                        {position.account?.accountNumber || "—"}
                      </span>

                      <small>
                        {position.account?.currency || ""}
                      </small>
                    </td>

                    <td>
                      <div className="symbol-cell">
                        <strong>
                          {position.symbol?.symbol || "—"}
                        </strong>

                        <span>
                          {position.symbol?.name || "—"}
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

                        {position.side?.toUpperCase()}
                      </span>
                    </td>

                    <td>
                      <strong>{position.volume}</strong>
                    </td>

                    <td>
                      {formatPrice(position.entryPrice)}
                    </td>

                    <td>
                      {formatPrice(position.currentPrice)}
                    </td>

                    <td>
                      {formatPrice(position.stopLoss)}
                    </td>

                    <td>
                      {formatPrice(position.takeProfit)}
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
                      $
                      {formatMoney(position.marginUsed)}
                    </td>

                    <td>
                      <span className="status-badge open">
                        <span className="status-dot" />
                        OPEN
                      </span>
                    </td>

                    <td>
                      <span className="date-cell">
                        {formatDate(position.openedAt)}
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

export default Positions;