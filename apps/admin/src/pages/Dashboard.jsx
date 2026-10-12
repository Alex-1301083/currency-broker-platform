
import { useCallback, useEffect, useState } from "react";
import {
  Users,
  UserCheck,
  Wallet,
  ClipboardList,
  Activity,
  BarChart3,
  RefreshCw,
  ShieldCheck,
  ArrowUpRight,
  CircleAlert,
} from "lucide-react";
import api from "../services/api";
import AdminLayout from "../components/AdminLayout";

function Dashboard() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/admin/dashboard");
      const data = response.data?.data;

      if (!data || typeof data !== "object") {
        throw new Error("Dashboard data was not returned by the API.");
      }

      setStats(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Dashboard loading error:", err);

      setError(
        err.userMessage ||
          err.response?.data?.message ||
          err.message ||
          "Unable to load dashboard data."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem("tradex_admin_user");
      if (savedUser) setUser(JSON.parse(savedUser));
    } catch {
      localStorage.removeItem("tradex_admin_user");
    }

    loadDashboard();
  }, [loadDashboard]);

  const cards = [
    {
      label: "Total Users",
      value: stats?.totalUsers,
      icon: Users,
      color: "blue",
    },
    {
      label: "Active Users",
      value: stats?.activeUsers,
      icon: UserCheck,
      color: "green",
    },
    {
      label: "Trading Accounts",
      value: stats?.totalAccounts,
      icon: Wallet,
      color: "purple",
    },
    {
      label: "Total Orders",
      value: stats?.totalOrders,
      icon: ClipboardList,
      color: "orange",
    },
    {
      label: "Open Positions",
      value: stats?.openPositions,
      icon: Activity,
      color: "cyan",
    },
    {
      label: "Total Trades",
      value: stats?.totalTrades,
      icon: BarChart3,
      color: "pink",
    },
    {
      label: "Active Symbols",
      value: stats?.activeSymbols,
      icon: ArrowUpRight,
      color: "yellow",
    },
  ];

  const adminName =
    user?.full_name || user?.name || user?.email?.split("@")[0] || "Admin";

  const formatValue = (value) => {
    if (value === undefined || value === null) return "—";

    const number = Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString("en-IN")
      : String(value);
  };

  return (
    <AdminLayout title="Dashboard">
      <div className="tx-dashboard">
        <section className="tx-dashboard-heading">
          <div>
            <div className="tx-eyebrow">
              <span className="tx-eyebrow-dot" />
              ADMINISTRATION / OVERVIEW
            </div>

            <h2>Welcome back, {adminName}</h2>

            <p>
              Here's what's happening across your TradeX platform.
            </p>
          </div>

          <button
            type="button"
            className="tx-refresh-button"
            onClick={loadDashboard}
            disabled={loading}
          >
            <RefreshCw
              size={16}
              className={loading ? "spin" : ""}
            />
            {loading ? "Refreshing..." : "Refresh data"}
          </button>
        </section>

        {error && (
          <div className="tx-dashboard-error" role="alert">
            <CircleAlert size={19} />
            <div>
              <strong>Dashboard data unavailable</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={loadDashboard}>
              Retry
            </button>
          </div>
        )}

        <section className="tx-dashboard-banner">
          <div className="tx-banner-icon">
            <ShieldCheck size={25} />
          </div>

          <div className="tx-banner-copy">
            <span>TRADEX CONTROL CENTER</span>
            <strong>Platform overview</strong>
            <p>
              Review account activity and trading operations from one place.
            </p>
          </div>

          <div
            className={`tx-api-indicator ${
              error ? "is-error" : stats ? "is-connected" : ""
            }`}
          >
            <span />
            {error
              ? "DATA UNAVAILABLE"
              : stats
                ? "DASHBOARD DATA LOADED"
                : loading
                  ? "CHECKING DATA"
                  : "STATUS UNKNOWN"}
          </div>
        </section>

        <section className="tx-section-heading">
          <div>
            <span className="tx-eyebrow">KEY METRICS</span>
            <h3>Platform statistics</h3>
          </div>

          <span className="tx-updated-time">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : "Waiting for data"}
          </span>
        </section>

        <section className="tx-stat-grid">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <article className="tx-stat-card" key={card.label}>
                <div className={`tx-stat-icon ${card.color}`}>
                  <Icon size={21} strokeWidth={1.8} />
                </div>

                <div className="tx-stat-details">
                  <span>{card.label}</span>
                  <strong>
                    {loading && !stats ? "..." : formatValue(card.value)}
                  </strong>
                  <small>
                    {stats ? "From admin API" : "Awaiting API data"}
                  </small>
                </div>

                <div className="tx-stat-corner">
                  <ArrowUpRight size={17} />
                </div>
              </article>
            );
          })}
        </section>

        <section className="tx-dashboard-bottom">
          <div className="tx-info-card">
            <div className="tx-info-card-heading">
              <div className="tx-small-icon">
                <Activity size={18} />
              </div>
              <div>
                <h3>System overview</h3>
                <p>Dashboard request status</p>
              </div>
            </div>

            <div className="tx-system-row">
              <span>Admin API response</span>
              <strong className={stats ? "tx-text-green" : "tx-text-muted"}>
                {stats ? "Received" : loading ? "Checking..." : "Unavailable"}
              </strong>
            </div>

            <div className="tx-system-row">
              <span>Statistics</span>
              <strong>{stats ? "Loaded" : "Not loaded"}</strong>
            </div>

            <div className="tx-system-row">
              <span>Last successful refresh</span>
              <strong>
                {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}
              </strong>
            </div>
          </div>

          <div className="tx-info-card tx-security-card">
            <div className="tx-security-symbol">
              <ShieldCheck size={24} />
            </div>

            <div>
              <span className="tx-eyebrow">ADMIN ACCESS</span>
              <h3>Manage with care</h3>
              <p>
                Review user status, orders, positions and audit records using
                the navigation menu. Verify important changes before applying
                them.
              </p>
            </div>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

export default Dashboard;
