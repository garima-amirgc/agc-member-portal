import axios from "axios";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthBirdsCorner from "../components/layout/AuthBirdsCorner";
import { AMIR_GROUP_LOGO_SRC, APP_DISPLAY_NAME } from "../constants/branding";
import { useAuth } from "../context/AuthContext";
import api, { getApiBaseURL } from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

/** Shared focus ring for accent inputs */
const inputWrapFocus = "focus-within:ring-2 focus-within:ring-brand-blue/25 dark:focus-within:ring-brand-green/20";

export default function InviteSetupPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { establishSession } = useAuth();

  const [status, setStatus] = useState("checking"); // checking | ready | invalid
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
      .get(`/auth/invite-status?token=${encodeURIComponent(token)}`)
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
      const { data } = await api.post("/auth/complete-invite", { token, password, rememberMe });
      establishSession(data);
      navigate("/", { replace: true });
    } catch (err) {
      setError(friendlyErrorMessage(err, "Could not save password."));
    } finally {
      setLoading(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-brand-surface px-4 dark:bg-[#0a0a0a]">
        <p className="text-sm text-brand-muted dark:text-stone-400">Checking your invite…</p>
      </div>
    );
  }

  if (status === "invalid" || !token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-brand-surface px-4 dark:bg-[#0a0a0a]">
        <div className="w-full max-w-md rounded-2xl border border-black/[0.07] bg-white p-7 shadow-[0_8px_40px_rgba(11,62,175,0.12),0_2px_12px_rgba(0,0,0,0.06)] dark:border-stone-800 dark:bg-[#141414] sm:rounded-3xl sm:p-8">
          <h1 className="font-sans text-xl font-bold tracking-tight text-brand-blue dark:text-brand-green">Invite not valid</h1>
          <p className="mt-3 text-sm leading-relaxed text-brand-muted dark:text-stone-400">
            This link may have expired or was already used. Ask your administrator for a new invite, or sign in if you
            already set a password.
          </p>
          <Link className="btn-primary mt-6 inline-block w-full text-center no-underline" to="/login">
            Back to sign in
          </Link>
          <Link
            className="mt-4 block text-center text-sm font-semibold text-brand-blue no-underline dark:text-brand-green"
            to="/forgot-password"
          >
            Request a new setup link by email
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-gradient-to-br from-[#eef2fb] via-[#f4f6fb] to-[#e2e8f3] dark:from-[#0a0a0a] dark:via-[#0c0c0c] dark:to-[#111111]">
      <AuthBirdsCorner />
      <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-1 flex-col justify-center gap-5 px-4 py-8 sm:gap-6 sm:px-6 sm:py-10 md:px-8 lg:flex-row lg:items-center lg:justify-center lg:gap-0 lg:px-8 lg:py-12 xl:px-10">
        {/* Brand panel */}
        <section className="agc-login-hero relative isolate z-0 order-1 flex w-full min-w-0 flex-col gap-6 overflow-hidden rounded-2xl px-6 py-8 shadow-[0_20px_60px_rgba(11,62,175,0.35)] sm:gap-7 sm:rounded-3xl sm:px-8 sm:py-10 md:px-10 md:py-11 lg:order-none lg:min-h-[min(520px,85vh)] lg:w-[min(100%,520px)] lg:flex-shrink-0 lg:rounded-3xl">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0B3EAF] via-[#0a3494] to-[#061f5c]" aria-hidden />
          <div className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full bg-[#4a7eef]/20 blur-3xl sm:h-72 sm:w-72" aria-hidden />
          <div className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl sm:h-80 sm:w-80" aria-hidden />
          <div className="pointer-events-none absolute bottom-[18%] right-[12%] h-40 w-40 rounded-full bg-brand-green/12 blur-2xl sm:h-48 sm:w-48" aria-hidden />

          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: `repeating-linear-gradient(
                -45deg,
                transparent,
                transparent 14px,
                rgba(255,255,255,0.06) 14px,
                rgba(255,255,255,0.06) 28px
              )`,
            }}
            aria-hidden
          />

          <div className="relative z-10 flex w-full min-w-0 flex-col gap-5 sm:gap-6">
            <Link to="/" aria-label="Home" className="inline-flex w-fit max-w-full shrink-0">
              <img
                src={AMIR_GROUP_LOGO_SRC}
                alt="AMIR Group of Companies"
                className="h-auto w-[220px] max-w-full object-contain object-left drop-shadow-[0_2px_10px_rgba(0,0,0,0.28)]"
              />
            </Link>

            <div className="min-w-0 space-y-3 sm:space-y-4 lg:pr-24">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80 sm:text-[11px] sm:tracking-[0.26em]">
                Official access
              </p>
              <h1 className="break-words font-sans text-[clamp(1.35rem,4.2vw,1.875rem)] font-bold leading-tight tracking-[0.06em] text-white sm:tracking-[0.1em]">
                SET YOUR PASSWORD
              </h1>
              <p className="max-w-prose text-pretty text-sm leading-relaxed text-white/88 sm:text-[15px]">
                Choose a secure password to finish activating your account.
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-1 flex shrink-0 flex-wrap items-center gap-2 sm:gap-2.5">
            <span className="h-2 w-8 rounded-full bg-brand-green shadow-sm shadow-black/20 sm:w-9" />
            <span className="h-2 w-8 rounded-full bg-white/90 shadow-sm shadow-black/10 sm:w-9" />
            <span className="h-2 w-8 rounded-full bg-brand-red shadow-sm shadow-black/20 sm:w-9" />
          </div>
        </section>

        {/* Card */}
        <div className="relative z-10 order-2 w-full min-w-0 max-w-full lg:order-none lg:-ml-10 lg:max-w-[min(100%,440px)] lg:flex-shrink-0 xl:-ml-16 xl:max-w-[460px]">
          <form
            className="w-full min-w-0 rounded-2xl border border-black/[0.07] bg-white px-5 py-7 shadow-[0_8px_40px_rgba(11,62,175,0.12),0_2px_12px_rgba(0,0,0,0.06)] dark:border-stone-800 dark:bg-[#141414] sm:rounded-3xl sm:px-8 sm:py-9 md:px-9 md:py-10 lg:rounded-3xl lg:px-10 lg:py-11"
            onSubmit={onSubmit}
          >
            <h2 className="font-sans text-2xl font-bold tracking-tight text-brand-blue dark:text-brand-green">Create password</h2>
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
              {loading ? "Saving…" : "Activate account"}
            </button>

            <Link className="mt-4 block text-center text-sm font-semibold text-brand-blue dark:text-brand-green" to="/login">
              Already have a password? Sign in
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
