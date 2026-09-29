import axios from "axios";

const api = axios.create({
  baseURL:
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

// Add admin JWT automatically
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("tradex_admin_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// Handle API errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      error.userMessage =
        "Unable to connect to TradeX Admin API.";
    } else if (error.response.status === 401) {
      localStorage.removeItem("tradex_admin_token");

      error.userMessage =
        error.response?.data?.message ||
        "Admin session expired. Please login again.";

      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    } else if (error.response.status === 403) {
      error.userMessage =
        error.response?.data?.message ||
        "Admin access required.";
    } else if (error.response.status >= 500) {
      error.userMessage =
        "TradeX Admin server error. Please try again.";
    } else {
      error.userMessage =
        error.response?.data?.message ||
        "Something went wrong.";
    }

    return Promise.reject(error);
  },
);

export default api;