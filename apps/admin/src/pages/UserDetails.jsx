import { useEffect, useState } from "react";
import {
  ArrowLeft,
  RefreshCw,
  User,
  Wallet,
  ShieldCheck,
  ShieldOff,
  AlertTriangle,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";

function UserDetails() {
  const navigate = useNavigate();
  const { userId } = useParams();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [statusLoading, setStatusLoading] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);

  const loadUser = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get(
        `/admin/users/${userId}`
      );

      setUser(response.data?.data || null);
    } catch (error) {
      console.error("User details error:", error);

      setError(
        error.userMessage ||
          error.response?.data?.message ||
          "Unable to load user details."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, [userId]);

  const handleStatusChange = async () => {
    if (!user) return;

    try {
      setStatusLoading(true);

      const newStatus = !user.isActive;

      const response = await api.patch(
        `/admin/users/${user.id}/status`,
        {
          isActive: newStatus,
        }
      );

      if (response.data?.success) {
        setUser((currentUser) => ({
          ...currentUser,
          isActive:
            response.data.data.isActive,
          updatedAt:
            response.data.data.updatedAt,
        }));

        setShowStatusModal(false);
      }
    } catch (error) {
      console.error(
        "User status update error:",
        error
      );

      alert(
        error.userMessage ||
          error.response?.data?.message ||
          "Unable to update user status."
      );
    } finally {
      setStatusLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="user-details-page">
        <div className="loading-state">
          <RefreshCw
            className="spin"
            size={20}
          />
          Loading user details...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="user-details-page">
        <button
          className="back-button"
          onClick={() => navigate("/users")}
        >
          <ArrowLeft size={16} />
          Back to Users
        </button>

        <div className="admin-error">
          {error}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="user-details-page">
        <button
          className="back-button"
          onClick={() => navigate("/users")}
        >
          <ArrowLeft size={16} />
          Back to Users
        </button>

        <div className="admin-error">
          User not found.
        </div>
      </div>
    );
  }

  return (
    <div className="user-details-page">

      {/* Header */}

      <div className="user-details-header">

        <div>

          <button
            className="back-button"
            onClick={() => navigate("/users")}
          >
            <ArrowLeft size={16} />
            Back to Users
          </button>

          <div className="user-title">

            <div className="large-user-avatar">
              {user.fullName
                ?.charAt(0)
                ?.toUpperCase()}
            </div>

            <div>
              <span className="eyebrow">
                USER DETAILS
              </span>

              <h1>{user.fullName}</h1>

              <p>{user.email}</p>
            </div>

          </div>

        </div>

        <div className="user-header-actions">

          <button
            className="refresh-button"
            onClick={loadUser}
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

          <button
            className={
              user.isActive
                ? "status-action deactivate"
                : "status-action activate"
            }
            onClick={() =>
              setShowStatusModal(true)
            }
            disabled={statusLoading}
          >
            {user.isActive ? (
              <>
                <ShieldOff size={16} />
                Deactivate
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                Activate
              </>
            )}
          </button>

        </div>

      </div>

      {/* User Profile */}

      <section className="details-card">

        <div className="details-card-header">

          <div className="details-card-title">

            <User size={18} />

            <div>
              <strong>
                User Profile
              </strong>

              <span>
                Account information
              </span>
            </div>

          </div>

        </div>

        <div className="profile-grid">

          <div>
            <span>Name</span>
            <strong>
              {user.fullName}
            </strong>
          </div>

          <div>
            <span>Email</span>
            <strong>
              {user.email}
            </strong>
          </div>

          <div>
            <span>Role</span>
            <strong className="capitalize">
              {user.role}
            </strong>
          </div>

          <div>
            <span>Status</span>

            <strong
              className={
                user.isActive
                  ? "text-active"
                  : "text-inactive"
              }
            >
              {user.isActive
                ? "Active"
                : "Inactive"}
            </strong>

          </div>

          <div>
            <span>Joined</span>

            <strong>
              {new Date(
                user.createdAt
              ).toLocaleDateString()}
            </strong>
          </div>

          <div>
            <span>Last Updated</span>

            <strong>
              {new Date(
                user.updatedAt
              ).toLocaleDateString()}
            </strong>
          </div>

        </div>

      </section>

      {/* Trading Accounts */}

      <section className="details-card">

        <div className="details-card-header">

          <div className="details-card-title">

            <Wallet size={18} />

            <div>

              <strong>
                Trading Accounts
              </strong>

              <span>
                {user.accounts?.length || 0}{" "}
                account
                {user.accounts?.length === 1
                  ? ""
                  : "s"}
              </span>

            </div>

          </div>

        </div>

        {user.accounts?.length === 0 ? (

          <div className="empty-state">
            This user does not have a
            trading account.
          </div>

        ) : (

          <div className="account-list">

            {user.accounts.map(
              (account) => (

                <div
                  className="account-card"
                  key={account.id}
                >

                  <div className="account-top">

                    <div>

                      <span>
                        ACCOUNT NUMBER
                      </span>

                      <strong>
                        {account.accountNumber}
                      </strong>

                    </div>

                    <span
                      className={
                        account.status ===
                        "active"
                          ? "status-badge active"
                          : "status-badge inactive"
                      }
                    >
                      {account.status}
                    </span>

                  </div>

                  <div className="account-grid">

                    <div>
                      <span>
                        Balance
                      </span>

                      <strong>
                        $
                        {account.balance.toLocaleString(
                          undefined,
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Equity
                      </span>

                      <strong>
                        $
                        {account.equity.toLocaleString(
                          undefined,
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Margin
                      </span>

                      <strong>
                        $
                        {account.margin.toLocaleString(
                          undefined,
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Free Margin
                      </span>

                      <strong>
                        $
                        {account.freeMargin.toLocaleString(
                          undefined,
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Leverage
                      </span>

                      <strong>
                        1:{account.leverage}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Currency
                      </span>

                      <strong>
                        {account.currency}
                      </strong>
                    </div>

                  </div>

                </div>

              )
            )}

          </div>

        )}

      </section>

      {/* Confirmation Modal */}

      {showStatusModal && (

        <div
          className="modal-overlay"
          onClick={() =>
            !statusLoading &&
            setShowStatusModal(false)
          }
        >

          <div
            className="status-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <button
              className="modal-close"
              onClick={() =>
                !statusLoading &&
                setShowStatusModal(false)
              }
              disabled={statusLoading}
            >
              <X size={18} />
            </button>

            <div
              className={
                user.isActive
                  ? "modal-icon danger"
                  : "modal-icon success"
              }
            >
              {user.isActive ? (
                <AlertTriangle size={24} />
              ) : (
                <ShieldCheck size={24} />
              )}
            </div>

            <h2>
              {user.isActive
                ? "Deactivate User?"
                : "Activate User?"}
            </h2>

            <p>
              Are you sure you want to{" "}
              {user.isActive
                ? "deactivate"
                : "activate"}{" "}
              <strong>
                {user.fullName}
              </strong>
              ?
            </p>

            <div className="modal-actions">

              <button
                className="modal-cancel"
                onClick={() =>
                  setShowStatusModal(false)
                }
                disabled={statusLoading}
              >
                Cancel
              </button>

              <button
                className={
                  user.isActive
                    ? "modal-confirm danger-button"
                    : "modal-confirm success-button"
                }
                onClick={
                  handleStatusChange
                }
                disabled={statusLoading}
              >
                {statusLoading ? (
                  <>
                    <RefreshCw
                      size={15}
                      className="spin"
                    />
                    Updating...
                  </>
                ) : user.isActive ? (
                  <>
                    <ShieldOff size={15} />
                    Deactivate
                  </>
                ) : (
                  <>
                    <ShieldCheck size={15} />
                    Activate
                  </>
                )}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

export default UserDetails;