# Project Notes — AGC University

Running notes on in-progress features, decisions, and open questions that don't
belong in `AGENTS.md` (which is the general architecture/onboarding doc). This
file is meant to survive across chat sessions with Claude — since conversation
memory does NOT carry over between sessions, read this file at the start of
any session that touches a feature listed below before assuming nothing exists.

**How to use this file (for Claude or any other assistant):**
- Before starting work on a feature, check if it already has a section here.
- After a meaningful change or decision, update the relevant section.
- Keep entries short and factual — this is a map, not a changelog.

---

## Vacation / Time-Off

**Status as of 2026-09-14: BOTH systems are now live in the UI, side by side, on purpose (see
"Open decision" — Garima picked option 2/3, a hybrid).**

Garima's own words on what she needed: "i want to build a board for the manager so they can
see who has applied for the vacation. vacations are not overlapping and who has comsumed how
much vacation they have" — and specifically, on "applied": "if employee applies for a vacation
manager should be able to see that someone has applied for the vacation." ADP's API has no
concept of "pending" (it only ever returns already-approved time off — see
`adpTimeOff.service.js`), so that last part can only come from the in-portal request flow.
That's why both systems are wired in now instead of just one.

### What's actually live today

- **`TeamTimeOffBoard`** (`frontend/src/components/TeamTimeOffBoard.jsx`) is now
  rendered in TWO places: the orphaned `ManagerDashboardPage.jsx` (route `/manager`,
  still not linked from any nav — see "smaller known items" below) AND, as of
  2026-09-14, on **`TeamPage.jsx`** (route `/team`, the "Team" nav item everyone
  already has), gated by `showSupervisorTools` (`isSupervisor(user)` —
  `user.has_direct_reports`). This was done specifically so managers can actually
  find it without knowing a hidden URL — Garima asked for it to show "for managers
  only under teams."
- Also added 2026-09-14: a **"Sync now" button** on the board (next to the filter
  bar) that calls `POST /manager-time-off/sync` and reloads — lets a manager pull
  fresh ADP data immediately instead of waiting for the background schedule.
  Useful right after an ADP-side config change (like a newly granted scope).
- It's **read-only**, sourced from a one-way ADP sync (ADP → portal only, nothing
  writes back to ADP). No submit/approve workflow — managers see their direct
  reports' balances (Earned / Taken / Scheduled / Available) and approved time-off
  entries.
- Garima confirmed on 2026-09-14 that ADP has now enabled the vacation/time-off
  API on their end. The `authorized`/`requests_authorized` flags in
  `managerTimeOff.service.js` are fully dynamic (driven by the last sync's actual
  ADP response codes — 401/403/404 = not authorized), so no code change was needed
  for the data itself to start flowing once ADP's grant is live — it just needed a
  fresh sync (the new "Sync now" button) or the next scheduled one (every
  `ADP_TIME_OFF_SYNC_INTERVAL_HOURS`, default 2h) to pick it up. **Still needs
  confirming in the live app** that the "Actual time-off dates... aren't available
  yet" banner actually clears after a sync — if it doesn't, the ADP-side scope
  grant may not include the canonical URI registration the code's comments call
  out (see `adpTimeOff.service.js` header comment for the exact CAR scope paths).
- ADP sync: `backend/src/services/adpTimeOffSync.service.js` runs on a schedule
  (first run 45s after boot, then every `ADP_TIME_OFF_SYNC_INTERVAL_HOURS`, default
  2h). Pulls balances (full replace) + a rolling window of requests (90 days back /
  180 ahead) for every user with `adp_associate_oid` set.
- `POST /manager-time-off/sync` lets **any manager** force a full company-wide
  resync — route comment admits it's "mainly here for testing while ADP access is
  being set up." **Should probably be restricted before considering this done.**
- DB tables (Postgres; SQLite mirrors): `adp_time_off_balances`
  (user_id, policy_code, policy_name, entitlement, carried_over, used, scheduled,
  available, synced_at), `adp_time_off_requests` (user_id, adp_request_id,
  policy_code, start_date, end_date, hours, status, synced_at).

### The in-portal request/approval flow — REVIVED 2026-09-14

This was previously dead code (backend live, no frontend caller). It's now wired in:

- **Employee side**: `LeaveRequestPanel` (`frontend/src/components/LeaveRequestPanel.jsx`)
  is now embedded on `ProfilePage.jsx`, in a "Vacation requests" card right below the
  main profile-details card. Any employee with a manager assigned can submit a
  start/end date + optional reason there, and see their own request history
  (pending/approved/rejected) below the form.
  - Rewired internally to call the clean REST endpoints via the shared `api`
    (axios) client — `GET /leave-requests/me` and `POST /leave-requests` — instead
    of the old `leaveClient.js` multi-URL-guessing fetch wrapper it used before.
    Both old (`/auth/leave-request` etc., in `server.js`) and new
    (`/leave-requests`, in `leave-requests.routes.js`) endpoints are still live and
    hit the same `leaveRequests.service.js` / `leave_requests` table, so nothing
    else changed backend-wise.
- **Manager side**: new component `frontend/src/components/teamTimeOff/TeamLeaveRequests.jsx`,
  mounted on `TeamPage.jsx` right below `TeamTimeOffBoard` (same
  `showSupervisorTools` gate). It has two parts:
  1. A **pending-requests list** with Approve/Reject buttons — calls
     `PATCH /leave-requests/:id` with `{status}`. Built by flattening
     `leave_requests` off of the `team` array TeamPage already loads (each
     employee object from `getTeamOverview()` already carries its own
     `leave_requests`), so no new API call was needed for this list.
  2. The existing `ManagerLeaveCalendar` component (unchanged), fed the same
     `team` array — shows a month calendar with pending (amber, "?") and
     approved (green) portal requests.
  - Approve/Reject calls `onDecided` (wired to TeamPage's existing `reloadTeam()`)
    to refresh the `team` state afterward.
- **This is intentionally a separate system from the ADP-synced `TeamTimeOffBoard`
  above it** — nothing here writes to ADP, and nothing from here is synced from
  ADP. It exists specifically to cover the one thing ADP's API cannot: showing a
  request the moment someone applies, before it's been decided. Whoever manages
  ADP still needs to separately enter approved leave there if it should show up
  in ADP's own systems (payroll, official balances, etc.) — **the two don't
  reconcile with each other automatically.** Flagged this to Garima; she chose to
  go ahead knowing that.

### Open decision — RESOLVED 2026-09-14

Garima chose **option 2/3 (hybrid)**: keep the ADP-synced board as the source of
truth for balances/approved-history, and revive the in-portal request/approval
flow specifically so "who has applied" is visible before ADP could ever show it.
See the section above for what was built. Not chosen: deleting the legacy code
(option 1) — it's now back in active use, not dead.

### Drawer performance + a real "authorized" bug — fixed 2026-09-15

Garima's ADP contact enabled `timeOffRequest.read` on 2026-09-14, but the board
still showed no balances/history for her test employee, and she separately
asked to "cache this data so it doesn't take too much time to load." Both
turned out to trace back to the same two things in
`backend/src/services/managerTimeOff.service.js`:

1. **`getEmployeeYearHistory` (the Employee Drawer's history) called ADP
   live, every time, chunked across a full year** — up to 9 separate round
   trips per drawer open, since ADP caps one request-off call at 6 weeks.
   That's the slowness. Rewrote it to read the same synced
   `adp_time_off_requests` table the main board already uses (populated by
   `adpTimeOffSync.service.js` on its 2h schedule / "Sync now"), so opening
   the drawer is now a plain DB read — no live ADP call at all. Trade-off:
   a year outside the sync window (`RECENT_PAST_DAYS`=90 back /
   `UPCOMING_DAYS`=180 ahead) won't have data until that window is synced;
   the drawer now shows a small notice when that's the case, same idea as
   the board calendar's existing "outside synced range" banner.
2. **Real bug**: `getTeamTimeOff`'s per-employee `authorized` field was
   hardcoded `true` regardless of the actual sync result — so the UI could
   never distinguish "ADP hasn't authorized this yet" from "authorized, but
   this employee genuinely has no balance on file." Both looked identical
   (blank "—" / generic empty message). Fixed to use the real
   `balancesAuthorized && requestsAuthorized` from the last sync (this is
   an app-wide ADP scope, not something that varies per employee, so every
   linked employee correctly shares the same authorized state). The drawer
   and `VacationTable`'s existing "ADP access pending" per-row note now
   actually fire when they should.

Net effect: if balances/history still don't show up after this, it's a real
signal worth checking — either no sync has run since the scope was granted
(click **Sync now** and watch for the `[ADP Time Off Sync] Done — X/Y
synced (...)` line in the backend console — it breaks out
`balancesUnauthorized`/`requestsUnauthorized` counts explicitly), or the
specific employee genuinely has no time-off policy assigned in ADP (a data
issue on ADP's side, not a portal bug — see the email draft that flagged
this for one test employee, Jayaraj Govindan).

### Confirmed 2026-09-15: ADP has the scope but not the canonical URI for time-off requests

A "Sync now" run Garima captured from her backend console showed the smoking
gun directly: `"message": "Canonical URI Not Found"` on every one of 40
requests, while balances came back `0 on balances` unauthorized (i.e. fully
working). This is the exact scope-vs-canonical-URI distinction flagged when
this was first researched (see the ADP scope confirmation work earlier in
this file) — her ADP contact appears to have enabled the `timeOffRequest.read`
**scope** but not registered its **canonical URI**
(`/time/timeLaborManagement/timeOffManagement/timeOffRequestManagement/timeOffRequest.read`)
in the app's CAR entry. Not a code issue — needs a specific follow-up with
ADP naming the canonical URI, not just the scope.

### "Sync now" made non-blocking — 2026-09-15

The same console log showed the sync itself took 180.9s for 40 employees.
`POST /manager-time-off/sync` used to `await` the full sync before
responding, so clicking "Sync now" meant a ~3 minute blocking request —
felt broken, and risked hitting a platform request timeout in production
(Render et al.) as headcount grows past what fits in that window.

Changed to fire-and-forget: the route now kicks off
`adpTimeOffSync.runFullTimeOffSync()` without awaiting it and responds
immediately with `{ started, already_running }`
(`adpTimeOffSync.isSyncRunning()` is a new export used for this). The
frontend (`TeamTimeOffBoard.jsx`) now polls `GET /manager-time-off` every
15s (up to ~10 min) until `synced_at` moves past what it was before the
click, then swaps in the fresh board — so the button responds instantly and
the UI catches up once the sync actually finishes, instead of one long
request the browser/platform might just kill.

### Employee Drawer no longer calls ADP live — 2026-09-15
See the entry above ("Drawer performance + a real `authorized` bug") for
the `getEmployeeYearHistory` rewrite (now reads the synced table instead of
making up to 9 live ADP calls per open) and the `authorized` field that was
hardcoded `true` regardless of the real sync result.

### ManagerLeaveCalendar overlap highlighting — 2026-09-15
`frontend/src/components/ManagerLeaveCalendar.jsx` (the portal-based calendar,
independent of ADP) now has the same overlap highlighting as `TeamCalendar.jsx`:
a day cell is highlighted amber with a small "!" badge when 2+ team members have
a leave request (pending or approved) covering that day, plus a one-line legend
above the grid. `whoOnLeave()` already de-dupes to one entry per employee per
day, so `people.length >= 2` is the overlap check — no new helper needed. Built
in response to Garima's "yes, please" (approving this as the way to get overlap
detection working today, independent of the still-blocked ADP canonical-URI
issue below).

### Admin System Status page now shows real, company-wide ADP time-off data — 2026-09-15
Garima said "i haven't seen anything yet from api yet for vacation tracker" —
she'd only tested against her own 1 direct report (Jayaraj Govindan), who
likely just has no time-off policy assigned in ADP, which reads as "nothing is
working" even though the integration itself is fine for others. Rather than
trying to read her local `lms.sqlite` directly (it turned out to be ~131 days
stale — her `.env` sets `DATABASE_URL`, so the app is actually running
Postgres locally, not SQLite, meaning the on-disk sqlite file is unused and
not something Claude can read from the sandbox), the existing admin-only
System Status page (`/admin/system-status` → `AdminSystemStatusPage.jsx`,
backed by `GET /admin/metrics` in `admin.routes.js`) was extended with a new
"ADP time off sync" card so she can see it from inside her own authenticated
session:
- Counts: employees linked to ADP (`adp_associate_oid` set), balance rows
  synced, request rows synced.
- The last sync's stats (`adpTimeOffSync.getLastSyncStats()`) — synced/total,
  balances-unauthorized, requests-unauthorized, failed — plus `synced_at` and
  the rolling sync window.
- A table of up to 10 real, most-recently-synced balance rows (employee name,
  policy, entitlement/carried over/used/scheduled/available) pulled directly
  from `adp_time_off_balances` joined to `users`.

This is real data, not a mock — if the table is empty, it means no employee
in the whole company has a synced ADP balance row yet, which would point to
either nobody having a policy on record in ADP or the sync not having run,
not a portal bug.

### Per-employee "authorized" bug found while verifying real ADP data — fixed 2026-09-15
Right after the sections above, Garima tested against her live app and sent a
screenshot: the sync log showed `0 not yet authorized on balances, 40 on
requests` (balances scope fully authorized), yet the Team page's vacation
table showed her one test employee with an "ADP access pending" badge, and
his drawer said "ADP access for this employee's balances isn't available
yet" — both implying balances were blocked too. Traced it to
`managerTimeOff.service.js`: `getTeamTimeOff` computed `balancesAuthorized`
and `requestsAuthorized` separately (correct — they're independent ADP
scopes/canonical URIs), but only exposed a single combined `authorized =
balancesAuthorized && requestsAuthorized` on each employee object. Since
`timeOffRequest.read` is still blocked (canonical URI issue — see above),
that combined flag is false for every employee right now regardless of
whether *their* balances are fine, so anything gating on the per-employee
`authorized` field showed the wrong message. Fixed by adding
`balances_authorized`/`requests_authorized` to each employee object
(`baseEmployee()` too, defaulted `true`) and switching the two places that
only display balances — `VacationTable.jsx`'s "ADP access pending" badge and
`EmployeeDrawer.jsx`'s balance-card gate — to check `balances_authorized`
instead of the combined flag. The board-level banner in
`TeamTimeOffBoard.jsx` was already correct (it checks `board.balances_authorized`
/ `board.requests_authorized` separately) — only the per-employee flag had
this bug. `employee.authorized` (combined) is kept on the response for any
caller that wants "is everything fine" in one flag, but display code for a
balances-only section must use `balances_authorized`.

### Approved-only board confirmed as the spec, extensibility hook added — 2026-09-15
Garima shared a target architecture diagram (ADP Worker Profiles + Time Off
Requests + Time Off Balances → Vacation Tracker DB → Manager Vacation Board →
Calendar/Overlaps, Used/Remaining, Pending/Approved) and asked for a detailed
spec on top of it: match ADP worker ID to manager via Worker Profile data,
each manager sees only their own direct reports, show pending prominently,
refresh via scheduled sync or webhooks, read-only unless ADP supports
approve/reject.

Flagged one real conflict before building anything: ADP's Time Off Requests
API (`/time/v3/workers/{aoid}/time-offrequests`) is documented — and was
independently confirmed earlier in this project — to only ever return
already-approved requests. There is no pending/in-progress status it can
return, no matter how the sync is built. Asked Garima how to proceed; she
chose: build the approved-only board now (most of which already existed —
see below), don't expand the portal's own request workflow further for now,
and have a short email drafted to ADP support asking whether some other
endpoint, approval API, event notification, or webhook exposes pending
requests + assigned-approver info, so pending can be added later if ADP
confirms it's possible.

**What was already there, confirmed against the spec line by line:**
- Worker ID → manager matching: `adp_associate_oid` linked to each `users`
  row, matched to that employee's `manager_id`.
- Manager sees only own direct reports: `getTeamTimeOff` filters
  `WHERE manager_id = managerUserId`.
- Balances, vacation used, upcoming absences: `VacationTable.jsx` +
  `SummaryCards.jsx` (Vacation used / Vacation remaining / Upcoming stats).
- Overlaps: `TeamCalendar.jsx`'s amber highlighting (added 2026-09-14).
- Read-only: only a `timeOffBalance.read`/`timeOffRequest.read` scope is
  registered in ADP's CAR — no write/approve scope exists for our app to
  call even if we wanted to.
- Refresh: scheduled sync every `ADP_TIME_OFF_SYNC_INTERVAL_HOURS` (default
  2h) + manual non-blocking "Sync now" button.
- Webhooks: not implemented, and not confirmed whether ADP's Time Off
  Management module offers them — this is one of the questions going to
  ADP support (see email below).

**What was actually added — approved-only filter + extensibility hook,**
`backend/src/services/adpTimeOffNormalize.js`: new `isApprovedStatus(status)`
— a *denylist* (pending/requested/submitted/cancelled/denied/rejected/
withdrawn/revoked → not approved), not an allowlist, specifically because no
real request row has ever synced yet (`timeOffRequest.read` is still
blocked on the canonical-URI issue), so ADP's exact "approved" status
codeValue for this account is unknown — asserting `status === "Approved"`
risked silently hiding real approved requests if the true string differs.
Wired into `managerTimeOff.service.js` at both read points (`getTeamTimeOff`
and `getEmployeeYearHistory`) so only approved-status requests ever reach
the board or drawer. Today this is a no-op (ADP only ever sends approved
requests), but if ADP does start returning other statuses before a
dedicated "pending" section/badge exists to show them properly, they'll be
correctly excluded instead of being mistaken for approved. Sync itself
(`adpTimeOffSync.service.js`) is intentionally UNCHANGED — it still stores
every request ADP returns, whatever its status, with no filtering at write
time. That's the actual "designed for later" part: if ADP confirms pending
access down the line, the raw data will already be captured in
`adp_time_off_requests` with its real status; adding pending support then
is just loosening this read-time filter and building the display for it —
no resync needed.

**ADP follow-up email drafted** (not sent — Garima sends these herself):
see below. Asks about an alternate endpoint/approval API/event notification/
webhook for pending time-off requests, and assigned-approver details.

### Real ADP payload shapes confirmed — the requests endpoint was wrong — 2026-09-21

ADP confirmed both canonical URIs are registered and sent real sample
responses for a live worker (`G3MH5624G9EWJXCZ`) from both endpoints, plus
links to ADP's own "Time Off Balances/Request API Guide for ADP Workforce
Now" PDFs. This surfaced something bigger than expected: **the requests
endpoint this app was calling was never the one ADP registered a canonical
URI for.**

- **Wrong endpoint, not just a missing scope.** `adpTimeOff.service.js` was
  calling `/time/v3/workers/{aoid}/time-offrequests?$filter=...` (a v3
  endpoint, chunked into 6-week windows to work around what was believed to
  be ADP's request-date-range cap). ADP's real sample and the two
  registered canonical URIs both point at
  `/time/v2/workers/{aoid}/time-off-details/time-off-requests` — a
  completely different endpoint, matching the balances endpoint's own
  style. This is almost certainly the real reason every sync kept hitting
  "Canonical URI Not Found" on the requests side even after
  `timeOffRequest.read` was enabled — the scope was fine, but the CAR entry
  was never registered for the endpoint the code was actually calling.
  Fixed by switching to the confirmed v2 endpoint.
- **No date filter exists on either endpoint** — confirmed by fetching
  ADP's own API guide PDFs, not just the sample. The requests endpoint
  applies its own fixed window automatically: "the last 90 days" plus,
  per the guide's FAQ, "requests that were made two years in the future."
  All the 6-week windowing/chunking logic in `adpTimeOffSync.service.js`
  (`windowChunks`, `MAX_WINDOW_DAYS`, per-employee chunked
  `Promise.all`) is gone — one plain `GET` per employee now returns
  everything ADP is willing to give. `syncWindow()`'s `UPCOMING_DAYS`
  constant was widened from 180 to 730 to match ADP's real 2-year forward
  window (used only for the UI's "is this year fully covered by the last
  sync" messaging, not sent to any API call).
- **Both response shapes were guessed wrong before any real data had ever
  synced**, and the real shapes are meaningfully different —
  `adpTimeOffNormalize.js` was rewritten field-by-field against ADP's
  actual sample JSON (not docs, not guesses):
  - Balances: real path is
    `paidTimeOffDetails.paidTimeOffBalances[].paidTimeOffPolicyBalances[]`,
    each with `paidTimeOffPolicy.{code,labelName}` and a `policyBalances[]`
    array of `{ balanceType.code, totalQuantity.valueNumber }`. Confirmed
    real `balanceType.code` values: `available`, `taken`, `scheduled`,
    `earned`, `carryover`, `transferred`, `futureEarned`, `unlimited` (an
    "as required" unpaid-leave-style policy with no quantity at all).
    `normalizeBalanceGroup` now matches these exactly instead of guessing
    at substrings. **`taken` and `scheduled` come back as negative numbers**
    from ADP (e.g. `-25.0`) — now `Math.abs()`'d so "Used"/"Scheduled"
    display as positive day counts like every other figure.
  - Requests: real path is `paidTimeOffDetails.paidTimeOffRequests[]` →
    `.paidTimeOffRequestEntries[]` → `.requests[]` →
    `.paidTimeOffEntries[]`. **One ADP request can cover several
    non-contiguous days** — a real sample request
    (`9202086331451_26`) covered 16 separate dates spread across three
    weeks under one `requestID`, not one continuous range. Syncing at the
    whole-request level (the old assumption) would have forced collapsing
    those into one 2026-09-04→2026-09-28 row, which would make the
    calendar wrongly show the employee on leave every day in between,
    including days they're not actually off. Fixed by syncing at the
    individual-entry level instead — `extractRequestItems()` flattens the
    response down to one `{req, entry}` pair per day/period, each with its
    own `paidTimeOffID` and its own single date, so multi-day and
    non-contiguous requests both stay accurate on the calendar. No DB
    schema change was needed — `adp_time_off_requests` already stores one
    row per synced item with its own start/end date; it just needed
    entry-level items instead of whole-request items.
  - Status codes: the real sample uses lowercase words
    (`requestStatus.code: "approved"`), but ADP's own PDF guide documents
    single-letter codes for the same field (A/P/D/I/C). Since the two
    disagree, `isApprovedStatus`'s denylist (see the 2026-09-15 entry
    above) now includes both conventions (`pending`/`denied`/... and
    `p`/`d`/`i`/`c`) rather than trusting one.
- Verified all of the above against ADP's real sample JSON with a throwaway
  test script before shipping (balance figures matched exactly — e.g. the
  sample's Vacation policy: 25 earned, 17 carried over, 25 used, 5
  scheduled, 12 available; the 16-entry multi-day request correctly
  produced 16 separate single-day rows, not one collapsed range).

### Smaller known items
- Restrict `POST /manager-time-off/sync` — currently any manager can trigger a
  company-wide resync (still true after the non-blocking change above — it's
  cheap to kick off now, but still worth restricting to admins/HR eventually).
- `adpTimeOff.service.js` logs on every single balance/request call per employee
  per sync cycle — noisy in production, worth trimming.
- Confirm ADP CAR registration for `timeOffBalance.read`/`timeOffRequest.read`
  scopes in production — as of 2026-09-15, balances are confirmed authorized;
  requests specifically still needs the canonical URI added on ADP's side (see
  above).
- No reconciliation between the portal's `leave_requests` table and ADP — an
  approved-in-portal request does not get written to ADP, and an ADP-approved
  entry doesn't create/close a matching `leave_requests` row. If this causes
  confusion in practice (managers seeing two different pictures), worth
  revisiting — e.g. hiding a portal request from the "applied" list once ADP
  shows an overlapping approved entry for the same person/dates.
- `frontend/src/components/teamTimeOff/TeamCalendar.jsx` (the ADP board's
  calendar) now highlights days where 2+ team members overlap (amber ring +
  "!" badge in month view, amber header + badge in week view) — added 2026-09-14
  per Garima's "vacations are not overlapping" request. As of 2026-09-15,
  `ManagerLeaveCalendar.jsx` (the portal request calendar) has the same
  treatment — see "ManagerLeaveCalendar overlap highlighting" above.

### Production crash — "TypeError: t.toFixed is not a function" on /team — fixed 2026-09-22

A team member hit a hard crash ("Something broke") just loading `/team` in
production — never happened locally. Root cause: `entitlement`,
`carried_over`, `used`, `scheduled`, `available` on `adp_time_off_balances`
(and `hours` on `adp_time_off_requests`) are Postgres `NUMERIC` columns, and
the `pg` driver returns `NUMERIC` as a **string** by default (it won't
silently risk precision loss converting to a JS float). SQLite locally
(via better-sqlite3) returns real numbers for the same columns, so this
never showed up in local dev — only in production, and only once real
balance data actually started landing in these columns (before that they
were `NULL` and never hit the broken code path).

`frontend/src/components/teamTimeOff/timeOffShared.js`'s `fmtDays()` called
`n.toFixed(1)` straight on the value — fine for a real number, but a string
has no `.toFixed`, hence the crash. It's called directly from
`SummaryCards.jsx` on every `/team` page load (not just inside the drawer),
which is why it broke the whole page immediately rather than only on a
specific employee.

There was a second, quieter bug from the same root cause: both
`buildSummary()` in `backend/src/services/managerTimeOff.service.js` and the
duplicate summary calc in `TeamTimeOffBoard.jsx` add up each employee's
`used`/`available` with plain `+`. With string inputs, `+` does string
*concatenation*, not addition (`"5" + "3"` → `"53"`, not `8`) — so the
"Vacation used"/"Vacation remaining" team totals would have been silently
wrong for any team with more than one employee's balance on file, even
before the crash was possible.

Fixed at the actual source instead of patching every place that reads a
balance: `backend/src/config/database/postgres.js` now calls
`types.setTypeParser(1700, ...)` (1700 = Postgres's OID for `numeric`) right
after requiring `pg`, so every `NUMERIC` column comes back as a real JS
number everywhere in the app, matching what SQLite already does locally.
That one change fixes `rowToBalance`/`rowToRequest` and `buildSummary` in
`managerTimeOff.service.js`, the admin System Status page's sample-balances
table, and any other current or future code that reads one of these
columns — no per-call-site coercion needed. `fmtDays()` was also hardened
(coerces a numeric string, returns "—" instead of throwing on anything else
not a finite number) as a second line of defense, in case some other value
that isn't a real number ever reaches it again.

**This also answers the still-open "why is Jayaraj's vacation summary all
dashes" question from earlier** — `AdminSystemStatusPage.jsx`'s `fmtHours()`
already did its own `Number(n)` coercion correctly, so it was never affected
by this bug; if its sample-balances table showed real numbers for someone
while the Team page showed dashes for the same person, that was a genuine
"no data synced yet for that policy" situation, not this bug. Worth
re-checking now that the type fix is in, since real balances that previously
would have crashed the page may not have been visible to confirm before.

### Org chart spacing/overlap — fixed 2026-09-22

Reported from Adam Aziz's Team page (he's Director of Operations, so his
chart shows the full company — the widest, deepest case this component
renders): first-level cards (his 7 direct reports) were touching edge to
edge with no gap, and one branch two levels down (Melissa Rivera → Fred
Facciolo / Sheba Sunil / Joel Holder) visually overlapped.

Cause: `ReportingHierarchyTree.jsx`'s direct-report columns use `gap-0` on
the row so `BranchConnector`'s horizontal bar segments join into one
continuous line across siblings — but that same `gap-0`, combined with each
`OrgNode` card filling its column with zero padding (`cardW="w-full"`, no
horizontal padding), meant nothing ever separated one card's edge from the
next. Barely noticeable at the top level (wider `w-24` columns, shorter
titles), but at the second level (`w-20` columns, `size="sm"`, and titles
like "Senior Shipping Supervisor") a card's content had nowhere to go but
into its neighbor's space.

Fix: kept `gap-0` on the connector rows (still needed for the bars to join),
but wrapped each `OrgNode` in its own `px-2` (top level) / `px-1.5` (second
level) padded div — the connector stays flush, only the visible card gets
breathing room. Also widened the columns slightly (top level `w-24` → `w-28`,
second level `w-20` → `w-24`) to give longer titles more room before
wrapping. This is a layout-only fix — no data or connector-positioning logic
changed.

### "Away today: 0" while someone's name is highlighted on the calendar — not a bug, checked 2026-09-22

Reported alongside the org chart issue: Melissa Rivera showed as highlighted
across Sep 8–18 on the team calendar, but the "Away today" stat card read 0.
Checked `isTodayWithin()` in `managerTimeOff.service.js` (`startDate <= today
<= endDate`, using server UTC date) — it's correct. Melissa's approved time
off ran Sep 8–18; the screenshot's calendar was on Sep 22 (today, outlined on
the calendar itself) — four days *after* her time off ended. "Away today: 0"
is the right answer for that date; the highlighted range on the calendar is
just showing a past approved absence within the visible month, not a
currently-active one. No code change made. Worth keeping in mind for support
questions like this: the calendar shows the whole month at a glance, so a
highlighted range earlier in the month can look "current" if you don't check
which cell is actually outlined as today.

---

## Team page — ADP-only vacation data, portal leave-request UI removed — 2026-09-21

The "two different pictures" risk flagged above (portal `leave_requests` vs
ADP-synced data, no reconciliation between them) came up in practice —
Garima asked to make the Team page show vacation/time-off from ADP only and
remove what was "built in the beginning" (the pre-ADP portal workflow).

Resolved by removing, not reconciling: `frontend/src/pages/TeamPage.jsx` no
longer renders `TeamLeaveRequests` (the manager-side pending-request
approve/reject list, which read from the portal's own `leave_requests` table)
or the portal-native `ManagerLeaveCalendar` instance embedded inside it. The
Team page's only vacation/time-off surface is now `TeamTimeOffBoard` —
balances, approved requests, the calendar, and the drawer, all backed by the
ADP-synced tables (see the sections above).

Left alone, on purpose:
- `ReportingHierarchyTree` (the org chart) — already does exactly what "ADP
  first, portal fallback" means in practice: `adpSync.service.js` resolves
  each worker's ADP `reportsTo` into `manager_id` whenever it can, and only
  leaves an existing manually-set `manager_id` in place when ADP has no
  `reportsTo` for that person or the manager isn't linked yet
  (`reportingHierarchy.service.js`, "Second pass: resolve
  adp_reports_to_oid → manager_id"). Each node is tagged
  `manager_source: "adp"` or `"manual"` and the frontend already shows an
  "ADP" badge accordingly — no code changes were needed here, it was already
  built this way.
- `ManagerTrainingNotifications` on the Team page — unrelated to vacation
  (training notifications), left as is.

**Update — 2026-09-21, same day:** Garima confirmed the self-service form
should go too ("no one is going to apply for vacation on portal"), and a
second, older copy of the manager-side leave-approval UI turned up inside
`ManagerEmployeeManagement.jsx` (the "Team learning details" card) that the
first pass missed — it had its own independent Approve/Reject flow hitting
the legacy `PATCH /auth/manager-leave-requests/:id` endpoint (via
`leaveClient.js`), separate from `TeamLeaveRequests.jsx`'s
`/leave-requests/:id`. Both are now gone:

- `frontend/src/pages/ProfilePage.jsx` no longer renders `LeaveRequestPanel`
  (the "Vacation requests" card with the apply form) — import and JSX both
  removed.
- `frontend/src/components/ManagerEmployeeManagement.jsx` had its entire
  leave-requests sub-section removed: the `updateLeaveStatus` handler, the
  `leaveStatusClass` map, the `leaveJson` import, the pending-leave count in
  the summary line, the "leave requests" mention in the card's subtitle, and
  the per-employee "Leave requests" list/Approve/Reject UI. It now shows only
  direct reports + university course progress, matching its (updated)
  subtitle.

Left alone (not deleted, since nothing in this session's tools can delete
files from Garima's disk — only write/overwrite): the orphaned
`frontend/src/components/LeaveRequestPanel.jsx` file itself, and the backend
side (`leave-requests.routes.js`, `leaveRequests.service.js`, and the older
`/auth/manager-leave-requests` route) — nothing calls any of them anymore,
but they're still present on disk/in the API surface. Garima can delete the
frontend file manually if she wants it fully gone; the backend routes are
dead but harmless.

**Update — 2026-09-21, later same day:** Garima clarified she wanted the
whole "Team learning details" (`ManagerEmployeeManagement`) and "University
learning updates" (`ManagerTrainingNotifications`) cards off the Team page
entirely, not just the leave-request parts trimmed out of the first one —
they're training-tracking widgets, unrelated to vacation, but she doesn't
want them on this page at all. `frontend/src/pages/TeamPage.jsx` was
rewritten to drop both, along with all the state/effects that existed only
to feed them: `team`/`teamLoading`/`teamError`, `reloadTeam`,
`applyTeamPayload`, `mayLoadTeamProgress`, `hasDirectReportsInHierarchy`,
`showLearningSections`, `selfTraining`, the `managerTeamWithSelfJson` import,
and the `agc-training-progress`/`agc-training-complete` window-event
listener that refreshed them. Also dropped the `team`/`selfTraining` props
that used to get passed to `ReportingHierarchyTree` — turned out to be dead
even before this, since that component only ever destructures `hierarchy`
and `currentUserId`. The page is now just: header, reporting hierarchy
(org chart), and — for supervisors — the ADP-synced `TeamTimeOffBoard`.
Nothing else.

The `ManagerEmployeeManagement.jsx` and `ManagerTrainingNotifications.jsx`
component files themselves are untouched and still exist (not deleted, same
file-deletion limitation noted above) — just no longer imported/rendered
anywhere on the Team page. Worth checking whether either is still used
elsewhere (e.g. a dashboard page) before assuming they're fully dead code.

---

## Feedback & Polls — optional question sections — 2026-09-21

Garima asked for the admin "Feedback & polls" editor (`/admin/polls`) to
optionally group questions under named sections — give a section a name,
add questions under it — while keeping it fully optional: a poll with no
sections still works exactly as it did before (one flat list of questions).

**Data model**: `polls.poll_json` was already an opaque JSON blob with no
DB-level schema (`{schema_version: 1, questions: [...]}`), so no migration
was needed. Added two things to that same blob, both optional:
- `definition.sections`: `[{id, title}]` — empty array when unused.
- `definition.questions[].section_id`: nullable, references a `sections[].id`.
  `null`/missing (or an id that doesn't match any section) means the question
  is ungrouped, same as before.

Existing polls with no `sections` key at all normalize to `sections: []` and
every question normalizes to `section_id: null` — they render identically to
before the change.

**Backend — no changes needed.** `backend/src/routes/adminPolls.routes.js`
(`normalizeExportQuestions`, used for both save-time validation shape and the
Excel export) and `backend/src/routes/polls.routes.js` (`/active`, `/:id/submit`)
both only ever read `definition.questions` as a flat array and store/pass
`answers` as a flat object keyed by question id — a `sections` array or a
question's `section_id` field is just extra JSON they don't look at, so
nothing there needed to change. The Excel export is therefore also unaffected
— it doesn't show section groupings, just the same flat question columns as
before.

**Frontend changes**:
- `frontend/src/pages/AdminPollsPage.jsx` — `normalizeDefinition` now also
  normalizes `sections`; added `emptySection()`. New "Sections (optional)"
  card above "Questions": "Add section" creates a named group; each section
  has its own "Add question" (creates a question with that `section_id`) and
  a "Remove section" that un-groups its questions (moves them back to
  `section_id: null`) rather than deleting them. The "Questions" card below
  now only lists ungrouped questions, with a note explaining that when no
  sections exist yet. The shared per-question editor (label/type/required/
  options) was extracted into `renderQuestionCard()` so it's identical
  whether a question lives in a section or not — no behavior change to
  editing a single question.
- `frontend/src/components/PollPopupModal.jsx` — `normalizeQuestions` became
  `normalizeDefinition`, returning `{sections, questions}`. `PollSlide` now
  groups questions by `section_id`, rendering each section's questions under
  a bold section-title header (in poll order), followed by any ungrouped
  questions with no header — matching the admin editor's layout. Submission
  validation (`submit()` in the outer component) still just walks the flat
  `questions` array for required-field checks, unaffected by grouping.

Not changed on purpose: the Excel export doesn't reflect section groupings
(just the same per-question columns as before) — can be added later if
Garima wants section names in the export headers, but wasn't asked for.

---

## Team time off board — visual redesign — 2026-09-22

Garima asked for the "Team time off" board (on `/team`, inside
`TeamTimeOffBoard`) to look "beautiful and modern," pointing specifically at
the IT Ticket board (`ItTicketsMonitorTable`) as the style reference. This
was a pure Tailwind/JSX visual pass — no prop shapes, API calls, or data
logic changed in any of the five files touched.

**Design language borrowed from the IT Ticket board**: a full-bleed blue
gradient hero header (`from-[#0B3EAF] via-[#0d4bc4] to-[#1a5fd4]`) holding
the section title plus its primary controls, colored stat tiles instead of
plain white boxes, alternating-row tables with avatar-initial chips, rounded
pill badges, and `card no-title-underline ... shadow-lg ring-1` as the
container treatment throughout.

**`frontend/src/components/TeamTimeOffBoard.jsx`** — the plain
`<h2>Team time off</h2>` + inline filter/sync row was replaced with a
gradient hero header card (same treatment as the IT Ticket board's header):
title + subtitle on the left, `FilterBar` and a pill-shaped "Sync now"
button (now with a spinning refresh icon while syncing) on the right. The
ADP status banners and `SummaryCards` moved inside this same card's white
body. `VacationTable` and `TeamCalendar` stayed as their own cards below,
each restyled to match (see below). No behavior changed — same API calls,
same polling-for-sync logic, same filter/summary computation.

**`frontend/src/components/teamTimeOff/SummaryCards.jsx`** — the 5 stat
tiles (Team size, Away today, Upcoming, Vacation used, Vacation remaining)
each got a distinct pastel accent color (slate/rose/amber/sky/emerald) with
a bolder number and a subtle hover lift, instead of five identical white
boxes. Same props, same values.

**`frontend/src/components/teamTimeOff/FilterBar.jsx`** — inputs restyled as
glassy white-on-white fields (since this now sits on the blue gradient
header rather than a plain background) and the search box got a small
magnifying-glass icon. Same filters, same `onChange` contract.

**`frontend/src/components/teamTimeOff/VacationTable.jsx`** — added a
gradient-tinted header bar, alternating row backgrounds, an avatar-initial
circle next to each employee's name (same visual pattern as the IT Ticket
board's requester cell), and the usage progress bar now shifts color
(blue → amber → rose) as usage climbs instead of always being blue. Same
sort options, same columns, same `onSelectEmployee` behavior.

**`frontend/src/components/teamTimeOff/TeamCalendar.jsx`** — month/week/list
switcher restyled as a pill-shaped segmented control, prev/next became
circular icon buttons (SVG chevrons instead of `‹ ›` text), the "today" cell
gets a bold ring + filled day-number circle, and day cells/rows got the same
alternating/hover treatment as the table. Same date math, same overlap
detection, same three view modes.

Not touched: `EmployeeDrawer.jsx` and `TeamLeaveRequests.jsx` — neither
appeared in the screenshots Garima was reacting to (the drawer only opens on
an employee click, and `TeamLeaveRequests` isn't even rendered on `/team`
currently), so they were left as-is to keep this change scoped to what was
asked.

Verified via `tsc --allowJs --checkJs false --jsx react --noEmit` on all
five edited files (clean). Committed to Garima's machine via the device
bridge — no revert-bug retry needed this time, all five byte counts matched
on first re-stage (2663, 2609, 8175, 15577, 11006 bytes).

### Follow-up round — same day (2026-09-22)

Garima reviewed the redesign live and reported two problems:

1. **"Team time off" heading rendered dark, not white**, and the filter bar
   + "Sync now" button were cramming into a lopsided two-row block with a
   big empty gap next to the title. Root cause of the heading color:
   `agc-brand.css`'s `.app-dashboard h2 { color: #0f172a; }` rule has higher
   specificity than Tailwind's `text-white` utility class, so it silently
   won regardless of what was on the `<h2>`. The IT Ticket board already
   has the fix for this exact problem — a `.it-ticket-board-header h2`
   override in the same CSS file — so `TeamTimeOffBoard.jsx`'s title
   wrapper now reuses that same `it-ticket-board-header` class instead of
   inventing a new one. Layout fix: the filter/sync row moved from
   "squeezed to the right of the title on a wide `lg:flex-row`" to its own
   full-width row below the title, always — wraps cleanly at any width now.

2. **"Next time off" showed today's date for someone already on leave
   today.** `managerTimeOff.service.js`'s `getTeamTimeOff` used to pick
   `next_time_off` as the first approved request with `start_date >=
   today` — for someone on a leave that started today or earlier, that's
   the same request that's already keeping them away, so it displayed
   today's date as their "next" time off, which reads wrong (they're not
   about to leave, they already have). Real example Garima found: an
   employee away today (Sep 22) and tomorrow (Sep 23) showed "Next time
   off: Sep 22" instead of Sep 23. Fixed with a new `nextTimeOffFor()`
   helper: it skips requests entirely in the past, returns a genuinely
   future request unchanged, and for the request currently keeping someone
   away, returns it with `start_date` bumped to tomorrow (as long as
   tomorrow still falls inside that same request's range) — so the column
   now shows the next day they're actually off, not the day they're
   already on. If tomorrow falls outside the current request's range (i.e.
   today was their last day off), it correctly falls through to look at
   whatever comes after.

3. **Calendar didn't show what *kind* of time off someone was on** — the
   month view's day chips showed only the employee's first name (the leave
   type was color-coded via `badgeClassFor` and only visible on hover, via
   the `title` tooltip). Garima asked for it to say e.g. "Sick leave"
   directly in the cell (her example: Jayaraj on sick leave on July 15
   should say so on that day). `TeamCalendar.jsx`'s month-view chips are
   now two lines — first name (bold) then the leave type (`policy_name` or
   `policy_code`, smaller/muted) — still color-coded the same way. To keep
   cells from overflowing with the extra line, dropped from showing 3
   entries per day to 2 before collapsing into "+N more", and grew the
   minimum cell height from `5.5rem` to `6.75rem`. Week view and the list
   view already showed the leave type as text, so those were untouched.

Verified the backend change with `node --check` and the calendar change
with the same `tsc` syntax check as before (both clean). Hit the device
sync's known revert-bug on this round's commit (`managerTimeOff.service.js`
and `TeamCalendar.jsx` both landed as their pre-edit byte counts on first
re-stage) — resolved with the usual single retry, confirmed matching after
(14751 and 15825 bytes respectively).

Garima confirmed the calendar change looks right (Jayaraj's Jul 15 entry now
shows "Family Sick" under his name). She also flagged that opening the
Employee Drawer (click an employee's name in the vacation table) cut off the
top of the panel — the employee's name/title sat right under, and partly
behind, the app's sticky top bar (`AppTopBar`, `sticky top-0 z-30`). The
drawer itself is `fixed inset-0`, which should in principle stack above the
top bar given its `z-50`, but in practice something in the layout traps it
below the top bar visually. Rather than chase the stacking context, fixed
it the way Garima asked — gave the drawer's content panel more top padding
(`p-5` → `p-5 pt-24 sm:pt-28`) so its content clears the top bar regardless
of the underlying z-index cause. `EmployeeDrawer.jsx` only — no other
teamTimeOff files touched this round. Verified via the same `tsc` check
(clean); hit the revert-bug once on commit, resolved by the usual retry,
confirmed matching after (9976 bytes).

**Follow-up, same round**: the padding fix made the drawer's own content
readable, but Garima's next screenshot showed a thin sliver of the top bar
(the logged-in user's avatar) still visibly peeking out ABOVE the drawer's
white panel — meaning the drawer's `fixed inset-0` wasn't actually reaching
the true top of the viewport at all, so no amount of internal padding
could fix that specific sliver (padding only moves content within the
panel, not the panel's own top edge). This confirmed the stacking-context
theory from the first fix: something in the page layout the drawer mounts
inside of (almost certainly a CSS `transform` on a page-transition wrapper
in `AuthenticatedLayout`) turns `position: fixed` into "relative to that
ancestor" instead of the real viewport, so the drawer's box was being
capped below the top bar rather than covering it.

Fixed properly this time by rendering `EmployeeDrawer` through
`createPortal(..., document.body)` — the exact same escape hatch this
codebase already uses for `ItTicketsMonitorTable`'s column-filter popovers,
for the identical reason (a fixed/absolute-positioned overlay getting
trapped by an ancestor's stacking context). Portalling straight into
`<body>` means `fixed inset-0` is relative to the actual viewport again, so
the drawer now genuinely covers the top bar like any other modal — the
`pt-24`/`pt-28` padding from the first fix was left in place since it still
reads well now that there's no top-bar sliver to begin with. Verified via
the same `tsc` check (clean); hit the revert-bug once on commit, resolved
by the usual retry, confirmed matching after (10938 bytes).

---

This Claude session has NO direct shell or git access to Garima's machine — all
file edits go through a device-bridge (stage → edit locally → commit back), which
writes files but does not touch git. Garima runs `git add` / `git commit` /
`git push` herself in her own terminal, pasting output back for Claude to
interpret if anything looks off.
