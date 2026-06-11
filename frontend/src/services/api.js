import axios from "axios";

// SEC-04: helper to read a non-httpOnly CSRF cookie set by Flask-JWT-Extended
// when JWT_CSRF_IN_COOKIES = True. The cookie name must match config's
// JWT_ACCESS_CSRF_COOKIE_NAME ("csrf_access_token").
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
  return null;
}

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL}/api`,
  withCredentials: true,   // SEC-01: send httpOnly JWT cookie automatically
});

// SEC-04: attach CSRF token from cookie as X-CSRF-TOKEN header for all
// state-changing requests (double-submit cookie pattern).
api.interceptors.request.use((config) => {
  const csrfToken = getCookie("csrf_access_token");
  if (csrfToken && ["post", "put", "patch", "delete"].includes(config.method?.toLowerCase())) {
    config.headers["X-CSRF-TOKEN"] = csrfToken;
  }
  return config;
});

// SEC-06: flag to prevent multiple simultaneous refresh attempts.
let isRefreshing = false;
let pendingQueue = [];

function enqueueAfterRefresh(config) {
  return new Promise((resolve) => {
    pendingQueue.push({ config, resolve });
  });
}

function drainQueue() {
  pendingQueue.forEach(({ config, resolve }) => {
    resolve(api(config));
  });
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const originalRequest = config;

    // SEC-06: attempt a single silent refresh before redirecting to login.
    if (response && response.status === 401 && !originalRequest._retry) {
      if (originalRequest.url === "/auth/refresh") {
        // Already on the refresh endpoint — don't loop.
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }

      if (!isRefreshing) {
        isRefreshing = true;
        originalRequest._retry = true;

        try {
          await api.post("/auth/refresh");
          drainQueue();
          isRefreshing = false;
          return api(originalRequest);
        } catch {
          isRefreshing = false;
          pendingQueue = [];
          if (!window.location.pathname.startsWith("/login")) {
            window.location.href = "/login";
          }
          return Promise.reject(error);
        }
      } else {
        // A refresh is already in flight — queue this request.
        return enqueueAfterRefresh(originalRequest);
      }
    }

    const isGet = config && config.method && config.method.toLowerCase() === "get";
    const isTransientError = !response || (response.status >= 500 && response.status <= 504);

    if (isGet && isTransientError) {
      config.__retryCount = config.__retryCount || 0;
      if (config.__retryCount < 3) {
        config.__retryCount += 1;
        const delay = 500 * Math.pow(2, config.__retryCount - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return api(config);
      }
    }

    // Auto-logout on 401 — token revoked or expired and refresh failed.
    if (response && response.status === 401) {
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default api;
