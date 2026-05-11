import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../services/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const cached = localStorage.getItem("user");
    try {
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [authReady, setAuthReady] = useState(() => !localStorage.getItem("token"));

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setAuthReady(true);
      return undefined;
    }
    // Strict Mode runs effect twice; always unblock UI in `finally` so we never stay on a blank "Connecting" screen.
    let stale = false;
    api
      .get("/users/me")
      .then(({ data }) => {
        if (stale) return;
        localStorage.setItem("user", JSON.stringify(data));
        setUser(data);
      })
      .catch(() => {
        if (stale) return;
        if (!localStorage.getItem("token")) {
          setUser(null);
        }
      })
      .finally(() => {
        setAuthReady(true);
      });
    return () => {
      stale = true;
    };
  }, []);

  /** If an admin updates this account’s grants, refetch when the user comes back to the tab (avoids stale nav / access). */
  useEffect(() => {
    let debounce = null;
    let tabWasHidden = false;
    const pull = () => {
      if (!localStorage.getItem("token")) return;
      api
        .get("/users/me")
        .then(({ data }) => {
          localStorage.setItem("user", JSON.stringify(data));
          setUser(data);
        })
        .catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        tabWasHidden = true;
        return;
      }
      if (document.visibilityState !== "visible" || !tabWasHidden) return;
      tabWasHidden = false;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(pull, 400);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (debounce) clearTimeout(debounce);
    };
  }, []);

  const login = async (email, password, rememberMe = false) => {
    const { data } = await api.post("/auth/login", { email, password, rememberMe });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
  };

  const refreshMe = async () => {
    const { data } = await api.get("/users/me");
    localStorage.setItem("user", JSON.stringify(data));
    setUser(data);
    return data;
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  /** After invite flow: persist token + user without going through login. */
  const establishSession = (payload) => {
    if (!payload?.token || !payload?.user) return;
    localStorage.setItem("token", payload.token);
    localStorage.setItem("user", JSON.stringify(payload.user));
    setUser(payload.user);
  };

  const value = useMemo(() => ({ user, login, logout, refreshMe, establishSession }), [user]);

  if (!authReady) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-center text-slate-600 dark:bg-slate-900 dark:text-slate-300"
        style={{ background: "#f8fafc", color: "#475569" }}
      >
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#0B3EAF] dark:border-slate-700 dark:border-t-[#A7D344]"
          aria-label="Loading"
          role="status"
        />
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Loading…</div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
