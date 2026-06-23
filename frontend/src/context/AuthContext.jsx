import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { USER_ME_FULL, USER_ME_SESSION } from "../services/userMeClient";

const AuthContext = createContext(null);

function readCachedUser() {
  const cached = localStorage.getItem("user");
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readCachedUser);
  const [authReady, setAuthReady] = useState(() => {
    const token = localStorage.getItem("token");
    if (!token) return true;
    return Boolean(readCachedUser());
  });

  const persistUser = (data) => {
    localStorage.setItem("user", JSON.stringify(data));
    setUser(data);
    return data;
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setAuthReady(true);
      return undefined;
    }

    let stale = false;
    api
      .get("/users/me", USER_ME_SESSION)
      .then(({ data }) => {
        if (stale) return;
        persistUser(data);
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

  useEffect(() => {
    let debounce = null;
    let tabWasHidden = false;
    const pull = () => {
      if (!localStorage.getItem("token")) return;
      api
        .get("/users/me", USER_ME_SESSION)
        .then(({ data }) => persistUser(data))
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
    persistUser(data.user);
  };

  const refreshMe = async ({ full = false } = {}) => {
    const { data } = await api.get("/users/me", full ? USER_ME_FULL : USER_ME_SESSION);
    return persistUser(data);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  const establishSession = (payload) => {
    if (!payload?.token || !payload?.user) return;
    localStorage.setItem("token", payload.token);
    persistUser(payload.user);
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
