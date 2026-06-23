import { Navigate, Outlet, useLocation } from "react-router-dom";
import {
  getFacilityUniversityHomePath,
  isFacilityUniversityOnlyPortal,
  isPathAllowedForFacilityUniversityOnly,
} from "../../utils/facilityUniversityOnly";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import AppSidebar from "./AppSidebar";
import AppTopBar from "./AppTopBar";
import BottomBirdBand from "./BottomBirdBand";
import Footer from "./Footer";
import api from "../../services/api";
import PollPopupModal from "../PollPopupModal";
import { CelebrationProvider } from "../../context/CelebrationContext";

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
  }
}

function clearDismiss(userId, pollId) {
  try {
    localStorage.removeItem(pollDismissKey(userId, pollId));
  } catch {
  }
}

export default function AuthenticatedLayout({ darkMode, setDarkMode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const location = useLocation();

  if (isFacilityUniversityOnlyPortal(user)) {
    const home = getFacilityUniversityHomePath(user);
    if (home && !isPathAllowedForFacilityUniversityOnly(location.pathname)) {
      return <Navigate to={home} replace />;
    }
  }

  const [polls, setPolls] = useState([]);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollStartIndex, setPollStartIndex] = useState(0);

  const pollKey = useMemo(() => `${user?.id || ""}:${location.pathname}`, [user?.id, location.pathname]);

  const firstUndismissedIndex = (items) => {
    const idx = items.findIndex((p) => !isDismissed(user?.id, p.id));
    return idx >= 0 ? idx : 0;
  };

  useEffect(() => {
    let stale = false;

    const pull = () => {
      api
        .get("/polls/active")
        .then(({ data }) => {
          if (stale) return;
          const items = Array.isArray(data?.polls)
            ? data.polls
            : data?.poll
              ? [data.poll]
              : [];
          setPolls(items);
          setPollOpen((open) => {
            if (open) return open;
            const anyUndismissed = items.some((p) => !isDismissed(user?.id, p.id));
            if (anyUndismissed) {
              setPollStartIndex(firstUndismissedIndex(items));
              return true;
            }
            return false;
          });
        })
        .catch(() => {});
    };

    pull();

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
      if (polls.length > 0) {
        setPollStartIndex(0);
        setPollOpen(true);
        return;
      }
      api
        .get("/polls/active")
        .then(({ data }) => {
          const items = Array.isArray(data?.polls)
            ? data.polls
            : data?.poll
              ? [data.poll]
              : [];
          setPolls(items);
          if (items.length) {
            setPollStartIndex(0);
            setPollOpen(true);
          } else {
            window.alert("Nothing new right now.");
          }
        })
        .catch(() => {
          window.alert("Could not load What's New.");
        });
    };
    window.addEventListener("agc:whats-new", onWhatsNew);
    return () => window.removeEventListener("agc:whats-new", onWhatsNew);
  }, [polls]);

  return (
    <CelebrationProvider userId={user?.id}>
      <div className="agc-app-shell app-dashboard flex min-h-dvh w-full flex-col lg:flex-row">
        <AppSidebar />
        <div className="agc-main-column relative flex min-w-0 flex-1 flex-col">
          <AppTopBar darkMode={darkMode} setDarkMode={setDarkMode} />
          <div className="min-h-0 min-w-0 flex-1 pb-2 sm:pb-3">
            <Suspense fallback={null}>
              <Outlet />
            </Suspense>
          </div>
          <BottomBirdBand />
          <Footer />
        </div>

        <PollPopupModal
        polls={polls}
        startIndex={pollStartIndex}
        open={pollOpen}
        onDismiss={(pollId) => {
          if (pollId) dismiss(user?.id, pollId);
        }}
        onClose={(pollId) => {
          if (pollId) dismiss(user?.id, pollId);
          setPollOpen(false);
        }}
        onSubmitted={(pollId) => {
          if (pollId) clearDismiss(user?.id, pollId);
          setPolls((prev) => {
            const next = prev.filter((p) => p.id !== pollId);
            if (next.length === 0) setPollOpen(false);
            return next;
          });
        }}
        />
      </div>
    </CelebrationProvider>
  );
}
