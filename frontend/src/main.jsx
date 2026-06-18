import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./i18n";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Toaster } from "sonner";

// ── Sentry error tracking (optional, requires VITE_SENTRY_DSN env var) ───────
if (import.meta.env.VITE_SENTRY_DSN) {
  import("@sentry/react").then(({ init, browserTracingIntegration }) => {
    init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      integrations: [browserTracingIntegration()],
      tracesSampleRate: 0.1,
      environment: import.meta.env.MODE,
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
      <Toaster
        position="top-right"
        theme="system"
        richColors
        closeButton
        toastOptions={{
          classNames: {
            toast: "rounded-xl border shadow-lg",
          },
        }}
      />
    </ThemeProvider>
  </React.StrictMode>
);
