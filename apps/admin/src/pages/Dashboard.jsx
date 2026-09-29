import { useEffect, useState } from "react";
import {
  Users,
  UserCheck,
  Wallet,
  ClipboardList,
  Activity,
  BarChart3,
  RefreshCw,
  LogOut,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import AdminLayout from "../components/AdminLayout";

function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedUser = localStorage.getItem(
      "tradex_admin_user"
    );

    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem(
          "tradex_admin_user"
        );
      }
    }

    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get(
        "/admin/dashboard"
      );

      setStats(response.data?.data || null);
    } catch (error) {
      console.error(
        "Dashboard loading error:",
        error
      );

      setError(
        error.userMessage ||
          error.response?.data?.message ||
          "Unable to load dashboard."
      );
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(
      "tradex_admin_token"
    );

    localStorage.removeItem(
      "tradex_admin_user"
    );

    navigate("/login");
  };

  const cards = [
    {
      label: "Total Users",
      value: stats?.totalUsers ?? 0,
      icon: Users,
    },
    {
      label: "Active Users",
      value: stats?.activeUsers ?? 0,
      icon: UserCheck,
    },
    {
      label: "Trading Accounts",
      value: stats?.totalAccounts ?? 0,
      icon: Wallet,
    },
    {
      label: "Total Orders",
      value: stats?.totalOrders ?? 0,
      icon: ClipboardList,
    },
    {
      label: "Open Positions",
      value: stats?.openPositions ?? 0,
      icon: Activity,
    },
    {
      label: "Total Trades",
      value: stats?.totalTrades ?? 0,
      icon: BarChart3,
    },
    {
      label: "Active Symbols",
      value: stats?.activeSymbols ?? 0,
      icon: Activity,
    },
  ];

  return (
    <AdminLayout title="Dashboard">
      <div className="admin-page">

      {/* TOP BAR */}

      {/* MAIN */}
      <main className="admin-dashboard">

        {/* HEADER */}
        <div className="admin-page-heading">

          <div>
            <span className="eyebrow">
              OVERVIEW
            </span>

            <h1>
              Dashboard
            </h1>

            <p>
              Monitor the TradeX trading
              platform.
            </p>
          </div>

          <button
            className="refresh-button"
            onClick={loadDashboard}
            disabled={loading}
          >
            <RefreshCw
              size={16}
              className={
                loading
                  ? "spin"
                  : ""
              }
            />

            {loading
              ? "Loading..."
              : "Refresh"}
          </button>

        </div>

        {/* ERROR */}
        {error && (
          <div className="admin-error">
            {error}
          </div>
        )}

        {/* STAT CARDS */}
        <section className="admin-stat-grid">

          {cards.map((card) => {

            const Icon = card.icon;

            return (
              <div
                className="admin-stat-card"
                key={card.label}
              >

                <div className="admin-stat-icon">
                  <Icon size={20} />
                </div>

                <div className="admin-stat-content">

                  <span>
                    {card.label}
                  </span>

                  <strong>
                    {loading
                      ? "—"
                      : card.value}
                  </strong>

                </div>

              </div>
            );
          })}

        </section>

        {/* PLATFORM STATUS */}
        <section className="platform-status">

          <div>
            <span className="status-dot"></span>

            <div>
              <strong>
                Trading Platform
              </strong>

              <p>
                API and database services
                are connected.
              </p>
            </div>
          </div>

          <span className="status-online">
            ONLINE
          </span>

        </section>

      </main>

    </div>
    </AdminLayout>
    
  );
}

export default Dashboard;