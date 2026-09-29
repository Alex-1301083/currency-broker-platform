import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  ShoppingCart,
  XCircle,
  Clock3,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Eye,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

function Orders() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("all");
  const [sideFilter, setSideFilter] =
    useState("all");

  const [selectedOrder, setSelectedOrder] =
    useState(null);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get(
        "/admin/orders"
      );

      setOrders(
        response.data?.data || []
      );
    } catch (error) {
      console.error(
        "Admin orders error:",
        error
      );

      setError(
        error.userMessage ||
          error.response?.data?.message ||
          "Unable to load orders."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesSearch =
        !query ||
        order.user?.fullName
          ?.toLowerCase()
          .includes(query) ||
        order.user?.email
          ?.toLowerCase()
          .includes(query) ||
        order.symbol?.symbol
          ?.toLowerCase()
          .includes(query) ||
        order.account?.accountNumber
          ?.toLowerCase()
          .includes(query);

      const matchesStatus =
        statusFilter === "all" ||
        order.status === statusFilter;

      const matchesSide =
        sideFilter === "all" ||
        order.side === sideFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesSide
      );
    });
  }, [
    orders,
    search,
    statusFilter,
    sideFilter,
  ]);

  const stats = useMemo(() => {
    return {
      total: orders.length,

      filled: orders.filter(
        (order) =>
          order.status === "filled"
      ).length,

      pending: orders.filter(
        (order) =>
          order.status === "pending"
      ).length,

      rejected: orders.filter(
        (order) =>
          order.status === "rejected"
      ).length,
    };
  }, [orders]);

  const formatPrice = (price) => {
    if (price === null || price === undefined) {
      return "—";
    }

    return Number(price).toLocaleString(
      undefined,
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 5,
      }
    );
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString(
      undefined,
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  };

  return (
    <div className="orders-page">

      {/* Header */}

      <div className="orders-header">

        <div>
          <span className="eyebrow">
            TRADING MANAGEMENT
          </span>

          <h1>Orders</h1>

          <p>
            Monitor all trading orders
            across the platform.
          </p>
        </div>

        <button
          className="refresh-button"
          onClick={loadOrders}
          disabled={loading}
        >
          <RefreshCw
            size={16}
            className={
              loading ? "spin" : ""
            }
          />
          Refresh
        </button>

      </div>

      {/* Stats */}

      <div className="orders-stats">

        <div className="order-stat-card">

          <div className="order-stat-icon blue">
            <ShoppingCart size={18} />
          </div>

          <div>
            <span>Total Orders</span>
            <strong>{stats.total}</strong>
          </div>

        </div>

        <div className="order-stat-card">

          <div className="order-stat-icon green">
            <CheckCircle2 size={18} />
          </div>

          <div>
            <span>Filled</span>
            <strong>{stats.filled}</strong>
          </div>

        </div>

        <div className="order-stat-card">

          <div className="order-stat-icon yellow">
            <Clock3 size={18} />
          </div>

          <div>
            <span>Pending</span>
            <strong>{stats.pending}</strong>
          </div>

        </div>

        <div className="order-stat-card">

          <div className="order-stat-icon red">
            <XCircle size={18} />
          </div>

          <div>
            <span>Rejected</span>
            <strong>{stats.rejected}</strong>
          </div>

        </div>

      </div>

      {/* Filters */}

      <div className="orders-toolbar">

        <div className="orders-search">

          <Search size={16} />

          <input
            type="text"
            placeholder="Search user, email, symbol or account..."
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
          />

          {search && (
            <button
              type="button"
              onClick={() =>
                setSearch("")
              }
            >
              <X size={14} />
            </button>
          )}

        </div>

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value
            )
          }
          className="orders-filter"
        >
          <option value="all">
            All Status
          </option>

          <option value="filled">
            Filled
          </option>

          <option value="pending">
            Pending
          </option>

          <option value="rejected">
            Rejected
          </option>

        </select>

        <select
          value={sideFilter}
          onChange={(event) =>
            setSideFilter(
              event.target.value
            )
          }
          className="orders-filter"
        >
          <option value="all">
            BUY + SELL
          </option>

          <option value="buy">
            BUY
          </option>

          <option value="sell">
            SELL
          </option>

        </select>

      </div>

      {/* Error */}

      {error && (
        <div className="admin-error">
          {error}
        </div>
      )}

      {/* Table */}

      <div className="orders-card">

        <div className="orders-card-header">

          <div>
            <strong>
              Order History
            </strong>

            <span>
              {filteredOrders.length} orders
              displayed
            </span>
          </div>

        </div>

        {loading ? (

          <div className="orders-loading">

            <RefreshCw
              size={20}
              className="spin"
            />

            Loading orders...

          </div>

        ) : filteredOrders.length === 0 ? (

          <div className="orders-empty">

            <ShoppingCart size={28} />

            <strong>
              No orders found
            </strong>

            <span>
              Try changing your search
              or filters.
            </span>

          </div>

        ) : (

          <div className="orders-table-wrapper">

            <table className="orders-table">

              <thead>

                <tr>

                  <th>USER</th>

                  <th>SYMBOL</th>

                  <th>SIDE</th>

                  <th>VOLUME</th>

                  <th>PRICE</th>

                  <th>SL / TP</th>

                  <th>STATUS</th>

                  <th>DATE</th>

                  <th></th>

                </tr>

              </thead>

              <tbody>

                {filteredOrders.map(
                  (order) => (

                    <tr key={order.id}>

                      <td>

                        <div className="order-user">

                          <div className="order-avatar">
                            {order.user?.fullName
                              ?.charAt(0)
                              ?.toUpperCase()}
                          </div>

                          <div>

                            <strong>
                              {order.user?.fullName}
                            </strong>

                            <span>
                              {order.user?.email}
                            </span>

                          </div>

                        </div>

                      </td>

                      <td>

                        <div className="order-symbol">

                          <strong>
                            {order.symbol?.symbol}
                          </strong>

                          <span>
                            {order.symbol?.name}
                          </span>

                        </div>

                      </td>

                      <td>

                        <span
                          className={
                            order.side ===
                            "buy"
                              ? "side-badge buy"
                              : "side-badge sell"
                          }
                        >

                          {order.side ===
                          "buy" ? (
                            <ArrowUp
                              size={13}
                            />
                          ) : (
                            <ArrowDown
                              size={13}
                            />
                          )}

                          {order.side.toUpperCase()}

                        </span>

                      </td>

                      <td>

                        <strong>
                          {order.volume}
                        </strong>

                      </td>

                      <td>

                        <strong>
                          {formatPrice(
                            order.price
                          )}
                        </strong>

                      </td>

                      <td>

                        <div className="sl-tp">

                          <span>
                            SL:{" "}
                            {formatPrice(
                              order.stopLoss
                            )}
                          </span>

                          <span>
                            TP:{" "}
                            {formatPrice(
                              order.takeProfit
                            )}
                          </span>

                        </div>

                      </td>

                      <td>

                        <span
                          className={`order-status ${order.status}`}
                        >
                          {order.status}
                        </span>

                      </td>

                      <td>

                        <span className="order-date">
                          {formatDate(
                            order.createdAt
                          )}
                        </span>

                      </td>

                      <td>

                        <button
                          className="order-view-button"
                          onClick={() =>
                            setSelectedOrder(
                              order
                            )
                          }
                          title="View order"
                        >
                          <Eye size={16} />
                        </button>

                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>

        )}

      </div>

      {/* Order Details Modal */}

      {selectedOrder && (

        <div
          className="modal-overlay"
          onClick={() =>
            setSelectedOrder(null)
          }
        >

          <div
            className="order-details-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <button
              className="modal-close"
              onClick={() =>
                setSelectedOrder(null)
              }
            >
              <X size={18} />
            </button>

            <div className="order-modal-header">

              <div>

                <span className="eyebrow">
                  ORDER DETAILS
                </span>

                <h2>
                  {selectedOrder.symbol?.symbol}
                </h2>

              </div>

              <span
                className={`order-status ${selectedOrder.status}`}
              >
                {selectedOrder.status}
              </span>

            </div>

            <div className="order-detail-grid">

              <div>
                <span>User</span>
                <strong>
                  {selectedOrder.user?.fullName}
                </strong>
              </div>

              <div>
                <span>Email</span>
                <strong>
                  {selectedOrder.user?.email}
                </strong>
              </div>

              <div>
                <span>Account</span>
                <strong>
                  {
                    selectedOrder.account
                      ?.accountNumber
                  }
                </strong>
              </div>

              <div>
                <span>Order Type</span>
                <strong>
                  {selectedOrder.orderType}
                </strong>
              </div>

              <div>
                <span>Side</span>
                <strong
                  className={
                    selectedOrder.side ===
                    "buy"
                      ? "text-active"
                      : "text-inactive"
                  }
                >
                  {selectedOrder.side.toUpperCase()}
                </strong>
              </div>

              <div>
                <span>Volume</span>
                <strong>
                  {selectedOrder.volume}
                </strong>
              </div>

              <div>
                <span>Price</span>
                <strong>
                  {formatPrice(
                    selectedOrder.price
                  )}
                </strong>
              </div>

              <div>
                <span>Stop Loss</span>
                <strong>
                  {formatPrice(
                    selectedOrder.stopLoss
                  )}
                </strong>
              </div>

              <div>
                <span>Take Profit</span>
                <strong>
                  {formatPrice(
                    selectedOrder.takeProfit
                  )}
                </strong>
              </div>

              <div>
                <span>Created</span>
                <strong>
                  {formatDate(
                    selectedOrder.createdAt
                  )}
                </strong>
              </div>

              <div>
                <span>Updated</span>
                <strong>
                  {formatDate(
                    selectedOrder.updatedAt
                  )}
                </strong>
              </div>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

export default Orders;