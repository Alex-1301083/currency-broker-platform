import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Activity,
  BarChart3,
  CandlestickChart,
  FileText,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

function AdminLayout({ children, title }) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const menuItems = [
    {
      label: "Dashboard",
      path: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Users",
      path: "/users",
      icon: Users,
    },
    {
      label: "Orders",
      path: "/orders",
      icon: ClipboardList,
    },
    {
      label: "Positions",
      path: "/positions",
      icon: Activity,
    },
    {
      label: "Trades",
      path: "/trades",
      icon: BarChart3,
    },
    {
      label: "Symbols",
      path: "/symbols",
      icon: CandlestickChart,
    },
    {
      label: "Audit Logs",
      path: "/audit-logs",
      icon: FileText,
    },
  ];

  function logout() {
    localStorage.removeItem("tradex_admin_token");
    localStorage.removeItem("tradex_admin_user");

    navigate("/login", {
      replace: true,
    });
  }

  return (
    <div className="admin-shell">

      {/* Mobile Header */}
      <div className="admin-mobile-header">
        <div className="admin-sidebar-brand">
          <strong>TradeX</strong>
          <span>Admin Panel</span>
        </div>

        <button
          type="button"
          className="admin-mobile-menu-button"
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Overlay */}
      {mobileOpen && (
        <button
          type="button"
          className="admin-sidebar-overlay"
          onClick={() => setMobileOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`admin-sidebar ${
          mobileOpen ? "mobile-open" : ""
        }`}
      >
        <div className="admin-sidebar-header">

          <div className="admin-sidebar-brand">
            <strong>TradeX</strong>
            <span>Admin Panel</span>
          </div>

          <button
            type="button"
            className="admin-mobile-close"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>

        </div>

        <nav className="admin-navigation">

          <div className="admin-nav-section-title">
            MANAGEMENT
          </div>

          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/dashboard"}
                className={({ isActive }) =>
                  `admin-nav-link ${
                    isActive ? "active" : ""
                  }`
                }
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

        </nav>

        <div className="admin-sidebar-footer">

          <button
            type="button"
            className="admin-logout-link"
            onClick={logout}
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>

        </div>
      </aside>

      {/* Main Content */}
      <div className="admin-content">

        <header className="admin-content-header">

          <div>
            <span className="admin-content-eyebrow">
              ADMIN PANEL
            </span>

            <h1>{title}</h1>
          </div>

        </header>

        <main className="admin-content-main">
          {children}
        </main>

      </div>

    </div>
  );
}

export default AdminLayout;