import { useEffect, useMemo, useState } from "react";
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

  const [filters, setFilters] = useState({ query: "", department: "", location: "", leaveType: "", year: CURRENT_YEAR });
  const [drawerEmployeeId, setDrawerEmployeeId] = useState(null);

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
  }, []);

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
        <FilterBar
          filters={filters}
          options={{ departments: board.filters?.departments, locations: board.filters?.locations, leaveTypes: board.filters?.leave_types }}
          onChange={setFilters}
        />
      </div>

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
