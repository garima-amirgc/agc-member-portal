import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import AppErrorBoundary, { CHUNK_RELOAD_FLAG_KEY } from "./components/AppErrorBoundary";
import "./index.css";
import "./agc-brand.css";
import { AuthProvider } from "./context/AuthContext";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root in index.html");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>
);

// Clears AppErrorBoundary's "already auto-reloaded once this session" flag
// right after a successful initial mount, so the free auto-reload-on-
// stale-chunk-error (see that file) is available again for the NEXT deploy
// too — without this, only the first deploy after a tab was opened would
// get it; later ones in the same browser session wouldn't. Safe to clear
// unconditionally here: reaching this line means the app shell itself
// mounted fine, so any stale-chunk error from here is a new navigation
// hitting a since-replaced chunk, not a loop of the same failure.
try {
  sessionStorage.removeItem(CHUNK_RELOAD_FLAG_KEY);
} catch {
  /* sessionStorage unavailable — nothing to clear */
}
