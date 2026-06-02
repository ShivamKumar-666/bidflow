import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./i18n";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Toaster } from "sonner";

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
