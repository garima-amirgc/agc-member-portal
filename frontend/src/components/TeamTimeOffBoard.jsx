import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import SummaryCards from "./teamTimeOff/SummaryCards";
import FilterBar from "./teamTimeOff/FilterBar";
import NewRequestsPanel from "./teamTimeOff/NewRequestsPanel";
import VacationTable from "./teamTimeOff/VacationTable";
import TeamCalendar from "./teamTimeOff/TeamCalendar";
import EmployeeDrawer from "./teamTimeOff/EmployeeDrawer";
import { todayIso } from "./teamTimeOff/timeOffShared";

const CURRENT_YEAR = String(new Date().getFullYear());

function employeeMatchesFilters(e, f) {
  if (f.query && !e.name.toLowerCase().includes(f.query.toLowerCase())) return false;
  if (f.department && e.department !== f.department) return false;
  if (f.location && e.location !== f.location) return false;
  return true;
}

function filterEntries(entries, leaveType) {
  if (!leaveType) return entries || [];
  return (entries || []).filter((t) => (t.policy_name || t.policy_code) === leaveType);
}

function SyncIcon({ spinning }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.183m0-4.991v4.99"
      />
    </svg>
  );
}

export default function TeamTimeOffBoard() {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const [filters, setFilters] = useState({ query: "", department: "", location: "", leaveType: "", year: CURRENT_YEAR });
  const [drawerEmployeeId, setDrawerEmployeeId] = useState(null);

  const unmountedRef = useRef(false);
  const pollTimeoutRef = useRef(null);

  const loadBoard = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/manager-time-off");
      setBoard(data);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not load team time off."));
      setBoard(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoard();
    return () => {
      unmountedRef.current = true;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  // Checks back every 15s (up to ~10 min) for the sync this component
  // itself kicked off to land, instead of blocking on one long request.
  const pollForSync = (priorSyncedAt, attempt) => {
    const MAX_ATTEMPTS = 40;
    pollTimeoutRef.current = setTimeout(async () => {
      if (unmountedRef.current) return;
      try {
        const { data } = await api.get("/manager-time-off");
        if (unmountedRef.current) return;
        if (data?.synced_at && data.synced_at !== priorSyncedAt) {
          setBoard(data);
          setSyncMessage("Synced just now.");
          setSyncing(false);
          return;
        }
      } catch {
        // Transient errors while polling aren't worth surfacing — just keep trying.
      }
      if (attempt + 1 >= MAX_ATTEMPTS) {
        setSyncMessage("Still syncing in the background — refresh in a bit to see the latest.");
        setSyncing(false);
        return;
      }
      pollForSync(priorSyncedAt, attempt + 1);
    }, 15000);
  };

  // Pulls fresh data from ADP right now instead of waiting for the next
  // scheduled sync (every couple hours) — handy right after ADP access
  // (a new scope, a newly-linked employee, etc.) actually goes live.
  //
  // The backend kicks the sync off in the background and responds right
  // away instead of making this request wait — one full sync round-trips
  // ADP once per linked employee and has been observed to take minutes
  // for a company this size, long enough to risk a platform request
  // timeout in production. So this polls the board every 15s until
  // `synced_at` moves past what it was before this sync started, rather
  // than waiting on one long request.
  const runSync = async () => {
    setSyncing(true);
    setSyncMessage("");
    const priorSyncedAt = board?.synced_at || null;
    try {
      const { data } = await api.post("/manager-time-off/sync");
      setSyncMessage(
        data?.already_running
          ? "A sync is already in progress — this can take a few minutes for a larger team."
          : "Syncing in the background — this can take a few minutes for a larger team…"
      );
      pollForSync(priorSyncedAt, 0);
    } catch (e) {
      setSyncMessage(friendlyErrorMessage(e, "Sync failed — try again in a moment."));
      setSyncing(false);
    }
  };

  const boardEmployees = board?.employees || [];
  const filteredEmployees = useMemo(
    () =>
      boardEmployees
        .filter((e) => employeeMatchesFilters(e, filters))
        .map((e) => ({ ...e, time_off: filterEntries(e.time_off, filters.leaveType) })),
    [boardEmployees, filters]
  );

  const summary = useMemo(() => {
    const today = todayIso();
    let away = 0;
    let upcoming = 0;
    let vacUsed = null;
    let vacRemaining = null;
    for (const e of filteredEmployees) {
      if (e.is_away_today) away++;
      upcoming += (e.time_off || []).filter((r) => r.start_date > today).length;
      if (e.vacation_balance) {
        if (e.vacation_balance.used != null) vacUsed = (vacUsed ?? 0) + e.vacation_balance.used;
        if (e.vacation_balance.available != null) vacRemaining = (vacRemaining ?? 0) + e.vacation_balance.available;
      }
    }
    return { team_size: filteredEmployees.length, away_today: away, upcoming, vacation_used_ytd: vacUsed, vacation_remaining: vacRemaining };
  }, [filteredEmployees]);

  const drawerEmployee = boardEmployees.find((e) => e.id === drawerEmployeeId) || null;
  const initialCursor = filters.year === CURRENT_YEAR ? todayIso() : `${filters.year}-01-01`;

  if (loading) {
    return <div className="card p-4 text-sm text-slate-500 dark:text-slate-400">Loading team time off…</div>;
  }
  if (error) {
    return <div className="rounded bg-rose-100 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>;
  }
  if (!board) return null;

  const hasBanner =
    !board.adp_configured || board.balances_authorized === false || !board.synced_at || board.requests_authorized === false;

  return (
    <section className="space-y-6">
      <div className="card no-title-underline overflow-hidden p-0 shadow-lg ring-1 ring-[rgba(11,62,175,0.08)] dark:ring-[rgba(167,211,68,0.12)]">
        {/* Header — mirrors the IT Ticket board's gradient hero treatment.
            Title sits on its own line and the controls get a full-width row
            below (rather than squeezed to the right of the title) so the
            filters wrap cleanly instead of bunching up with a big gap next
            to the heading. `it-ticket-board-header` is the same hook the IT
            Ticket board uses to force its <h2> white — agc-brand.css's
            `.app-dashboard h2` rule otherwise wins over Tailwind's
            `text-white` on specificity and renders it dark navy. */}
        <div className="relative border-b border-[#082d82]/30 bg-gradient-to-r from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4] px-5 py-5 text-white sm:px-6 sm:py-6">
          <div className="it-ticket-board-header min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl">Team time off</h2>
            <p className="mt-1 text-xs text-white/75">Vacation balances and time off, synced from ADP Workforce Now.</p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/15 pt-4">
            <FilterBar
              filters={filters}
              options={{ departments: board.filters?.departments, locations: board.filters?.locations, leaveTypes: board.filters?.leave_types }}
              onChange={setFilters}
            />
            <button
              type="button"
              onClick={runSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-white/40 bg-white/15 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-white/25 disabled:opacity-60"
            >
              <SyncIcon spinning={syncing} />
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>

          {syncMessage ? <p className="mt-3 text-xs text-white/85">{syncMessage}</p> : null}
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          {hasBanner ? (
            <>
              {!board.adp_configured ? (
                <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  ADP isn't connected on this server yet, so time-off data can't be shown. Your roster is listed below once ADP is configured.
                </div>
              ) : board.balances_authorized === false ? (
                <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  ADP is connected, but time-off data isn't fully available yet — ask your ADP admin to enable the Time Off
                  Management module and add the <code>timeOffBalance.read</code> / <code>timeOffRequest.read</code> scopes
                  (and their canonical URIs) to the portal's existing ADP connection.
                </div>
              ) : !board.synced_at ? (
                <div className="rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                  Time off hasn't synced from ADP yet — this runs automatically shortly after the server starts, and every
                  couple of hours after that.
                </div>
              ) : board.requests_authorized === false ? (
                <div className="rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                  Vacation balances are up to date. Actual time-off dates (the calendar below, upcoming/away-today counts)
                  aren't available yet — ask your ADP admin to add the <code>timeOffRequest.read</code> scope and its
                  canonical URI to the portal's ADP connection.
                </div>
              ) : null}
            </>
          ) : null}

          <SummaryCards summary={summary} />
        </div>
      </div>

      <NewRequestsPanel />

      <VacationTable employees={filteredEmployees} onSelectEmployee={setDrawerEmployeeId} />

      <TeamCalendar key={filters.year} employees={filteredEmployees} syncWindow={board.sync_window} initialCursor={initialCursor} />

      <EmployeeDrawer employee={drawerEmployee} year={filters.year} onClose={() => setDrawerEmployeeId(null)} />
    </section>
  );
}
