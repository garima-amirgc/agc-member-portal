import axios from "axios";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthBirdsCorner from "../components/layout/AuthBirdsCorner";
import { AMIR_GROUP_LOGO_SRC, APP_DISPLAY_NAME } from "../constants/branding";
import { useAuth } from "../context/AuthContext";
import { postAuthLandingPath } from "../utils/facilityUniversityOnly";
import api, { getApiBaseURL } from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

const isDev = import.meta.env.DEV;

const inputWrapFocus = "focus-within:ring-2 focus-within:ring-brand-blue/25 dark:focus-within:ring-brand-green/20";

export default function LoginPage() {
  const { login, refreshMe } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState({
    email: isDev ? "admin@company.com" : "",
    password: isDev ? "admin123" : "",
  });
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [microsoftEnabled, setMicrosoftEnabled] = useState(false);

  useEffect(() => {
    const ssoError = searchParams.get("sso_error");
    const ssoCode = searchParams.get("sso_code");
    if (!ssoError) return;
    let msg = decodeURIComponent(ssoError.replace(/\+/g, " "));
    if (ssoCode === "INVITE_PENDING") {
      msg =
        "This account still needs a password. Check your email for the invite, or use Forgot password below to resend the setup link.";
    } else if (ssoCode === "INVITE_EXPIRED") {
      msg = "Your setup link has expired. Ask an administrator to send a new invite.";
    } else if (ssoCode === "NO_PORTAL_USER") {
      msg =
        "No portal account exists for this Microsoft email. Ask an administrator to add you to the AGC Member Portal.";
    }
    setError(msg);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    api
      .get("/auth/microsoft/status")
      .then(({ data }) => setMicrosoftEnabled(Boolean(data?.enabled)))
      .catch(() => setMicrosoftEnabled(false));
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password, rememberMe);
      let nextUser = null;
      try {
        nextUser = JSON.parse(localStorage.getItem("user") || "null");
      } catch {
        nextUser = null;
      }
      navigate(postAuthLandingPath(nextUser), { replace: true });
      refreshMe().catch(() => {});
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
            "No account found for that email, or the password is incorrect. If you don’t have an account yet, ask an administrator to add you to the AGC Member Portal."
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

  const startMicrosoftLogin = () => {
    const base = getApiBaseURL().replace(/\/+$/, "");
    const remember = rememberMe ? "1" : "0";
    window.location.href = `${base}/api/auth/microsoft?remember=${remember}`;
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-gradient-to-br from-[#eef2fb] via-[#f4f6fb] to-[#e2e8f3] dark:from-[#0a0a0a] dark:via-[#0c0c0c] dark:to-[#111111] lg:h-[100dvh] lg:overflow-x-hidden">
      <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-1 flex-col justify-center gap-4 px-4 py-4 sm:gap-5 sm:px-6 sm:py-5 md:px-8 lg:min-h-0 lg:flex-row lg:items-center lg:justify-center lg:gap-0 lg:px-8 lg:py-2 xl:px-10">
        <section
          className="agc-login-hero relative isolate z-0 order-1 flex w-full min-w-0 flex-col gap-4 overflow-hidden rounded-2xl px-6 py-6 pb-28 shadow-[0_20px_60px_rgba(11,62,175,0.35)] sm:gap-5 sm:rounded-3xl sm:px-8 sm:py-7 sm:pb-32 md:px-10 md:py-8 lg:order-none lg:w-[min(100%,520px)] lg:flex-shrink-0 lg:rounded-3xl lg:py-8 lg:pb-8"
          aria-labelledby="login-brand-heading"
        >
          <AuthBirdsCorner placement="hero" />
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

          <div className="relative z-10 flex w-full min-w-0 flex-col gap-4 sm:gap-5">
            <Link to="/" aria-label="Home" className="inline-flex w-fit max-w-full shrink-0">
              <img
                src={AMIR_GROUP_LOGO_SRC}
                alt="AMIR Group of Companies"
                className="h-auto w-[220px] max-w-full object-contain object-left drop-shadow-[0_2px_10px_rgba(0,0,0,0.28)]"
              />
            </Link>

            <div className="min-w-0 space-y-2 sm:space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80 sm:text-[11px] sm:tracking-[0.26em]">
                Official access
              </p>
              <h1
                id="login-brand-heading"
                className="break-words font-sans text-[clamp(1.35rem,4.2vw,1.875rem)] font-bold leading-tight tracking-[0.06em] text-white sm:tracking-[0.1em]"
              >
                AGC MEMBER PORTAL
              </h1>
              <p className="break-words font-['Marcellus',Georgia,serif] text-[clamp(1.125rem,3.5vw,1.5rem)] font-semibold leading-snug text-white/95">
                Learn. Comply. Grow.
              </p>
              <p className="max-w-md pr-8 text-sm leading-relaxed text-white/85 sm:pr-10 sm:text-[15px] lg:pr-24 xl:pr-28">
                Sign in with your work Microsoft account or use your email and password.
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-1 flex shrink-0 flex-wrap items-center gap-2 sm:gap-2.5">
            <span className="h-2 w-8 rounded-full bg-brand-green shadow-sm shadow-black/20 sm:w-9" />
            <span className="h-2 w-8 rounded-full bg-white/90 shadow-sm shadow-black/10 sm:w-9" />
            <span className="h-2 w-8 rounded-full bg-brand-red shadow-sm shadow-black/20 sm:w-9" />
          </div>
        </section>

        <div className="relative z-10 order-2 w-full min-w-0 max-w-full lg:order-none lg:-ml-10 lg:max-w-[min(100%,440px)] lg:flex-shrink-0 xl:-ml-16 xl:max-w-[460px]">
          <div className="mb-4 rounded-2xl border border-black/[0.06] bg-white/90 px-5 py-4 shadow-[0_4px_24px_rgba(15,23,42,0.06)] backdrop-blur-sm dark:border-stone-700/80 dark:bg-[#141414]/95 dark:shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:mb-5 sm:px-6 sm:py-5 lg:hidden">
            <h2 className="font-sans text-lg font-bold text-brand-black dark:text-white sm:text-xl">Sign in</h2>
            <p className="mt-1 text-xs text-brand-muted dark:text-stone-400">{APP_DISPLAY_NAME}</p>
          </div>

          <form
            className="w-full min-w-0 rounded-2xl border border-black/[0.07] bg-white px-5 py-6 shadow-[0_8px_40px_rgba(11,62,175,0.12),0_2px_12px_rgba(0,0,0,0.06)] dark:border-stone-800 dark:bg-[#141414] sm:rounded-3xl sm:px-8 sm:py-7 md:px-9 md:py-8 lg:rounded-3xl lg:px-10 lg:py-8"
            onSubmit={onSubmit}
          >
            <div className="mb-4 hidden lg:block">
              <h2 className="font-sans text-2xl font-bold tracking-tight text-brand-blue dark:text-brand-green xl:text-3xl">
                Welcome back
              </h2>
            </div>

            {isDev ? (
              <p className="mb-3 rounded-xl border border-dashed border-brand-blue/30 bg-brand-blue-soft/60 px-3 py-2 text-xs leading-relaxed text-brand-muted dark:border-white/20 dark:bg-stone-900/90 dark:text-stone-400 sm:mb-4">
                <span className="font-semibold text-brand-blue dark:text-brand-green">Development:</span> API{" "}
                <code className="break-all font-mono text-[11px] text-slate-700 dark:text-stone-300">
                  {getApiBaseURL()}
                </code>
                {" — "}override with <code className="font-mono text-[11px]">VITE_API_URL</code> in{" "}
                <code className="font-mono text-[11px]">frontend/.env</code> if required.
              </p>
            ) : (
              <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.12em] text-[#9DA3A6] dark:text-stone-500 sm:mb-4 sm:text-xs sm:tracking-[0.14em]">
                Secure session · authorized use only
              </p>
            )}

            {error && (
              <div className="mb-4 rounded-xl border border-brand-red/35 bg-red-50/95 p-3 text-sm text-brand-red dark:border-brand-red/40 dark:bg-red-950/55 dark:text-red-200 sm:mb-5 sm:p-3.5">
                {error}
              </div>
            )}

            {microsoftEnabled ? (
              <div className="mb-4 sm:mb-5">
                <button
                  type="button"
                  onClick={startMicrosoftLogin}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#8C8C8C]/40 bg-white text-[15px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
                >
                  <svg className="h-5 w-5" viewBox="0 0 21 21" aria-hidden>
                    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                  </svg>
                  Sign in with Microsoft
                </button>
                <div className="relative my-3 flex items-center">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-stone-700" />
                  <span className="px-3 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-stone-500">
                    or
                  </span>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-stone-700" />
                </div>
              </div>
            ) : null}

            <div className="mb-3 sm:mb-4">
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

            <div className="mb-3 sm:mb-4">
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
                  className="min-w-0 flex-1 border-0 bg-transparent py-3 pl-3.5 pr-2 text-base text-brand-black outline-none ring-0 sm:py-3.5 sm:pl-4 sm:pr-2 sm:text-sm dark:text-stone-100"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  className="flex shrink-0 items-center justify-center px-3 text-slate-500 transition hover:text-brand-blue dark:text-stone-400 dark:hover:text-brand-green"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M3 3l18 18" strokeLinecap="round" />
                      <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
                      <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5.52 0 10 4.48 10 8 0 1.1-.28 2.14-.77 3.05" />
                      <path d="M6.61 6.61A10.94 10.94 0 0 0 2 13c0 3.52 4.48 8 10 8 1.74 0 3.37-.44 4.78-1.22" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M2 13c0-3.52 4.48-8 10-8s10 4.48 10 8-4.48 8-10 8-10-4.48-10-8z" />
                      <circle cx="12" cy="13" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="mb-4 sm:mb-5">
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
      <div className="absolute bottom-0 right-0 z-10 hidden lg:block">
        <AuthBirdsCorner placement="band" />
      </div>
    </div>
  );
}
