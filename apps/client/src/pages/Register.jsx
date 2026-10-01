import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import api from "../services/api";
import AuthShell, { Brand } from "../components/AuthShell";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function passwordStrength(password) {
  if (!password) {
    return { level: 0, label: "" };
  }

  let score = 0;

  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;

  const level = Math.max(1, Math.min(score, 4));

  return {
    level,
    label: ["", "Weak", "Fair", "Good", "Strong"][level],
  };
}

function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const alreadyLoggedIn = Boolean(localStorage.getItem("tradex_token"));

  useEffect(() => {
    document.title = "Create account · TradeX";
  }, []);

  const strength = useMemo(
    () => passwordStrength(form.password),
    [form.password],
  );

  const fieldErrors = useMemo(() => {
    const errors = {};

    if (form.fullName.trim().length < 2) {
      errors.fullName = "Please enter your full name.";
    }

    if (!EMAIL_PATTERN.test(form.email.trim())) {
      errors.email = "Enter a valid email address.";
    }

    if (form.password.length < 6) {
      errors.password = "Password must be at least 6 characters.";
    }

    if (form.confirmPassword !== form.password) {
      errors.confirmPassword = "Passwords do not match.";
    }

    return errors;
  }, [form]);

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

  function handleBlur(event) {
    const { name } = event.target;

    setTouched((previous) => ({
      ...previous,
      [name]: true,
    }));
  }

  function showError(name) {
    return touched[name] && fieldErrors[name];
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setTouched({
      fullName: true,
      email: true,
      password: true,
      confirmPassword: true,
    });

    if (Object.keys(fieldErrors).length > 0) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/register", {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      const token = response.data?.data?.token;
      const user = response.data?.data?.user;
      const account = response.data?.data?.account;

      if (!token || !user) {
        /* account was created, ask the user to sign in */
        navigate("/", {
          replace: true,
          state: { notice: "Account created. Please sign in." },
        });

        return;
      }

      localStorage.setItem("tradex_token", token);
      localStorage.setItem("tradex_user", JSON.stringify(user));

      api.defaults.headers.common.Authorization = `Bearer ${token}`;

      /* safety net: make sure the trading account exists */
      if (!account) {
        try {
          await api.post("/account");
        } catch {
          /* 409 = already exists, other errors are retried on login */
        }
      }

      navigate("/dashboard", { replace: true });
    } catch (registerError) {
      console.error("Registration error:", registerError);

      setError(
        registerError.userMessage ||
          registerError.response?.data?.message ||
          "Registration failed. Please try again.",
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
          <h2>Create your account</h2>
          <p>Start with a free $10,000 demo trading account.</p>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="fullName">Full name</label>

            <div className="auth-input">
              <input
                id="fullName"
                name="fullName"
                type="text"
                placeholder="Your full name"
                value={form.fullName}
                onChange={handleChange}
                onBlur={handleBlur}
                className={showError("fullName") ? "invalid" : ""}
                autoComplete="name"
                autoFocus
                required
              />
            </div>

            {showError("fullName") && (
              <div className="field-hint">{fieldErrors.fullName}</div>
            )}
          </div>

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
                onBlur={handleBlur}
                className={showError("email") ? "invalid" : ""}
                autoComplete="email"
                required
              />
            </div>

            {showError("email") && (
              <div className="field-hint">{fieldErrors.email}</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>

            <div className="auth-input">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Minimum 6 characters"
                value={form.password}
                onChange={handleChange}
                onBlur={handleBlur}
                className={showError("password") ? "invalid" : ""}
                autoComplete="new-password"
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

            {showError("password") && (
              <div className="field-hint">{fieldErrors.password}</div>
            )}

            {form.password && (
              <>
                <div className={`password-meter level-${strength.level}`}>
                  <i />
                  <i />
                  <i />
                  <i />
                </div>

                <div className="password-meter-label">
                  Password strength: {strength.label}
                </div>
              </>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm password</label>

            <div className="auth-input">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                placeholder="Re-enter your password"
                value={form.confirmPassword}
                onChange={handleChange}
                onBlur={handleBlur}
                className={showError("confirmPassword") ? "invalid" : ""}
                autoComplete="new-password"
                required
              />
            </div>

            {showError("confirmPassword") && (
              <div className="field-hint">{fieldErrors.confirmPassword}</div>
            )}
          </div>

          <button className="auth-button" type="submit" disabled={loading}>
            {loading && <span className="auth-spinner" />}
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/">Sign in</Link>
        </p>

        <p className="auth-footnote">
          By creating an account you confirm that you understand that trading
          involves risk.
        </p>
      </div>
    </AuthShell>
  );
}

export default Register;
