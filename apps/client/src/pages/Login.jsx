
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";

function Login() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/login", form);

      const user = response.data?.data?.user;
      const token = response.data?.data?.token;

      if (!token || !user) {
        throw new Error("Invalid login response.");
      }

      if (user.role === "admin") {
        setError(
          "Admin accounts must use the TradeX Admin portal.",
        );

        return;
      }

      localStorage.setItem("tradex_token", token);
      localStorage.setItem(
        "tradex_user",
        JSON.stringify(user),
      );

      api.defaults.headers.common.Authorization = `Bearer ${token}`;

      navigate("/dashboard");
    } catch (error) {
      console.error("Login error:", error);

      setError(
        error.response?.data?.message ||
          error.message ||
          "Login failed. Please check your email and password.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">T</span>

          <div>
            <h1>TradeX</h1>
            <p>Currency Trading Platform</p>
          </div>
        </div>

        <div className="auth-heading">
          <h2>Welcome Back</h2>

          <p>
            Sign in to access your trading terminal.
          </p>
        </div>

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              placeholder="Enter your email"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            className="auth-button"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Signing in..."
              : "Sign In"}
          </button>
        </form>

        <p className="auth-switch">
          Don't have an account?{" "}
          <Link to="/register">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
