import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("tradex_token");

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,

  (error) => {
    if (!error.response) {
      error.userMessage =
        "Unable to connect to TradeX API server.";
      return Promise.reject(error);
    }

    const status = error.response.status;

    if (status === 401) {
      const currentPath = window.location.pathname;

      localStorage.removeItem("tradex_token");
      localStorage.removeItem("tradex_user");

      error.userMessage =
        error.response?.data?.message ||
        "Your session has expired. Please login again.";

      if (
        currentPath !== "/" &&
        currentPath !== "/login" &&
        currentPath !== "/register"
      ) {
        window.location.href = "/";
      }

      return Promise.reject(error);
    }

    if (status === 403) {
      error.userMessage =
        error.response?.data?.message ||
        "You do not have permission to perform this action.";
    } else if (status === 404) {
      error.userMessage =
        error.response?.data?.message ||
        "Requested resource was not found.";
    } else if (status === 409) {
      error.userMessage =
        error.response?.data?.message ||
        "This request conflicts with the current trading state.";
    } else if (status === 422) {
      error.userMessage =
        error.response?.data?.message ||
        "Please check the entered information.";
    } else if (status === 429) {
      error.userMessage =
        "Too many requests. Please wait a moment.";
    } else if (status >= 500) {
      error.userMessage =
        "TradeX server error. Please try again shortly.";
    } else {
      error.userMessage =
        error.response?.data?.message ||
        "Something went wrong. Please try again.";
    }

    return Promise.reject(error);
  },
);

export default api;