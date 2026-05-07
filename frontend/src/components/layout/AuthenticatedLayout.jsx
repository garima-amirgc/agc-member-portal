import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import AppSidebar from "./AppSidebar";
import AppTopBar from "./AppTopBar";
import BottomBirdBand from "./BottomBirdBand";
import Footer from "./Footer";
import api from "../../services/api";
import PollPopupModal from "../PollPopupModal";

function pollDismissKey(userId, pollId) {
  return `AGC_POLL_DISMISSED:${String(userId || "")}:${String(pollId || "")}`;
}

function isDismissed(userId, pollId) {
  try {
    return Boolean(localStorage.getItem(pollDismissKey(userId, pollId)));
  } catch {
    return false;
  }
}

function dismiss(userId, pollId) {
  try {
    localStorage.setItem(pollDismissKey(userId, pollId), new Date().toISOString());
  } catch {
    /* ignore */
  }
}

function clearDismiss(userId, pollId) {
  try {
    localStorage.removeItem(pollDismissKey(userId, pollId));
  } catch {
    /* ignore */
  }
}

export default function AuthenticatedLayout({ darkMode, setDarkMode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const location = useLocation();

  const [poll, setPoll] = useState(null);
  const [pollOpen, setPollOpen] = useState(false);

  const pollKey = useMemo(() => `${user?.id || ""}:${location.pathname}`, [user?.id, location.pathname]);

  useEffect(() => {
    let stale = false;

    const pull = () => {
      api
        .get("/polls/active")
        .then(({ data }) => {
          if (stale) return;
          const p = data?.poll || null;
          setPoll(p);
          // Auto-open only once per poll per user (until submitted); "Later" dismisses auto-open.
          const dismissed = p ? isDismissed(user?.id, p.id) : false;
          setPollOpen((open) => (open ? open : Boolean(p && !dismissed)));
        })
        .catch(() => {});
    };

    // Refresh on navigation so newly activated polls appear without logout/login.
    pull();

    // Also refresh once when user returns to tab.
    let debounce = null;
    let tabWasHidden = false;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        tabWasHidden = true;
        return;
      }
      if (document.visibilityState !== "visible" || !tabWasHidden) return;
      tabWasHidden = false;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(pull, 350);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stale = true;
      document.removeEventListener("visibilitychange", onVis);
      if (debounce) clearTimeout(debounce);
    };
  }, [pollKey]);

  useEffect(() => {
    const onWhatsNew = () => {
      // If we already have an active (unsubmitted) poll in state, open it even if previously dismissed.
      if (poll) {
        setPollOpen(true);
        return;
      }
      // Otherwise, fetch; if there's something active, open it.
      api
        .get("/polls/active")
        .then(({ data }) => {
          const p = data?.poll || null;
          setPoll(p);
          if (p) setPollOpen(true);
          else window.alert("Nothing new right now.");
        })
        .catch(() => {
          window.alert("Could not load What's New.");
        });
    };
    window.addEventListener("agc:whats-new", onWhatsNew);
    return () => window.removeEventListener("agc:whats-new", onWhatsNew);
  }, [poll, user?.id]);

  return (
    <div className="agc-app-shell app-dashboard flex min-h-dvh w-full flex-col lg:flex-row">
      <AppSidebar />
      <div className="agc-main-column relative flex min-w-0 flex-1 flex-col">
        <AppTopBar darkMode={darkMode} setDarkMode={setDarkMode} />
        <div className="min-h-0 min-w-0 flex-1 pb-6">
          <Outlet />
        </div>
        <BottomBirdBand />
        <Footer />
      </div>

      <PollPopupModal
        poll={poll}
        open={pollOpen}
        onClose={() => {
          if (poll) dismiss(user?.id, poll.id);
          setPollOpen(false);
        }}
        onSubmitted={() => {
          if (poll) clearDismiss(user?.id, poll.id);
          setPoll(null);
          setPollOpen(false);
        }}
      />
    </div>
  );
}
