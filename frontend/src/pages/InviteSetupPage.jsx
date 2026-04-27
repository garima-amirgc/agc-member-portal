import axios from "axios";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { APP_DISPLAY_NAME } from "../constants/branding";
import { useAuth } from "../context/AuthContext";
import api, { getApiBaseURL } from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";

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
        <div className="w-full max-w-md rounded-portal border border-black/[0.08] bg-white p-8 shadow-brand-lg dark:border-stone-800 dark:bg-[#141414]">
          <h1 className="font-serif text-xl font-bold text-brand-black dark:text-white">Invite not valid</h1>
          <p className="mt-2 text-sm text-brand-muted dark:text-stone-400">
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
    <div className="flex min-h-screen flex-col bg-white lg:flex-row dark:bg-black">
      <div className="agc-login-hero relative flex min-h-[200px] flex-col justify-center px-8 py-8 lg:min-h-screen lg:w-[38%] lg:py-12">
        <div
          className="absolute left-0 right-0 top-0 h-1.5 bg-gradient-to-r from-[#f04a41] via-[#E02B20] to-[#c4241a]"
          aria-hidden
        />
        <div className="relative z-[1]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">{APP_DISPLAY_NAME}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">Set your password</h1>
          <p className="mt-3 max-w-sm text-sm text-white/85">
            Choose a secure password to finish activating your account.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-brand-surface px-4 py-12 dark:bg-[#0a0a0a]">
        <div className="w-full max-w-[400px]">
          <form
            className="agc-form rounded-portal border border-black/[0.08] bg-white p-8 shadow-brand-lg dark:border-stone-800 dark:bg-[#141414]"
            onSubmit={onSubmit}
          >
            <h2 className="font-serif text-2xl font-bold text-brand-black dark:text-white">Create password</h2>
            {maskedEmail ? (
              <p className="mt-2 text-sm text-brand-muted dark:text-stone-400">
                Account: <span className="font-semibold text-brand-black dark:text-stone-200">{maskedEmail}</span>
              </p>
            ) : null}
            <p className="mt-3 text-xs leading-relaxed text-brand-muted dark:text-stone-400">
              Use at least 10 characters with at least one letter and one number. API:{" "}
              <code className="font-mono text-[11px]">{getApiBaseURL()}</code>
            </p>

            {error ? (
              <div className="mt-4 rounded-portal border border-brand-red/30 bg-red-50 p-3 text-sm text-brand-red dark:border-brand-red/40 dark:bg-red-950/50 dark:text-red-200">
                {error}
              </div>
            ) : null}

            <label className="mb-1.5 mt-4 block text-sm font-bold text-brand-black dark:text-stone-200">New password</label>
            <input
              className="mb-4 w-full rounded-portal border border-black/[0.1] bg-white px-3.5 py-3 text-sm outline-none dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <label className="mb-1.5 block text-sm font-bold text-brand-black dark:text-stone-200">Confirm password</label>
            <input
              className="mb-4 w-full rounded-portal border border-black/[0.1] bg-white px-3.5 py-3 text-sm outline-none dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />

            <label className="mb-6 flex cursor-pointer items-center gap-2 text-sm text-brand-black dark:text-stone-200">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-stone-400 text-brand-blue focus:ring-brand-blue dark:border-stone-500"
              />
              Remember me on this device (stay signed in longer)
            </label>

            <button type="submit" disabled={loading} className="btn-primary w-full">
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
