import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import api from "../services/api";
import AuthShell, { Brand } from "../components/AuthShell";

const REMEMBER_KEY = "tradex_remember_email";

function readRememberedEmail() {
  try {
    return localStorage.getItem(REMEMBER_KEY) || "";
  } catch {
    return "";
  }
}

function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const rememberedEmail = readRememberedEmail();

  const [form, setForm] = useState({
    email: rememberedEmail,
    password: "",
  });

  const [remember, setRemember] = useState(Boolean(rememberedEmail));
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const alreadyLoggedIn = Boolean(localStorage.getItem("tradex_token"));

  /* message coming from registration / logout redirects */
  const notice = location.state?.notice || "";

  useEffect(() => {
    document.title = "Sign in · TradeX";
  }, []);

  if (alreadyLoggedIn && !loading) {
    return <Navigate to="/dashboard" replace />;
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setError("");

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) {
      return;
    }

    const email = form.email.trim().toLowerCase();

    if (!email || !form.password) {
      setError("Please enter your email and password.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/login", {
        email,
        password: form.password,
      });

      const user = response.data?.data?.user;
      const token = response.data?.data?.token;

      if (!token || !user) {
        throw new Error("Unexpected response from the server.");
      }

      if (user.role === "admin") {
        setError("Admin accounts must sign in from the TradeX Admin portal.");
        return;
      }

      try {
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, email);
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
      } catch {
        /* storage unavailable: ignore */
      }

      localStorage.setItem("tradex_token", token);
      localStorage.setItem("tradex_user", JSON.stringify(user));

      api.defaults.headers.common.Authorization = `Bearer ${token}`;

      navigate(location.state?.from || "/dashboard", { replace: true });
    } catch (loginError) {
      console.error("Login error:", loginError);

      setError(
        loginError.userMessage ||
          loginError.response?.data?.message ||
          loginError.message ||
          "Login failed. Please check your email and password.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="auth-card">
        <Brand />

        <div className="auth-heading">
          <h2>Welcome back</h2>
          <p>Sign in to open your trading terminal.</p>
        </div>

        {notice && !error && <div className="auth-success">{notice}</div>}

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="email">Email</label>

            <div className="auth-input">
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                autoFocus={!form.email}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>

            <div className="auth-input">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                autoFocus={Boolean(form.email)}
                required
              />

              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>

          <div className="auth-options">
            <label>
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Remember my email
            </label>
          </div>

          <button className="auth-button" type="submit" disabled={loading}>
            {loading && <span className="auth-spinner" />}
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="auth-switch">
          Don&apos;t have an account? <Link to="/register">Create account</Link>
        </p>

        <p className="auth-footnote">
          Trading leveraged products involves risk. Practice on your demo
          account first.
        </p>
      </div>
    </AuthShell>
  );
}

export default Login;
