import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import UserDetails from "./pages/UserDetails";
import Orders from "./pages/Orders";
import Positions from "./pages/Positions";
import Trades from "./pages/Trades";
import Symbols from "./pages/Symbols";
import AuditLogs from "./pages/AuditLogs";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("tradex_admin_token");

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="/login" element={<Login />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <Users />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/:userId"
        element={
          <ProtectedRoute>
            <UserDetails />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <Orders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/positions"
        element={
          <ProtectedRoute>
            <Positions />
          </ProtectedRoute>
        }
      />

      <Route
        path="/trades"
        element={
          <ProtectedRoute>
            <Trades />
          </ProtectedRoute>
        }
      />

      <Route
        path="/symbols"
        element={
          <ProtectedRoute>
            <Symbols />
          </ProtectedRoute>
        }
      />

      <Route
  path="/audit-logs"
  element={
    <ProtectedRoute>
      <AuditLogs />
    </ProtectedRoute>
  }
/>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
