import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  RefreshCw,
  UserCheck,
  UserX,
  Shield,
  User,
  Wallet,
  ClipboardList,
  Activity,
} from "lucide-react";
import api from "../services/api";

function Users() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/admin/users");

      setUsers(response.data?.data || []);
    } catch (error) {
      console.error("Users loading error:", error);

      setError(
        error.userMessage ||
          error.response?.data?.message ||
          "Unable to load users.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = users.filter((user) => {
    const query = search.toLowerCase().trim();

    if (!query) {
      return true;
    }

    return (
      user.fullName?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="users-page">
      <div className="users-header">
        <div>
          <span className="eyebrow">MANAGEMENT</span>

          <h1>Users</h1>

          <p>Manage TradeX platform users and their trading activity.</p>
        </div>

        <button
          className="refresh-button"
          onClick={loadUsers}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} />

          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <div className="users-toolbar">
        <div className="search-box">
          <Search size={18} />

          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="users-count">{filteredUsers.length} users</div>
      </div>

      <div className="users-table-wrapper">
        <table className="users-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Accounts</th>
              <th>Orders</th>
              <th>Open Positions</th>
              <th>Joined</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="table-message">
                  Loading users...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="7" className="table-message">
                  No users found.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar">
                        {user.fullName?.charAt(0)?.toUpperCase()}
                      </div>

                      <div>
                        <button
                          className="user-name-button"
                          onClick={() => navigate(`/users/${user.id}`)}
                        >
                          {user.fullName}
                        </button>

                        <span>{user.email}</span>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span
                      className={
                        user.role === "admin"
                          ? "role-badge admin"
                          : "role-badge user"
                      }
                    >
                      {user.role === "admin" ? (
                        <Shield size={13} />
                      ) : (
                        <User size={13} />
                      )}

                      {user.role}
                    </span>
                  </td>

                  <td>
                    <span
                      className={
                        user.isActive
                          ? "status-badge active"
                          : "status-badge inactive"
                      }
                    >
                      {user.isActive ? (
                        <UserCheck size={13} />
                      ) : (
                        <UserX size={13} />
                      )}

                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>

                  <td>
                    <div className="metric-cell">
                      <Wallet size={15} />
                      {user.totalAccounts}
                    </div>
                  </td>

                  <td>
                    <div className="metric-cell">
                      <ClipboardList size={15} />
                      {user.totalOrders}
                    </div>
                  </td>

                  <td>
                    <div className="metric-cell">
                      <Activity size={15} />
                      {user.openPositions}
                    </div>
                  </td>

                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Users;
