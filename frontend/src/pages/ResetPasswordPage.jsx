import axios from "axios";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthSplitLayout, { AUTH_FORM_CARD, AuthHeroAccentBars } from "../components/layout/AuthSplitLayout";
import { AMIR_GROUP_LOGO_SRC, APP_DISPLAY_NAME } from "../constants/branding";
import { useAuth } from "../context/AuthContext";
import { postAuthLandingPath } from "../utils/facilityUniversityOnly";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

/** Shared focus ring for accent inputs */
const inputWrapFocus = "focus-within:ring-2 focus-within:ring-brand-blue/25 dark:focus-within:ring-brand-green/20";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { establishSession, refreshMe } = useAuth();

  const [status, setStatus] = useState("checking");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !String(token).trim()) {
      setStatus("invalid");
      return;
    }
    let cancelled = false;
    api
      .get(`/auth/reset-password-status?token=${encodeURIComponent(token)}`)
      .then((r) => {
        if (cancelled) return;
        if (r.data?.valid) {
          setMaskedEmail(r.data.email || "");
          setStatus("ready");
        } else {
          setStatus("invalid");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/reset-password", { token, password, rememberMe });
      establishSession(data);
      let nextUser = null;
      try {
        nextUser = await refreshMe();
      } catch {
        try {
          nextUser = JSON.parse(localStorage.getItem("user") || "null");
        } catch {
          nextUser = null;
        }
      }
      navigate(postAuthLandingPath(nextUser || data?.user), { replace: true });
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not reset password."));
    } finally {
      setLoading(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-brand-surface px-4 dark:bg-[#0a0a0a]">
        <p className="text-sm text-brand-muted dark:text-stone-400">Checking your reset link…</p>
      </div>
    );
  }

  if (status === "invalid" || !token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-brand-surface px-4 dark:bg-[#0a0a0a]">
        <div className="w-full max-w-md rounded-2xl border border-black/[0.07] bg-white p-7 shadow-[0_8px_40px_rgba(11,62,175,0.12),0_2px_12px_rgba(0,0,0,0.06)] dark:border-stone-800 dark:bg-[#141414] sm:rounded-3xl sm:p-8">
          <h1 className="font-sans text-xl font-bold tracking-tight text-brand-blue dark:text-brand-green">Link not valid</h1>
          <p className="mt-3 text-sm leading-relaxed text-brand-muted dark:text-stone-400">
            This reset link may have expired. Request a new one from Forgot password.
          </p>
          <Link className="btn-primary mt-6 inline-block w-full text-center no-underline" to="/forgot-password">
            Request again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AuthSplitLayout heroHeadingId="reset-brand-heading" hero={
      <>
        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 sm:gap-5">
          <Link to="/" aria-label="Home" className="inline-flex w-fit max-w-full shrink-0">
            <img
              src={AMIR_GROUP_LOGO_SRC}
              alt="AMIR Group of Companies"
              className="h-auto w-[220px] max-w-full object-contain object-left drop-shadow-[0_2px_10px_rgba(0,0,0,0.28)]"
            />
          </Link>
          <div className="min-w-0 space-y-3 sm:space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80 sm:text-[11px] sm:tracking-[0.26em]">
              Official access
            </p>
            <h1
              id="reset-brand-heading"
              className="break-words font-sans text-[clamp(1.35rem,4.2vw,1.875rem)] font-bold leading-tight tracking-[0.06em] text-white sm:tracking-[0.1em]"
            >
              NEW PASSWORD
            </h1>
            <p className="max-w-prose text-pretty text-sm leading-relaxed text-white/88 sm:text-[15px]">
              Choose a new password to secure your account and sign in again.
            </p>
          </div>
        </div>
        <AuthHeroAccentBars />
      </>
    }>
      <form className={AUTH_FORM_CARD} onSubmit={onSubmit}>
            <h2 className="font-sans text-2xl font-bold tracking-tight text-brand-blue dark:text-brand-green">
              Choose a new password
            </h2>
            {maskedEmail ? (
              <p className="mt-2 text-sm text-brand-muted dark:text-stone-400">
                Account: <span className="font-semibold text-brand-black dark:text-stone-200">{maskedEmail}</span>
              </p>
            ) : null}
            <p className="mt-4 text-[10px] font-medium uppercase tracking-[0.12em] text-[#9DA3A6] dark:text-stone-500 sm:text-xs sm:tracking-[0.14em]">
              Minimum 10 characters · include letters and numbers
            </p>

            {error ? (
              <div className="mt-5 rounded-xl border border-brand-red/35 bg-red-50/95 p-3 text-sm text-brand-red dark:border-brand-red/40 dark:bg-red-950/55 dark:text-red-200">
                {error}
              </div>
            ) : null}

            <div className="mt-6">
              <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9DA3A6] dark:text-stone-500 sm:text-[11px] sm:tracking-[0.14em]">
                New password
              </label>
              <div
                className={`flex overflow-hidden rounded-xl border border-black/[0.08] bg-[#eceef2] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-stone-600 dark:bg-stone-900/60 ${inputWrapFocus}`}
              >
                <span className="w-1 shrink-0 bg-brand-blue/85 dark:bg-brand-green/90" aria-hidden />
                <input
                  className="min-w-0 flex-1 border-0 bg-transparent py-3 pl-3.5 pr-3.5 text-base text-brand-black outline-none ring-0 sm:py-3.5 sm:pl-4 sm:pr-4 sm:text-sm dark:text-stone-100"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9DA3A6] dark:text-stone-500 sm:text-[11px] sm:tracking-[0.14em]">
                Confirm password
              </label>
              <div
                className={`flex overflow-hidden rounded-xl border border-black/[0.08] bg-[#eceef2] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-stone-600 dark:bg-stone-900/60 ${inputWrapFocus}`}
              >
                <span className="w-1 shrink-0 bg-brand-blue/85 dark:bg-brand-green/90" aria-hidden />
                <input
                  className="min-w-0 flex-1 border-0 bg-transparent py-3 pl-3.5 pr-3.5 text-base text-brand-black outline-none ring-0 sm:py-3.5 sm:pl-4 sm:pr-4 sm:text-sm dark:text-stone-100"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="mt-6">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-brand-black dark:text-stone-200 sm:items-center">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-400 text-brand-blue focus:ring-brand-blue sm:mt-0 dark:border-stone-500 dark:text-brand-green dark:focus:ring-brand-green"
                />
                <span className="min-w-0 leading-snug">Remember me on this device</span>
              </label>
            </div>

            <button type="submit" disabled={loading} className="btn-primary mt-6 h-12 w-full text-[15px] tracking-wide">
              {loading ? "Saving…" : "Update password & sign in"}
            </button>

            <Link className="mt-4 block text-center text-sm font-semibold text-brand-blue dark:text-brand-green" to="/login">
              Back to sign in
            </Link>
      </form>
    </AuthSplitLayout>
  );
}
