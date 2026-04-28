import axios from "axios";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AMIR_GROUP_LOGO_SRC, APP_DISPLAY_NAME } from "../constants/branding";
import { useAuth } from "../context/AuthContext";
import { getApiBaseURL } from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

const isDev = import.meta.env.DEV;

/** Shared focus ring for accent inputs */
const inputWrapFocus = "focus-within:ring-2 focus-within:ring-brand-blue/25 dark:focus-within:ring-brand-green/20";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: isDev ? "admin@company.com" : "",
    password: isDev ? "admin123" : "",
  });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password, rememberMe);
      navigate("/", { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.code === "ECONNABORTED") {
          setError("Request timed out. Is the API running?");
        } else if (err.response?.status === 403) {
          const code = err.response?.data?.code;
          if (code === "INVITE_PENDING") {
            setError(
              "This account still needs a password. Check your email for the invite, or use Forgot password below to resend the setup link."
            );
          } else if (code === "INVITE_EXPIRED") {
            setError(
              "Your setup link has expired. Ask an administrator to send a new invite from Users → Resend invite."
            );
          } else {
            setError(err.response?.data?.message || "Access denied.");
          }
        } else if (err.response?.status === 401) {
          setError(
            "No account found for that email, or the password is incorrect. If you don’t have an account yet, ask an administrator to add you to the Member Portal."
          );
        } else if (!err.response) {
          setError(
            `Cannot reach API at ${getApiBaseURL()}. Open two terminals: (1) cd backend && npm run dev  (2) cd frontend && npm run dev  Then open the URL Vite prints (e.g. http://localhost:5173). Do not open index.html from the file explorer.`
          );
        } else {
          setError(friendlyErrorMessage(err, "Login failed."));
        }
      } else {
        setError(friendlyErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-gradient-to-br from-[#eef2fb] via-[#f4f6fb] to-[#e2e8f3] dark:from-[#0a0a0a] dark:via-[#0c0c0c] dark:to-[#111111]">
      <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-1 flex-col justify-center gap-5 px-4 py-8 sm:gap-6 sm:px-6 sm:py-10 md:px-8 lg:flex-row lg:items-center lg:justify-center lg:gap-0 lg:px-8 lg:py-12 xl:px-10">
        {/* Brand panel */}
        <section
          className="agc-login-hero relative isolate z-0 order-1 flex w-full min-w-0 flex-col gap-6 overflow-hidden rounded-2xl px-6 py-8 shadow-[0_20px_60px_rgba(11,62,175,0.35)] sm:gap-7 sm:rounded-3xl sm:px-8 sm:py-10 md:px-10 md:py-11 lg:order-none lg:min-h-[min(520px,85vh)] lg:w-[min(100%,520px)] lg:flex-shrink-0 lg:rounded-3xl"
          aria-labelledby="login-brand-heading"
        >
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0B3EAF] via-[#0a3494] to-[#061f5c]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full bg-[#4a7eef]/20 blur-3xl sm:h-72 sm:w-72"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl sm:h-80 sm:w-80"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-[18%] right-[12%] h-40 w-40 rounded-full bg-brand-green/12 blur-2xl sm:h-48 sm:w-48"
            aria-hidden
          />

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

            <div className="min-w-0 space-y-3 sm:space-y-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80 sm:text-[11px] sm:tracking-[0.26em]">
                Official access
              </p>
              <h1
                id="login-brand-heading"
                className="break-words font-sans text-[clamp(1.35rem,4.2vw,1.875rem)] font-bold leading-tight tracking-[0.06em] text-white sm:tracking-[0.1em]"
              >
                MEMBER PORTAL
              </h1>
              <p className="break-words font-['Marcellus',Georgia,serif] text-[clamp(1.125rem,3.5vw,1.5rem)] font-semibold leading-snug text-white/95">
                Learn. Comply. Grow.
              </p>
              <p className="max-w-prose text-pretty text-sm leading-relaxed text-white/88 sm:text-[15px]">
                Centralized learning, attestations, and workplace services—delivered through a single, secure entry
                point for employees and managers across the group.
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-1 flex shrink-0 flex-wrap items-center gap-2 sm:gap-2.5">
            <span className="h-2 w-8 rounded-full bg-brand-green shadow-sm shadow-black/20 sm:w-9" />
            <span className="h-2 w-8 rounded-full bg-white/90 shadow-sm shadow-black/10 sm:w-9" />
            <span className="h-2 w-8 rounded-full bg-brand-red shadow-sm shadow-black/20 sm:w-9" />
          </div>
        </section>

        {/* Login card */}
        <div className="relative z-10 order-2 w-full min-w-0 max-w-full lg:order-none lg:-ml-10 lg:max-w-[min(100%,440px)] lg:flex-shrink-0 xl:-ml-16 xl:max-w-[460px]">
          <div className="mb-4 rounded-2xl border border-black/[0.06] bg-white/90 px-5 py-4 shadow-[0_4px_24px_rgba(15,23,42,0.06)] backdrop-blur-sm dark:border-stone-700/80 dark:bg-[#141414]/95 dark:shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:mb-5 sm:px-6 sm:py-5 lg:hidden">
            <h2 className="font-sans text-lg font-bold text-brand-black dark:text-white sm:text-xl">Sign in</h2>
            <p className="mt-1 text-xs text-brand-muted dark:text-stone-400">{APP_DISPLAY_NAME}</p>
          </div>

          <form
            className="w-full min-w-0 rounded-2xl border border-black/[0.07] bg-white px-5 py-7 shadow-[0_8px_40px_rgba(11,62,175,0.12),0_2px_12px_rgba(0,0,0,0.06)] dark:border-stone-800 dark:bg-[#141414] sm:rounded-3xl sm:px-8 sm:py-9 md:px-9 md:py-10 lg:rounded-3xl lg:px-10 lg:py-11"
            onSubmit={onSubmit}
          >
            <div className="mb-7 hidden lg:block">
              <h2 className="font-sans text-2xl font-bold tracking-tight text-brand-blue dark:text-brand-green xl:text-3xl">
                Welcome back
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#5c5f66] dark:text-stone-400">
                Sign in with your work email and the password issued by your administrator. This portal is restricted to
                authorized personnel.
              </p>
            </div>

            {isDev ? (
              <p className="mb-5 rounded-xl border border-dashed border-brand-blue/30 bg-brand-blue-soft/60 px-3 py-2.5 text-xs leading-relaxed text-brand-muted dark:border-white/20 dark:bg-stone-900/90 dark:text-stone-400 sm:mb-6">
                <span className="font-semibold text-brand-blue dark:text-brand-green">Development:</span> API{" "}
                <code className="break-all font-mono text-[11px] text-slate-700 dark:text-stone-300">
                  {getApiBaseURL()}
                </code>
                {" — "}override with <code className="font-mono text-[11px]">VITE_API_URL</code> in{" "}
                <code className="font-mono text-[11px]">frontend/.env</code> if required.
              </p>
            ) : (
              <p className="mb-5 text-[10px] font-medium uppercase tracking-[0.12em] text-[#9DA3A6] dark:text-stone-500 sm:mb-6 sm:text-xs sm:tracking-[0.14em]">
                Secure session · authorized use only
              </p>
            )}

            {error && (
              <div className="mb-4 rounded-xl border border-brand-red/35 bg-red-50/95 p-3 text-sm text-brand-red dark:border-brand-red/40 dark:bg-red-950/55 dark:text-red-200 sm:mb-5 sm:p-3.5">
                {error}
              </div>
            )}

            <div className="mb-4 sm:mb-5">
              <label
                htmlFor="login-email"
                className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9DA3A6] dark:text-stone-500 sm:text-[11px] sm:tracking-[0.14em]"
              >
                Email
              </label>
              <div
                className={`flex overflow-hidden rounded-xl border border-black/[0.08] bg-[#F4F6F9] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] dark:border-stone-600 dark:bg-stone-900/80 ${inputWrapFocus}`}
              >
                <span className="w-1 shrink-0 bg-brand-blue dark:bg-brand-green" aria-hidden />
                <input
                  id="login-email"
                  className="min-w-0 flex-1 border-0 bg-transparent py-3 pl-3.5 pr-3.5 text-base text-brand-black outline-none ring-0 placeholder:text-stone-400 sm:py-3.5 sm:pl-4 sm:pr-4 sm:text-sm dark:text-stone-100 dark:placeholder:text-stone-500"
                  placeholder="name@company.com"
                  autoComplete="username"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>

            <div className="mb-4 sm:mb-5">
              <div className="mb-2 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <label
                  htmlFor="login-password"
                  className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9DA3A6] dark:text-stone-500 sm:text-[11px] sm:tracking-[0.14em]"
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-brand-blue hover:underline sm:text-[11px] sm:tracking-[0.12em] dark:text-brand-green"
                >
                  Forgot?
                </Link>
              </div>
              <div
                className={`flex overflow-hidden rounded-xl border border-black/[0.08] bg-[#eceef2] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-stone-600 dark:bg-stone-900/60 ${inputWrapFocus}`}
              >
                <span className="w-1 shrink-0 bg-brand-blue/85 dark:bg-brand-green/90" aria-hidden />
                <input
                  id="login-password"
                  className="min-w-0 flex-1 border-0 bg-transparent py-3 pl-3.5 pr-3.5 text-base text-brand-black outline-none ring-0 sm:py-3.5 sm:pl-4 sm:pr-4 sm:text-sm dark:text-stone-100"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </div>

            <div className="mb-6 sm:mb-7">
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

            <button type="submit" disabled={loading} className="btn-primary h-12 w-full text-[15px] tracking-wide">
              {loading ? "Signing in…" : "Log in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
