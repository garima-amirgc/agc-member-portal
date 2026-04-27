import axios from "axios";
import { getApiBaseURL } from "./api";

/**
 * Convert API / network errors into a user-friendly message.
 * Keep it safe (no sensitive details) and actionable.
 */
export function friendlyErrorMessage(err, fallback = "Something went wrong.") {
  try {
    // Non-Axios / unknown error
    if (!axios.isAxiosError(err)) {
      if (err && typeof err === "object" && "message" in err && typeof err.message === "string") return err.message;
      return fallback;
    }

    const status = err.response?.status;
    const data = err.response?.data || {};
    const code = data?.code;

    // Network / CORS / offline / DNS
    if (!err.response) {
      return `Cannot reach server at ${getApiBaseURL()}. Please check your connection and try again.`;
    }

    if (status === 401) {
      return "Your session has expired or you are not signed in. Please sign in and try again.";
    }

    if (status === 403) {
      if (code === "INVITE_PENDING") {
        return (
          data?.message ||
          "This account still needs a password. Use your invite email, or use Forgot password to resend the setup link."
        );
      }
      if (code === "INVITE_EXPIRED") {
        return data?.message || "Your setup link has expired. Ask an administrator to send a new invite.";
      }
      return (
        data?.message ||
        "You don’t have access to this page yet. If you think this is a mistake, please contact an administrator."
      );
    }

    if (status === 404) return data?.message || "Not found.";
    if (status === 429) return data?.message || "Too many requests. Please wait a moment and try again.";
    if (status >= 500) return data?.message || "Server error. Please try again in a moment.";

    return data?.message || fallback;
  } catch {
    return fallback;
  }
}

