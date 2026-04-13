import axios from "axios";
import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

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
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "Something went wrong.");
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white lg:flex-row dark:bg-black">
      <div className="agc-login-hero relative flex min-h-[200px] flex-col justify-center px-8 py-8 lg:min-h-screen lg:w-[38%] lg:py-12">
        <div
          className="absolute left-0 right-0 top-0 h-1.5 bg-gradient-to-r from-[#f04a41] via-[#E02B20] to-[#c4241a]"
          aria-hidden
        />
        <div className="relative z-[1]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">AGC University</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">Account help</h1>
          <p className="mt-3 max-w-sm text-sm text-white/85">
            Resend your setup link or reset your password. We’ll email you if we find your account.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-brand-surface px-4 py-12 dark:bg-[#0a0a0a]">
        <div className="w-full max-w-[400px]">
          <form
            className="agc-form rounded-portal border border-black/[0.08] bg-white p-8 shadow-brand-lg dark:border-stone-800 dark:bg-[#141414]"
            onSubmit={onSubmit}
          >
            <h2 className="font-serif text-2xl font-bold text-brand-black dark:text-white">Forgot password</h2>
            <p className="mt-2 text-sm text-brand-muted dark:text-stone-400">
              Enter your work email. Pending invites get a setup link again; active accounts get a password reset link.
            </p>

            {error ? (
              <div className="mt-4 rounded-portal border border-brand-red/30 bg-red-50 p-3 text-sm text-brand-red dark:border-brand-red/40 dark:bg-red-950/50 dark:text-red-200">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="mt-4 rounded-portal border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                {message}
              </div>
            ) : null}

            <label className="mb-1.5 mt-4 block text-sm font-bold text-brand-black dark:text-stone-200">Email</label>
            <input
              className="mb-6 w-full rounded-portal border border-black/[0.1] bg-white px-3.5 py-3 text-sm outline-none dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Sending…" : "Send instructions"}
            </button>

            <Link
              className="mt-4 block text-center text-sm font-semibold text-brand-blue dark:text-brand-green"
              to="/login"
            >
              Back to sign in
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
