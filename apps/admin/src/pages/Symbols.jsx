import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bitcoin,
  CircleDollarSign,
  Coins,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

function Symbols() {
  const navigate = useNavigate();

  const [symbols, setSymbols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [assetFilter, setAssetFilter] = useState("all");

  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const loadSymbols = async (isRefresh = false) => {
    try {
      setError("");

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get("/admin/symbols");

      setSymbols(response.data?.data || []);
    } catch (err) {
      console.error("Admin symbols error:", err);

      setError(
        err.userMessage ||
          err.response?.data?.message ||
          "Unable to load symbols.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const updateSymbolStatus = async (symbol) => {
    if (!confirmAction) {
      return;
    }

    try {
      setStatusUpdatingId(symbol.id);
      setError("");

      const response = await api.patch(`/admin/symbols/${symbol.id}/status`, {
        isActive: !symbol.isActive,
      });

      const updatedSymbol = response.data?.data;

      if (updatedSymbol) {
        setSymbols((currentSymbols) =>
          currentSymbols.map((item) =>
            item.id === updatedSymbol.id ? updatedSymbol : item,
          ),
        );
      }

      setConfirmAction(null);
    } catch (err) {
      console.error("Update symbol status error:", err);

      setError(
        err.userMessage ||
          err.response?.data?.message ||
          "Unable to update symbol status.",
      );
    } finally {
      setStatusUpdatingId(null);
    }
  };

  useEffect(() => {
    loadSymbols();
  }, []);

  const filteredSymbols = useMemo(() => {
    const query = search.trim().toLowerCase();

    return symbols.filter((item) => {
      const matchesSearch =
        !query ||
        item.symbol?.toLowerCase().includes(query) ||
        item.name?.toLowerCase().includes(query) ||
        item.baseCurrency?.toLowerCase().includes(query) ||
        item.quoteCurrency?.toLowerCase().includes(query);

      const matchesAsset =
        assetFilter === "all" || item.assetType?.toLowerCase() === assetFilter;

      return matchesSearch && matchesAsset;
    });
  }, [symbols, search, assetFilter]);

  const stats = useMemo(() => {
    const active = symbols.filter((item) => item.isActive).length;

    const forex = symbols.filter((item) => item.assetType === "forex").length;

    const crypto = symbols.filter((item) => item.assetType === "crypto").length;

    const metal = symbols.filter((item) => item.assetType === "metal").length;

    return {
      total: symbols.length,
      active,
      forex,
      crypto,
      metal,
    };
  }, [symbols]);

  const formatPrice = (value, digits = 2) => {
    if (value === null || value === undefined) {
      return "—";
    }

    return Number(value).toFixed(digits);
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined) {
      return "—";
    }

    return Number(value).toLocaleString("en-US", {
      maximumFractionDigits: 8,
    });
  };

  const clearFilters = () => {
    setSearch("");
    setAssetFilter("all");
  };

  const hasFilters = search.trim() !== "" || assetFilter !== "all";

  const getAssetIcon = (assetType) => {
    switch (assetType) {
      case "crypto":
        return <Bitcoin size={18} />;

      case "metal":
        return <Coins size={18} />;

      case "forex":
        return <CircleDollarSign size={18} />;

      default:
        return <Activity size={18} />;
    }
  };

  return (
    <div className="admin-page symbols-page">
      <div className="page-header">
        <div>
          <button
            className="back-button"
            onClick={() => navigate("/dashboard")}
          >
            ← Dashboard
          </button>

          <h1>Symbols / Market</h1>

          <p>Monitor all trading instruments available on the platform.</p>
        </div>

        <button
          className="refresh-button"
          onClick={() => loadSymbols(true)}
          disabled={loading || refreshing}
        >
          <RefreshCw size={17} className={refreshing ? "spin" : ""} />

          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="symbol-stats">
        <div className="stat-card">
          <div className="stat-icon">
            <Activity size={20} />
          </div>

          <div>
            <span>Total Symbols</span>
            <strong>{stats.total}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon buy-icon">
            <Activity size={20} />
          </div>

          <div>
            <span>Active Symbols</span>
            <strong>{stats.active}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <CircleDollarSign size={20} />
          </div>

          <div>
            <span>Forex</span>
            <strong>{stats.forex}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Bitcoin size={20} />
          </div>

          <div>
            <span>Crypto</span>
            <strong>{stats.crypto}</strong>
          </div>
        </div>
      </div>

      <div className="symbols-toolbar">
        <div className="search-box">
          <Search size={18} />

          <input
            type="text"
            placeholder="Search symbol, name or currency..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <select
          value={assetFilter}
          onChange={(event) => setAssetFilter(event.target.value)}
        >
          <option value="all">All Asset Types</option>
          <option value="forex">Forex</option>
          <option value="metal">Metal</option>
          <option value="crypto">Crypto</option>
          <option value="index">Index</option>
          <option value="commodity">Commodity</option>
        </select>

        {hasFilters && (
          <button className="clear-filter-button" onClick={clearFilters}>
            <X size={16} />
            Clear
          </button>
        )}
      </div>

      <div className="symbols-result-info">
        Showing <strong>{filteredSymbols.length}</strong> of{" "}
        <strong>{symbols.length}</strong> symbols
      </div>

      {loading ? (
        <div className="state-card">
          <div className="loading-spinner" />
          <p>Loading symbols...</p>
        </div>
      ) : error ? (
        <div className="state-card error-state">
          <div className="state-icon">!</div>

          <h3>Unable to load symbols</h3>

          <p>{error}</p>

          <button className="retry-button" onClick={() => loadSymbols()}>
            Try Again
          </button>
        </div>
      ) : filteredSymbols.length === 0 ? (
        <div className="state-card">
          <div className="state-icon">
            <Activity size={24} />
          </div>

          <h3>
            {symbols.length === 0 ? "No symbols found" : "No matching symbols"}
          </h3>

          <p>
            {symbols.length === 0
              ? "There are currently no trading symbols."
              : "Try changing your search or filter."}
          </p>

          {hasFilters && (
            <button className="retry-button" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="symbols-table-wrapper">
          <table className="symbols-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Asset Type</th>
                <th>Bid</th>
                <th>Ask</th>
                <th>Spread</th>
                <th>Digits</th>
                <th>Contract Size</th>
                <th>Min Lot</th>
                <th>Max Lot</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredSymbols.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="symbol-main-cell">
                      <div className="symbol-icon">
                        {getAssetIcon(item.assetType)}
                      </div>

                      <div>
                        <strong>{item.symbol}</strong>

                        <span>{item.name}</span>

                        <small>
                          {item.baseCurrency || "—"} /{" "}
                          {item.quoteCurrency || "—"}
                        </small>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span className={`asset-badge ${item.assetType}`}>
                      {item.assetType?.toUpperCase()}
                    </span>
                  </td>

                  <td>
                    <strong>{formatPrice(item.bid, item.digits)}</strong>
                  </td>

                  <td>
                    <strong>{formatPrice(item.ask, item.digits)}</strong>
                  </td>

                  <td>{formatPrice(item.spread, item.digits)}</td>

                  <td>{item.digits}</td>

                  <td>{formatNumber(item.contractSize)}</td>

                  <td>{formatNumber(item.minLot)}</td>

                  <td>{formatNumber(item.maxLot)}</td>

                  <td>
                    <span
                      className={`symbol-status ${
                        item.isActive ? "active" : "inactive"
                      }`}
                    >
                      <span className="status-dot" />

                      {item.isActive ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`symbol-action-button ${
                        item.isActive ? "deactivate" : "activate"
                      }`}
                      disabled={statusUpdatingId === item.id}
                      onClick={() =>
                        setConfirmAction({
                          symbol: item,
                          action: item.isActive ? "deactivate" : "activate",
                        })
                      }
                    >
                      {statusUpdatingId === item.id
                        ? "Updating..."
                        : item.isActive
                          ? "Deactivate"
                          : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmAction && (
        <div className="symbol-confirm-overlay">
          <div className="symbol-confirm-dialog">
            <div className="symbol-confirm-icon">
              {confirmAction.action === "deactivate" ? "!" : "✓"}
            </div>

            <h3>
              {confirmAction.action === "deactivate"
                ? `Deactivate ${confirmAction.symbol.symbol}?`
                : `Activate ${confirmAction.symbol.symbol}?`}
            </h3>

            <p>
              {confirmAction.action === "deactivate"
                ? `This will prevent new trading orders for ${confirmAction.symbol.symbol}. Existing open positions will not be automatically closed.`
                : `This will allow new trading orders for ${confirmAction.symbol.symbol} again.`}
            </p>

            <div className="symbol-confirm-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setConfirmAction(null)}
                disabled={statusUpdatingId !== null}
              >
                Cancel
              </button>

              <button
                type="button"
                className={`confirm-status-button ${confirmAction.action}`}
                onClick={() => updateSymbolStatus(confirmAction.symbol)}
                disabled={statusUpdatingId !== null}
              >
                {statusUpdatingId !== null
                  ? "Updating..."
                  : confirmAction.action === "deactivate"
                    ? "Deactivate"
                    : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Symbols;
