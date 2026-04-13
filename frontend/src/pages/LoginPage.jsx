import axios from "axios";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiBaseURL } from "../services/api";

const isDev = import.meta.env.DEV;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: isDev ? "admin@company.com" : "",
    password: isDev ? "admin123" : "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/", { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.code === "ECONNABORTED") {
          setError("Request timed out. Is the API running?");
        } else if (err.response?.status === 403) {
          const code = err.response?.data?.code;
          if (code === "INVITE_PENDING") {
            setError(
              "This account is waiting for you to set a password. Open the invite link from your email, or ask an administrator to resend it."
            );
          } else if (code === "INVITE_EXPIRED") {
            setError(
              "Your setup link has expired. Ask an administrator to send a new invite from Users → Resend invite."
            );
          } else {
            setError(err.response?.data?.message || "Access denied.");
          }
        } else if (err.response?.status === 401) {
          setError("Invalid email or password.");
        } else if (!err.response) {
          setError(
            `Cannot reach API at ${apiBaseURL}. Open two terminals: (1) cd backend && npm run dev  (2) cd frontend && npm run dev  Then open the URL Vite prints (e.g. http://localhost:5173). Do not open index.html from the file explorer.`
          );
        } else {
          setError(err.response?.data?.message || "Login failed.");
        }
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white lg:flex-row dark:bg-black">
      <div className="agc-login-hero relative flex min-h-[300px] flex-col justify-center overflow-hidden px-8 py-10 lg:min-h-screen lg:w-[42%] lg:py-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 12px,
              rgba(255,255,255,0.06) 12px,
              rgba(255,255,255,0.06) 24px
            )`,
          }}
          aria-hidden
        />
        <div
          className="absolute left-0 right-0 top-0 h-1.5 bg-gradient-to-r from-[#f04a41] via-[#E02B20] to-[#c4241a]"
          aria-hidden
        />
        <div className="relative z-[1] flex flex-col gap-5">
          <img
            src="/agc-group-logo.png"
            alt="AGC GROUP"
            className="h-[4.5rem] w-auto max-w-[220px] object-contain object-left"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">AGC University</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white lg:text-3xl">Member Portal</h1>
            <p className="mt-3 font-serif text-xl font-semibold leading-snug text-white/95 lg:text-2xl">
              Learn. Comply. Grow.
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/85">
              Training, compliance, and workplace tools in one secure hub for your team.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <span className="h-2 w-8 rounded-full bg-brand-green" />
            <span className="h-2 w-8 rounded-full bg-white/90" />
            <span className="h-2 w-8 rounded-full bg-brand-red" />
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-brand-surface px-4 py-12 dark:bg-[#0a0a0a]">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <div className="mb-3 h-1 w-14 rounded-full bg-gradient-to-r from-[#f04a41] via-[#E02B20] to-[#c4241a]" />
            <h2 className="font-serif text-2xl font-bold text-brand-black dark:text-white">Sign in</h2>
            <p className="mt-1 text-sm text-brand-muted dark:text-stone-400">AGC University</p>
          </div>

          <form
            className="agc-form rounded-portal border border-black/[0.08] bg-white p-8 shadow-brand-lg dark:border-stone-800 dark:bg-[#141414]"
            onSubmit={onSubmit}
          >
            <div className="mb-6 hidden lg:block">
              <h2 className="font-serif text-2xl font-bold text-brand-black dark:text-white">Welcome back</h2>
              <p className="mt-1 text-sm text-brand-muted dark:text-stone-400">
                Sign in with the email and password issued by your administrator.
              </p>
            </div>

            {isDev ? (
              <p className="mb-6 rounded-portal border border-dashed border-brand-blue/25 bg-brand-surface/80 px-3 py-2 text-xs leading-relaxed text-brand-muted dark:border-white/15 dark:bg-stone-900/80 dark:text-stone-400">
                <span className="font-semibold text-brand-blue dark:text-brand-green">Dev:</span> API{" "}
                <code className="font-mono text-[11px] text-slate-700 dark:text-stone-300">{apiBaseURL}</code>
                {" — "}
                <code className="font-mono text-[11px]">VITE_API_URL</code> in{" "}
                <code className="font-mono text-[11px]">frontend/.env</code> if needed.
              </p>
            ) : (
              <p className="mb-6 text-sm leading-relaxed text-brand-muted dark:text-stone-400">
                Secure access for authorized members only.
              </p>
            )}

            {error && (
              <div className="mb-4 rounded-portal border border-brand-red/30 bg-red-50 p-3 text-sm text-brand-red dark:border-brand-red/40 dark:bg-red-950/50 dark:text-red-200">
                {error}
              </div>
            )}

            <label className="mb-1.5 block text-sm font-bold text-brand-black dark:text-stone-200">Email</label>
            <input
              className="mb-4 w-full rounded-portal border border-black/[0.1] bg-white px-3.5 py-3 text-sm text-brand-black outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-brand-green dark:focus:ring-brand-green/25"
              placeholder="name@company.com"
              autoComplete="username"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />

            <label className="mb-1.5 block text-sm font-bold text-brand-black dark:text-stone-200">Password</label>
            <input
              className="mb-6 w-full rounded-portal border border-black/[0.1] bg-white px-3.5 py-3 text-sm text-brand-black outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-brand-green dark:focus:ring-brand-green/25"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? "Signing in…" : "Log in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
