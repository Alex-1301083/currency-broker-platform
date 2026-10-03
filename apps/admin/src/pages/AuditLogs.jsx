import { useEffect, useState } from "react";
import api from "../services/api";

function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadAuditLogs() {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/admin/audit-logs");

      const data = response.data;

      if (!data.success) {
        throw new Error(
          data.message || "Unable to load audit logs.",
        );
      }

      setLogs(data.data || []);
    } catch (error) {
      console.error("Audit logs error:", error);

      setError(
        error.userMessage ||
          error.message ||
          "Unable to load audit logs.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAuditLogs();
  }, []);

  function formatDate(date) {
    if (!date) return "-";

    return new Date(date).toLocaleString();
  }

  function formatMetadata(metadata) {
    if (!metadata) return "-";

    try {
      return JSON.stringify(metadata, null, 2);
    } catch {
      return "-";
    }
  }

  return (
    <div
      style={{
        padding: "24px",
        color: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "28px",
            }}
          >
            Audit Logs
          </h1>

          <p
            style={{
              marginTop: "8px",
              color: "#9ca3af",
            }}
          >
            Track administrator actions and system activity.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAuditLogs}
          style={{
            padding: "10px 16px",
            borderRadius: "8px",
            border: "1px solid #374151",
            background: "#111827",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div
          style={{
            padding: "24px",
            borderRadius: "10px",
            background: "#111827",
            color: "#9ca3af",
          }}
        >
          Loading audit logs...
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            padding: "16px",
            borderRadius: "10px",
            background: "#3f1d1d",
            border: "1px solid #7f1d1d",
            color: "#fecaca",
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && logs.length === 0 && (
        <div
          style={{
            padding: "40px 24px",
            borderRadius: "10px",
            background: "#111827",
            textAlign: "center",
            color: "#9ca3af",
          }}
        >
          No audit logs found.
        </div>
      )}

      {!loading && !error && logs.length > 0 && (
        <div
          style={{
            overflowX: "auto",
            borderRadius: "10px",
            border: "1px solid #1f2937",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "1000px",
              background: "#111827",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "#1f2937",
                  textAlign: "left",
                }}
              >
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Admin / User</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Entity</th>
                <th style={thStyle}>Entity ID</th>
                <th style={thStyle}>IP Address</th>
                <th style={thStyle}>Metadata</th>
              </tr>
            </thead>

            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={tdStyle}>
                    {formatDate(log.createdAt)}
                  </td>

                  <td style={tdStyle}>
                    <div>
                      <strong>
                        {log.user?.fullName || "Unknown"}
                      </strong>

                      <div
                        style={{
                          marginTop: "4px",
                          color: "#9ca3af",
                          fontSize: "13px",
                        }}
                      >
                        {log.user?.email || "-"}
                      </div>
                    </div>
                  </td>

                  <td style={tdStyle}>
                    <span
                      style={{
                        padding: "5px 9px",
                        borderRadius: "6px",
                        background: "#1f2937",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      {log.action}
                    </span>
                  </td>

                  <td style={tdStyle}>
                    {log.entityType || "-"}
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      fontFamily: "monospace",
                      fontSize: "12px",
                    }}
                  >
                    {log.entityId || "-"}
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      fontFamily: "monospace",
                    }}
                  >
                    {log.ipAddress || "-"}
                  </td>

                  <td style={tdStyle}>
                    <pre
                      style={{
                        margin: 0,
                        maxWidth: "320px",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        color: "#d1d5db",
                        fontSize: "12px",
                      }}
                    >
                      {formatMetadata(log.metadata)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: "14px 16px",
  borderBottom: "1px solid #374151",
  fontSize: "13px",
  color: "#d1d5db",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "14px 16px",
  borderBottom: "1px solid #1f2937",
  verticalAlign: "top",
  fontSize: "14px",
};

export default AuditLogs;