import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { postAuthLandingPath } from "../utils/facilityUniversityOnly";

/**
 * Completes Microsoft SSO after API redirect (token in query string, then stripped from URL).
 */
export default function SsoCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { establishSession, refreshMe } = useAuth();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setMessage("Missing sign-in token. Return to login and try again.");
      return;
    }

    localStorage.setItem("token", token);
    const remember = params.get("remember") === "1";
    if (remember) {
      try {
        localStorage.setItem("agc_remember_me", "1");
      } catch {
        /* ignore */
      }
    }

    (async () => {
      try {
        const user = await refreshMe();
        establishSession({ token, user });
        navigate(postAuthLandingPath(user), { replace: true });
      } catch {
        setMessage("Could not load your profile. Try signing in again.");
        localStorage.removeItem("token");
        setTimeout(() => navigate("/login", { replace: true }), 2500);
      }
    })();
  }, [params, navigate, establishSession, refreshMe]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center dark:bg-slate-900">
      <div
        className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#0B3EAF] dark:border-slate-700 dark:border-t-[#A7D344]"
        aria-hidden
      />
      <p className="max-w-md text-sm text-slate-600 dark:text-slate-300">{message}</p>
    </div>
  );
}
