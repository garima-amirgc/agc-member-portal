import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import { friendlyErrorMessage } from "../services/friendlyError";
import SummaryCards from "./teamTimeOff/SummaryCards";
import FilterBar from "./teamTimeOff/FilterBar";
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

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Team time off</h2>
        <div className="flex flex-wrap items-center gap-2">
          <FilterBar
            filters={filters}
            options={{ departments: board.filters?.departments, locations: board.filters?.locations, leaveTypes: board.filters?.leave_types }}
            onChange={setFilters}
          />
          <button
            type="button"
            onClick={runSync}
            disabled={syncing}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </div>
      {syncMessage ? <p className="text-xs text-slate-500 dark:text-slate-400">{syncMessage}</p> : null}

      {!board.adp_configured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          ADP isn't connected on this server yet, so time-off data can't be shown. Your roster is listed below once ADP is configured.
        </div>
      ) : board.balances_authorized === false ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          ADP is connected, but time-off data isn't fully available yet — ask your ADP admin to enable the Time Off
          Management module and add the <code>timeOffBalance.read</code> / <code>timeOffRequest.read</code> scopes
          (and their canonical URIs) to the portal's existing ADP connection.
        </div>
      ) : !board.synced_at ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          Time off hasn't synced from ADP yet — this runs automatically shortly after the server starts, and every
          couple of hours after that.
        </div>
      ) : board.requests_authorized === false ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          Vacation balances are up to date. Actual time-off dates (the calendar below, upcoming/away-today counts)
          aren't available yet — ask your ADP admin to add the <code>timeOffRequest.read</code> scope and its
          canonical URI to the portal's ADP connection.
        </div>
      ) : null}

      <SummaryCards summary={summary} />

      <VacationTable employees={filteredEmployees} onSelectEmployee={setDrawerEmployeeId} />

      <TeamCalendar key={filters.year} employees={filteredEmployees} syncWindow={board.sync_window} initialCursor={initialCursor} />

      <EmployeeDrawer employee={drawerEmployee} year={filters.year} onClose={() => setDrawerEmployeeId(null)} />
    </section>
  );
}
