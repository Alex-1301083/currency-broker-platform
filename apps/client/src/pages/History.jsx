import { useEffect, useMemo, useState } from "react";

import api from "../services/api";

export default function History() {
  // ==========================================
  // HISTORY DATA
  // ==========================================

  const [orders, setOrders] = useState([]);
  const [trades, setTrades] = useState([]);
  const [positions, setPositions] = useState([]);

  // ==========================================
  // UI STATE
  // ==========================================

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("orders");

  // ==========================================
  // FILTER STATE
  // ==========================================

  const [symbolFilter, setSymbolFilter] = useState("ALL");
  const [sideFilter, setSideFilter] = useState("ALL");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // ==========================================
  // PAGINATION
  // ==========================================

  const [currentPage, setCurrentPage] = useState(1);

  const ITEMS_PER_PAGE = 10;

  // ==========================================
  // LOAD HISTORY
  // ==========================================

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError("");

      const [
  ordersResponse,
  tradesResponse,
  positionsResponse,
] = await Promise.all([
  api.get("/order"),
  api.get("/trades"),
  api.get("/positions/history"),
]);

      console.log(
        "ORDERS HISTORY:",
        ordersResponse.data
      );

      console.log(
        "TRADES HISTORY:",
        tradesResponse.data
      );

      console.log(
        "POSITIONS HISTORY:",
        positionsResponse.data
      );

      setOrders(
        ordersResponse.data?.data?.orders || []
      );

      setTrades(
        tradesResponse.data?.data?.trades || []
      );

      setPositions(
        positionsResponse.data?.data?.positions || []
      );

      setCurrentPage(1);
    } catch (error) {
      console.error(
        "History loading error:",
        error
      );

      setError(
        error.response?.data?.message ||
          "Failed to load trading history."
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // INITIAL LOAD
  // ==========================================

  useEffect(() => {
    loadHistory();
  }, []);

  // ==========================================
  // HELPERS
  // ==========================================

  const formatDate = (date) => {
    if (!date) {
      return "-";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "-";
    }

    return parsedDate.toLocaleString();
  };

  const formatNumber = (value, digits = 2) => {
    const number = Number(value);

    return Number.isFinite(number)
      ? number.toFixed(digits)
      : "-";
  };

  const getSide = (item) => {
    return String(item?.side || "").toUpperCase();
  };

  const getDigits = (item) => {
    const digits = Number(item?.digits);

    return Number.isFinite(digits)
      ? digits
      : 2;
  };

  // ==========================================
  // DATE FILTER HELPER
  // ==========================================

  const isWithinDateRange = (
    item,
    dateField
  ) => {
    const rawDate = item?.[dateField];

    if (!rawDate) {
      return false;
    }

    const itemDate = new Date(rawDate);

    if (Number.isNaN(itemDate.getTime())) {
      return false;
    }

    // FROM DATE
    if (fromDate) {
      const startDate = new Date(
        `${fromDate}T00:00:00`
      );

      if (itemDate < startDate) {
        return false;
      }
    }

    // TO DATE
    if (toDate) {
      const endDate = new Date(
        `${toDate}T23:59:59.999`
      );

      if (itemDate > endDate) {
        return false;
      }
    }

    return true;
  };

  // ==========================================
  // AVAILABLE SYMBOLS
  // ==========================================

  const availableSymbols = useMemo(() => {
    const symbols = [
      ...orders.map(
        (item) => item.symbol
      ),

      ...trades.map(
        (item) => item.symbol
      ),

      ...positions.map(
        (item) => item.symbol
      ),
    ].filter(Boolean);

    return [
      ...new Set(symbols),
    ].sort();
  }, [
    orders,
    trades,
    positions,
  ]);

  // ==========================================
  // FILTER ORDERS
  // ==========================================

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const symbolMatch =
        symbolFilter === "ALL" ||
        order.symbol === symbolFilter;

      const sideMatch =
        sideFilter === "ALL" ||
        getSide(order) === sideFilter;

      const dateMatch =
        isWithinDateRange(
          order,
          "created_at"
        );

      return (
        symbolMatch &&
        sideMatch &&
        dateMatch
      );
    });
  }, [
    orders,
    symbolFilter,
    sideFilter,
    fromDate,
    toDate,
  ]);

  // ==========================================
  // FILTER TRADES
  // ==========================================

  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      const symbolMatch =
        symbolFilter === "ALL" ||
        trade.symbol === symbolFilter;

      const sideMatch =
        sideFilter === "ALL" ||
        getSide(trade) === sideFilter;

      const dateMatch =
        isWithinDateRange(
          trade,
          "executed_at"
        );

      return (
        symbolMatch &&
        sideMatch &&
        dateMatch
      );
    });
  }, [
    trades,
    symbolFilter,
    sideFilter,
    fromDate,
    toDate,
  ]);

  // ==========================================
  // FILTER CLOSED POSITIONS
  // ==========================================

  const filteredPositions = useMemo(() => {
    return positions.filter((position) => {
      const symbolMatch =
        symbolFilter === "ALL" ||
        position.symbol === symbolFilter;

      const sideMatch =
        sideFilter === "ALL" ||
        getSide(position) === sideFilter;

      const dateMatch =
        isWithinDateRange(
          position,
          "closed_at"
        );

      return (
        symbolMatch &&
        sideMatch &&
        dateMatch
      );
    });
  }, [
    positions,
    symbolFilter,
    sideFilter,
    fromDate,
    toDate,
  ]);

  // ==========================================
  // ACTIVE DATA
  // ==========================================

  const activeData =
    activeTab === "orders"
      ? filteredOrders
      : activeTab === "trades"
        ? filteredTrades
        : filteredPositions;

  // ==========================================
  // PAGINATION
  // ==========================================

  const totalItems =
    activeData.length;

  const totalPages = Math.max(
    1,
    Math.ceil(
      totalItems / ITEMS_PER_PAGE
    )
  );

  const safeCurrentPage = Math.min(
    currentPage,
    totalPages
  );

  const startIndex =
    (safeCurrentPage - 1) *
    ITEMS_PER_PAGE;

  const endIndex =
    startIndex + ITEMS_PER_PAGE;

  const paginatedOrders =
    filteredOrders.slice(
      startIndex,
      endIndex
    );

  const paginatedTrades =
    filteredTrades.slice(
      startIndex,
      endIndex
    );

  const paginatedPositions =
    filteredPositions.slice(
      startIndex,
      endIndex
    );

  const showingFrom =
    totalItems === 0
      ? 0
      : startIndex + 1;

  const showingTo = Math.min(
    endIndex,
    totalItems
  );

  // ==========================================
  // SUMMARY
  // ==========================================

  const totalTrades =
    filteredTrades.length;

  const totalClosedPositions =
    filteredPositions.length;

  const totalOrders =
    filteredOrders.length;

  const realizedPnl =
    filteredTrades.reduce(
      (total, trade) => {
        const pnl = Number(
          trade.realized_pnl ??
            trade.pnl ??
            0
        );

        return (
          total +
          (Number.isFinite(pnl)
            ? pnl
            : 0)
        );
      },
      0
    );

  const winningTrades =
    filteredTrades.filter(
      (trade) => {
        const pnl = Number(
          trade.realized_pnl ??
            trade.pnl ??
            0
        );

        return pnl > 0;
      }
    ).length;

  const losingTrades =
    filteredTrades.filter(
      (trade) => {
        const pnl = Number(
          trade.realized_pnl ??
            trade.pnl ??
            0
        );

        return pnl < 0;
      }
    ).length;

  // ==========================================
  // CLEAR FILTERS
  // ==========================================

  const clearFilters = () => {
    setSymbolFilter("ALL");
    setSideFilter("ALL");
    setFromDate("");
    setToDate("");
    setCurrentPage(1);
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="history-page">

      {/* =====================================
          HEADER
      ====================================== */}

      <div className="history-page-header">

        <div>
          <h2>
            Trading History
          </h2>

          <p>
            Orders, executions and
            closed positions
          </p>
        </div>

        <button
          type="button"
          className="history-refresh-btn"
          onClick={loadHistory}
          disabled={loading}
        >
          {loading
            ? "Loading..."
            : "Refresh"}
        </button>

      </div>

      {/* =====================================
          SUMMARY CARDS
      ====================================== */}

      <div className="history-summary-grid">

        <div className="history-summary-card">
          <span>
            Total Orders
          </span>

          <strong>
            {totalOrders}
          </strong>
        </div>

        <div className="history-summary-card">
          <span>
            Total Trades
          </span>

          <strong>
            {totalTrades}
          </strong>
        </div>

        <div className="history-summary-card">
          <span>
            Closed Positions
          </span>

          <strong>
            {totalClosedPositions}
          </strong>
        </div>

        <div className="history-summary-card">
          <span>
            Realized P/L
          </span>

          <strong
            className={
              realizedPnl >= 0
                ? "pnl-positive"
                : "pnl-negative"
            }
          >
            $
            {realizedPnl.toFixed(2)}
          </strong>
        </div>

        <div className="history-summary-card">
          <span>
            Wins / Losses
          </span>

          <strong>
            {winningTrades}
            {" / "}
            {losingTrades}
          </strong>
        </div>

      </div>

      {/* =====================================
          FILTER BAR
      ====================================== */}

      <div className="history-filter-bar">

        {/* SYMBOL */}

        <div className="history-filter-group">

          <label>
            Symbol
          </label>

          <select
            value={symbolFilter}
            onChange={(event) => {
              setSymbolFilter(
                event.target.value
              );

              setCurrentPage(1);
            }}
          >

            <option value="ALL">
              All Symbols
            </option>

            {availableSymbols.map(
              (symbol) => (
                <option
                  key={symbol}
                  value={symbol}
                >
                  {symbol}
                </option>
              )
            )}

          </select>

        </div>

        {/* SIDE */}

        <div className="history-filter-group">

          <label>
            Side
          </label>

          <select
            value={sideFilter}
            onChange={(event) => {
              setSideFilter(
                event.target.value
              );

              setCurrentPage(1);
            }}
          >

            <option value="ALL">
              All
            </option>

            <option value="BUY">
              BUY
            </option>

            <option value="SELL">
              SELL
            </option>

          </select>

        </div>

        {/* FROM DATE */}

        <div className="history-filter-group">

          <label>
            From Date
          </label>

          <input
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(
                event.target.value
              );

              setCurrentPage(1);
            }}
          />

        </div>

        {/* TO DATE */}

        <div className="history-filter-group">

          <label>
            To Date
          </label>

          <input
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(
                event.target.value
              );

              setCurrentPage(1);
            }}
          />

        </div>

        {/* CLEAR */}

        <button
          type="button"
          className="history-clear-btn"
          onClick={clearFilters}
        >
          Clear Filters
        </button>

      </div>

      {/* =====================================
          TABS
      ====================================== */}

      <div className="history-tabs">

        <button
          type="button"
          className={
            activeTab === "orders"
              ? "history-tab active"
              : "history-tab"
          }
          onClick={() => {
            setActiveTab("orders");
            setCurrentPage(1);
          }}
        >
          Orders
          <span>
            {filteredOrders.length}
          </span>
        </button>

        <button
          type="button"
          className={
            activeTab === "trades"
              ? "history-tab active"
              : "history-tab"
          }
          onClick={() => {
            setActiveTab("trades");
            setCurrentPage(1);
          }}
        >
          Trades
          <span>
            {filteredTrades.length}
          </span>
        </button>

        <button
          type="button"
          className={
            activeTab === "positions"
              ? "history-tab active"
              : "history-tab"
          }
          onClick={() => {
            setActiveTab("positions");
            setCurrentPage(1);
          }}
        >
          Closed Positions
          <span>
            {filteredPositions.length}
          </span>
        </button>

      </div>

      {/* =====================================
          ERROR
      ====================================== */}

      {error && (
        <div className="history-error">
          {error}
        </div>
      )}

      {/* =====================================
          LOADING
      ====================================== */}

      {loading ? (
        <div className="history-empty">
          Loading history...
        </div>
      ) : (
        <>
          {/* =================================
              TABLE WRAPPER
          ================================== */}

          <div className="history-table-wrapper">

            {/* =================================
                ORDERS TABLE
            ================================== */}

            {activeTab === "orders" && (
              <table className="history-table">

                <thead>
                  <tr>

                    <th>
                      Symbol
                    </th>

                    <th>
                      Side
                    </th>

                    <th>
                      Type
                    </th>

                    <th>
                      Volume
                    </th>

                    <th>
                      Price
                    </th>

                    <th>
                      Status
                    </th>

                    <th>
                      Date
                    </th>

                  </tr>
                </thead>

                <tbody>

                  {paginatedOrders.length ===
                  0 ? (
                    <tr>
                      <td
                        colSpan="7"
                        className="history-empty-cell"
                      >
                        No orders found.
                      </td>
                    </tr>
                  ) : (
                    paginatedOrders.map(
                      (order) => {
                        const side =
                          getSide(order);

                        const digits =
                          getDigits(order);

                        const displayPrice =
                          order.filled_price ??
                          order.price;

                        return (
                          <tr
                            key={order.id}
                          >

                            <td>
                              <strong>
                                {order.symbol ||
                                  "-"}
                              </strong>
                            </td>

                            <td>
                              <span
                                className={
                                  side ===
                                  "BUY"
                                    ? "history-buy"
                                    : "history-sell"
                                }
                              >
                                {side}
                              </span>
                            </td>

                            <td>
                              {order.order_type ||
                                "-"}
                            </td>

                            <td>
                              {formatNumber(
                                order.volume
                              )}
                            </td>

                            <td>
                              {formatNumber(
                                displayPrice,
                                digits
                              )}
                            </td>

                            <td>
                              {order.status ||
                                "-"}
                            </td>

                            <td>
                              {formatDate(
                                order.created_at
                              )}
                            </td>

                          </tr>
                        );
                      }
                    )
                  )}

                </tbody>

              </table>
            )}

            {/* =================================
                TRADES TABLE
            ================================== */}

            {activeTab === "trades" && (
              <table className="history-table">

                <thead>
                  <tr>

                    <th>
                      Symbol
                    </th>

                    <th>
                      Side
                    </th>

                    <th>
                      Volume
                    </th>

                    <th>
                      Price
                    </th>

                    <th>
                      P/L
                    </th>

                    <th>
                      Date
                    </th>

                  </tr>
                </thead>

                <tbody>

                  {paginatedTrades.length ===
                  0 ? (
                    <tr>
                      <td
                        colSpan="6"
                        className="history-empty-cell"
                      >
                        No trades found.
                      </td>
                    </tr>
                  ) : (
                    paginatedTrades.map(
                      (trade) => {
                        const side =
                          getSide(trade);

                        const pnl =
                          Number(
                            trade.realized_pnl ??
                              trade.pnl ??
                              0
                          );

                        const digits =
                          getDigits(trade);

                        return (
                          <tr
                            key={trade.id}
                          >

                            <td>
                              <strong>
                                {trade.symbol ||
                                  "-"}
                              </strong>
                            </td>

                            <td>
                              <span
                                className={
                                  side ===
                                  "BUY"
                                    ? "history-buy"
                                    : "history-sell"
                                }
                              >
                                {side}
                              </span>
                            </td>

                            <td>
                              {formatNumber(
                                trade.volume
                              )}
                            </td>

                            <td>
                              {formatNumber(
                                trade.execution_price,
                                digits
                              )}
                            </td>

                            <td
                              className={
                                pnl >= 0
                                  ? "pnl-positive"
                                  : "pnl-negative"
                              }
                            >
                              $
                              {pnl.toFixed(2)}
                            </td>

                            <td>
                              {formatDate(
                                trade.executed_at
                              )}
                            </td>

                          </tr>
                        );
                      }
                    )
                  )}

                </tbody>

              </table>
            )}

            {/* =================================
                CLOSED POSITIONS TABLE
            ================================== */}

            {activeTab === "positions" && (
              <table className="history-table">

                <thead>
                  <tr>

                    <th>
                      Symbol
                    </th>

                    <th>
                      Side
                    </th>

                    <th>
                      Volume
                    </th>

                    <th>
                      Entry
                    </th>

                    <th>
                      Close
                    </th>

                    <th>
                      P/L
                    </th>

                    <th>
                      Closed At
                    </th>

                  </tr>
                </thead>

                <tbody>

                  {paginatedPositions.length ===
                  0 ? (
                    <tr>
                      <td
                        colSpan="7"
                        className="history-empty-cell"
                      >
                        No closed positions
                        found.
                      </td>
                    </tr>
                  ) : (
                    paginatedPositions.map(
                      (position) => {
                        const side =
                          getSide(position);

                        const pnl =
                          Number(
                            position.realized_pnl ??
                              position.pnl ??
                              0
                          );

                        const digits =
                          getDigits(position);

                        return (
                          <tr
                            key={position.id}
                          >

                            <td>
                              <strong>
                                {position.symbol ||
                                  "-"}
                              </strong>
                            </td>

                            <td>
                              <span
                                className={
                                  side ===
                                  "BUY"
                                    ? "history-buy"
                                    : "history-sell"
                                }
                              >
                                {side}
                              </span>
                            </td>

                            <td>
                              {formatNumber(
                                position.volume
                              )}
                            </td>

                            <td>
                              {formatNumber(
                                position.entry_price,
                                digits
                              )}
                            </td>

                            <td>
                              {formatNumber(
                                position.current_price,
                                digits
                              )}
                            </td>

                            <td
                              className={
                                pnl >= 0
                                  ? "pnl-positive"
                                  : "pnl-negative"
                              }
                            >
                              $
                              {pnl.toFixed(2)}
                            </td>

                            <td>
                              {formatDate(
                                position.closed_at
                              )}
                            </td>

                          </tr>
                        );
                      }
                    )
                  )}

                </tbody>

              </table>
            )}

          </div>

          {/* =================================
              PAGINATION
          ================================== */}

          <div className="history-pagination">

            <div className="history-pagination-info">

              Showing{" "}

              <strong>
                {showingFrom}
              </strong>

              {" - "}

              <strong>
                {showingTo}
              </strong>

              {" of "}

              <strong>
                {totalItems}
              </strong>

            </div>

            <div className="history-pagination-controls">

              {/* PREVIOUS */}

              <button
                type="button"
                disabled={
                  safeCurrentPage === 1
                }
                onClick={() =>
                  setCurrentPage(
                    (page) =>
                      Math.max(
                        1,
                        page - 1
                      )
                  )
                }
              >
                Previous
              </button>

              {/* PAGE NUMBERS */}

              {Array.from(
                {
                  length: totalPages,
                },
                (_, index) => {
                  const page =
                    index + 1;

                  return (
                    <button
                      key={page}
                      type="button"
                      className={
                        safeCurrentPage ===
                        page
                          ? "active"
                          : ""
                      }
                      onClick={() =>
                        setCurrentPage(
                          page
                        )
                      }
                    >
                      {page}
                    </button>
                  );
                }
              )}

              {/* NEXT */}

              <button
                type="button"
                disabled={
                  safeCurrentPage ===
                  totalPages
                }
                onClick={() =>
                  setCurrentPage(
                    (page) =>
                      Math.min(
                        totalPages,
                        page + 1
                      )
                  )
                }
              >
                Next
              </button>

            </div>

          </div>
        </>
      )}

    </div>
  );
}