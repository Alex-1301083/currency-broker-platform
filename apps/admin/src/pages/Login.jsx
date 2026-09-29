import {
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import api from "../services/api";

export default function Login() {
  const navigate =
    useNavigate();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleSubmit(
    event,
  ) {
    event.preventDefault();

    setError("");

    if (
      !email.trim() ||
      !password
    ) {
      setError(
        "Email and password are required.",
      );

      return;
    }

    try {
      setLoading(true);

      const response =
        await api.post(
          "/admin/login",
          {
            email:
              email
                .trim()
                .toLowerCase(),

            password,
          },
        );

      const user =
        response.data?.data?.user;

      const token =
        response.data?.data?.token;

      if (!token || !user) {
        throw new Error(
          "Invalid admin login response.",
        );
      }

      if (
        user.role !==
        "admin"
      ) {
        throw new Error(
          "This account is not an administrator.",
        );
      }

      localStorage.setItem(
        "tradex_admin_token",
        token,
      );

      localStorage.setItem(
        "tradex_admin_user",
        JSON.stringify(
          user,
        ),
      );

      navigate(
        "/dashboard",
        {
          replace: true,
        },
      );
    } catch (error) {
      console.error(
        "Admin login error:",
        error,
      );

      setError(
        error.userMessage ||
          error.response?.data
            ?.message ||
          error.message ||
          "Admin login failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight:
          "100vh",

        display:
          "flex",

        alignItems:
          "center",

        justifyContent:
          "center",

        padding:
          "24px",

        background:
          "radial-gradient(circle at top,#18243a 0%,#080d18 50%,#050912 100%)",
      }}
    >
      <div
        style={{
          width:
            "100%",

          maxWidth:
            "430px",

          padding:
            "36px",

          border:
            "1px solid #263247",

          borderRadius:
            "20px",

          background:
            "rgba(17,24,39,.96)",

          boxShadow:
            "0 30px 80px rgba(0,0,0,.45)",
        }}
      >
        <div
          style={{
            display:
              "flex",

            alignItems:
              "center",

            gap:
              "12px",

            marginBottom:
              "30px",
          }}
        >
          <div
            style={{
              width:
                "48px",

              height:
                "48px",

              borderRadius:
                "14px",

              display:
                "grid",

              placeItems:
                "center",

              background:
                "#22c55e",

              color:
                "#052e16",

              fontWeight:
                900,

              fontSize:
                "22px",
            }}
          >
            T
          </div>

          <div>
            <h1
              style={{
                margin:
                  0,

                color:
                  "#f8fafc",

                fontSize:
                  "24px",
              }}
            >
              TradeX Admin
            </h1>

            <p
              style={{
                margin:
                  "4px 0 0",

                color:
                  "#94a3b8",

                fontSize:
                  "13px",
              }}
            >
              Secure administration portal
            </p>
          </div>
        </div>

        <h2
          style={{
            color:
              "#f8fafc",

            margin:
              "0 0 8px",
          }}
        >
          Administrator Login
        </h2>

        <p
          style={{
            color:
              "#94a3b8",

            fontSize:
              "14px",

            marginBottom:
              "24px",
          }}
        >
          Sign in to manage users,
          orders, positions and
          market symbols.
        </p>

        {error && (
          <div
            style={{
              marginBottom:
                "18px",

              padding:
                "12px",

              borderRadius:
                "10px",

              background:
                "rgba(127,29,29,.35)",

              border:
                "1px solid #7f1d1d",

              color:
                "#fecaca",

              fontSize:
                "13px",
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={
            handleSubmit
          }
        >
          <label
            style={labelStyle}
          >
            Email
          </label>

          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(
                event.target.value,
              )
            }
            placeholder="admin@example.com"
            autoComplete="username"
            required
            style={inputStyle}
          />

          <label
            style={labelStyle}
          >
            Password
          </label>

          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value,
              )
            }
            placeholder="Enter admin password"
            autoComplete="current-password"
            required
            style={inputStyle}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width:
                "100%",

              border:
                "none",

              borderRadius:
                "10px",

              padding:
                "13px",

              marginTop:
                "8px",

              background:
                loading
                  ? "#166534"
                  : "#22c55e",

              color:
                "#052e16",

              fontWeight:
                800,

              cursor:
                loading
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {loading
              ? "Signing in..."
              : "Sign In"}
          </button>
        </form>

        <div
          style={{
            marginTop:
              "24px",

            paddingTop:
              "18px",

            borderTop:
              "1px solid #1f2937",

            color:
              "#64748b",

            fontSize:
              "12px",

            textAlign:
              "center",
          }}
        >
          TradeX Administrative Access
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display:
    "block",

  margin:
    "16px 0 7px",

  color:
    "#cbd5e1",

  fontSize:
    "13px",

  fontWeight:
    600,
};

const inputStyle = {
  width:
    "100%",

  padding:
    "12px 13px",

  border:
    "1px solid #263247",

  borderRadius:
    "10px",

  outline:
    "none",

  background:
    "#0b1220",

  color:
    "#f8fafc",

  fontSize:
    "14px",
};