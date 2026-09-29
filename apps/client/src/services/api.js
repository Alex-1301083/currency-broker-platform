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

/*
=========================================================
API REQUEST INTERCEPTOR
=========================================================
*/

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("tradex_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

/*
=========================================================
API RESPONSE INTERCEPTOR
=========================================================
*/

api.interceptors.response.use(
  (response) => {
    return response;
  },

  (error) => {
    /*
    -----------------------------------------------
    NETWORK ERROR
    -----------------------------------------------
    */

    if (!error.response) {
      error.userMessage =
        "Unable to connect to TradeX server. Please check that the API server is running.";

      return Promise.reject(error);
    }

    /*
    -----------------------------------------------
    401 UNAUTHORIZED
    -----------------------------------------------
    */

    if (error.response.status === 401) {
      const currentPath = window.location.pathname;

      localStorage.removeItem("tradex_token");

      error.userMessage =
        error.response?.data?.message ||
        "Your session has expired. Please login again.";

      /*
      Don't redirect repeatedly if already on login/register.
      */

      if (
        currentPath !== "/" &&
        currentPath !== "/login" &&
        currentPath !== "/register"
      ) {
        window.location.href = "/";
      }

      return Promise.reject(error);
    }

    /*
    -----------------------------------------------
    403 FORBIDDEN
    -----------------------------------------------
    */

    if (error.response.status === 403) {
      error.userMessage =
        error.response?.data?.message ||
        "You do not have permission to perform this action.";

      return Promise.reject(error);
    }

    /*
    -----------------------------------------------
    404 NOT FOUND
    -----------------------------------------------
    */

    if (error.response.status === 404) {
      error.userMessage =
        error.response?.data?.message ||
        "Requested resource was not found.";

      return Promise.reject(error);
    }

    /*
    -----------------------------------------------
    409 CONFLICT
    -----------------------------------------------
    */

    if (error.response.status === 409) {
      error.userMessage =
        error.response?.data?.message ||
        "This request conflicts with the current trading state.";

      return Promise.reject(error);
    }

    /*
    -----------------------------------------------
    422 VALIDATION
    -----------------------------------------------
    */

    if (error.response.status === 422) {
      error.userMessage =
        error.response?.data?.message ||
        "Please check the entered information.";

      return Promise.reject(error);
    }

    /*
    -----------------------------------------------
    429 RATE LIMIT
    -----------------------------------------------
    */

    if (error.response.status === 429) {
      error.userMessage =
        "Too many requests. Please wait a moment and try again.";

      return Promise.reject(error);
    }

    /*
    -----------------------------------------------
    500+ SERVER ERROR
    -----------------------------------------------
    */

    if (error.response.status >= 500) {
      error.userMessage =
        "TradeX server error. Please try again shortly.";

      return Promise.reject(error);
    }

    /*
    -----------------------------------------------
    DEFAULT API ERROR
    -----------------------------------------------
    */

    error.userMessage =
      error.response?.data?.message ||
      "Something went wrong. Please try again.";

    return Promise.reject(error);
  },
);

export default api;