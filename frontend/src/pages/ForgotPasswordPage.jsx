import axios from "axios";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AMIR_GROUP_LOGO_SRC, APP_DISPLAY_NAME } from "../constants/branding";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

/** Shared focus ring for accent inputs */
const inputWrapFocus = "focus-within:ring-2 focus-within:ring-brand-blue/25 dark:focus-within:ring-brand-green/20";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/recover-access", { email: email.trim() });
      setMessage(data?.message || "If this address is registered, check your email.");
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-gradient-to-br from-[#eef2fb] via-[#f4f6fb] to-[#e2e8f3] dark:from-[#0a0a0a] dark:via-[#0c0c0c] dark:to-[#111111]">
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

            <div className="min-w-0 space-y-3 sm:space-y-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80 sm:text-[11px] sm:tracking-[0.26em]">
                {APP_DISPLAY_NAME}
              </p>
              <h1 className="break-words font-sans text-[clamp(1.35rem,4.2vw,1.875rem)] font-bold leading-tight tracking-[0.06em] text-white sm:tracking-[0.1em]">
                ACCOUNT HELP
              </h1>
              <p className="max-w-prose text-pretty text-sm leading-relaxed text-white/88 sm:text-[15px]">
                Resend your setup link or reset your password. If the email is registered, we’ll send instructions to your inbox.
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
            <h2 className="font-sans text-2xl font-bold tracking-tight text-brand-blue dark:text-brand-green">Forgot password</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#5c5f66] dark:text-stone-400">
              Enter your work email.
            </p>

            {error ? (
              <div className="mt-5 rounded-xl border border-brand-red/35 bg-red-50/95 p-3 text-sm text-brand-red dark:border-brand-red/40 dark:bg-red-950/55 dark:text-red-200">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                {message}
              </div>
            ) : null}

            <div className="mt-6">
              <label
                htmlFor="recover-email"
                className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9DA3A6] dark:text-stone-500 sm:text-[11px] sm:tracking-[0.14em]"
              >
                Email
              </label>
              <div
                className={`flex overflow-hidden rounded-xl border border-black/[0.08] bg-[#F4F6F9] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] dark:border-stone-600 dark:bg-stone-900/80 ${inputWrapFocus}`}
              >
                <span className="w-1 shrink-0 bg-brand-blue dark:bg-brand-green" aria-hidden />
                <input
                  id="recover-email"
                  className="min-w-0 flex-1 border-0 bg-transparent py-3 pl-3.5 pr-3.5 text-base text-brand-black outline-none ring-0 placeholder:text-stone-400 sm:py-3.5 sm:pl-4 sm:pr-4 sm:text-sm dark:text-stone-100 dark:placeholder:text-stone-500"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary mt-6 h-12 w-full text-[15px] tracking-wide">
              {loading ? "Sending…" : "Send instructions"}
            </button>

            <Link className="mt-4 block text-center text-sm font-semibold text-brand-blue dark:text-brand-green" to="/login">
              Back to sign in
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
