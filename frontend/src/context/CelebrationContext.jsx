import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import BirthdayPopupModal from "../components/BirthdayPopupModal";
import {
  markAnniversaryAutoDismissed,
  markBirthdayAutoDismissed,
  wasAnniversaryAutoDismissed,
  wasBirthdayAutoDismissed,
} from "../utils/celebrationStorage";

const CelebrationContext = createContext(null);

function buildTodayCelebrations(feed) {
  const birthdays = (Array.isArray(feed?.today) ? feed.today : []).map((b) => ({
    ...b,
    celebrationKind: "birthday",
  }));
  const anniversaries = (Array.isArray(feed?.anniversaries_today) ? feed.anniversaries_today : []).map((a) => ({
    ...a,
    celebrationKind: "anniversary",
  }));
  return { birthdays, anniversaries, all: [...birthdays, ...anniversaries] };
}

export function CelebrationProvider({ children, userId }) {
  const [feed, setFeed] = useState({ today: [], anniversaries_today: [] });
  const [person, setPerson] = useState(null);
  const autoOpenedKindRef = useRef(null);
  const feedReadyRef = useRef(false);
  const initialAutoAttemptedRef = useRef(false);
  const pendingAnniversaryAfterBirthdayRef = useRef(false);

  const { birthdays, anniversaries, all: todayCelebrations } = useMemo(
    () => buildTodayCelebrations(feed),
    [feed]
  );

  const loadFeed = useCallback(() => {
    feedReadyRef.current = false;
    return api
      .get("/birthdays/feed", { params: { days: 14 } })
      .then(({ data }) => {
        const d = data || {};
        setFeed({
          today: Array.isArray(d.today) ? d.today : [],
          anniversaries_today: Array.isArray(d.anniversaries_today) ? d.anniversaries_today : [],
        });
        feedReadyRef.current = true;
      })
      .catch(() => {
        setFeed({ today: [], anniversaries_today: [] });
        feedReadyRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (!userId) return;
    initialAutoAttemptedRef.current = false;
    pendingAnniversaryAfterBirthdayRef.current = false;
    loadFeed();
  }, [userId, loadFeed]);

  const openCelebration = useCallback((item) => {
    if (!item) return;
    autoOpenedKindRef.current = null;
    setPerson(item);
  }, []);

  const tryAutoOpenAnniversary = useCallback(() => {
    if (anniversaries.length === 0 || wasAnniversaryAutoDismissed()) return false;
    setPerson(anniversaries[0]);
    autoOpenedKindRef.current = "anniversary";
    return true;
  }, [anniversaries]);

  const tryAutoOpenBirthday = useCallback(() => {
    if (birthdays.length === 0 || wasBirthdayAutoDismissed()) return false;
    setPerson(birthdays[0]);
    autoOpenedKindRef.current = "birthday";
    if (anniversaries.length > 0 && !wasAnniversaryAutoDismissed()) {
      pendingAnniversaryAfterBirthdayRef.current = true;
    }
    return true;
  }, [birthdays, anniversaries]);

  const runInitialAutoOpen = useCallback(() => {
    if (initialAutoAttemptedRef.current || !feedReadyRef.current) return;
    initialAutoAttemptedRef.current = true;

    if (tryAutoOpenBirthday()) return;
    tryAutoOpenAnniversary();
  }, [tryAutoOpenBirthday, tryAutoOpenAnniversary]);

  useEffect(() => {
    if (!userId || !feedReadyRef.current) return;
    if (todayCelebrations.length === 0) return;

    const t = window.setTimeout(runInitialAutoOpen, 900);
    return () => window.clearTimeout(t);
  }, [userId, todayCelebrations, feed.today, feed.anniversaries_today, runInitialAutoOpen]);

  const closeCelebration = useCallback(() => {
    const kind = autoOpenedKindRef.current;
    if (kind === "birthday") {
      markBirthdayAutoDismissed();
    } else if (kind === "anniversary") {
      markAnniversaryAutoDismissed();
    }
    autoOpenedKindRef.current = null;
    setPerson(null);

    if (pendingAnniversaryAfterBirthdayRef.current && kind === "birthday") {
      pendingAnniversaryAfterBirthdayRef.current = false;
      if (!wasAnniversaryAutoDismissed() && anniversaries.length > 0) {
        window.setTimeout(() => {
          setPerson(anniversaries[0]);
          autoOpenedKindRef.current = "anniversary";
        }, 400);
      }
    }
  }, [anniversaries]);

  const value = useMemo(
    () => ({
      feed,
      todayCelebrations,
      birthdaysToday: birthdays,
      anniversariesToday: anniversaries,
      loadFeed,
      openCelebration,
    }),
    [feed, todayCelebrations, birthdays, anniversaries, loadFeed, openCelebration]
  );

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      <BirthdayPopupModal
        open={Boolean(person)}
        onClose={closeCelebration}
        person={person}
        celebrationKind={person?.celebrationKind || "birthday"}
      />
    </CelebrationContext.Provider>
  );
}

export function useCelebration() {
  const ctx = useContext(CelebrationContext);
  if (!ctx) {
    throw new Error("useCelebration must be used within CelebrationProvider");
  }
  return ctx;
}

export function useCelebrationOptional() {
  return useContext(CelebrationContext);
}
