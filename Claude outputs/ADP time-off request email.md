# Email draft — ADP: enable time-off request access

**Subject: Enabling time-off request data (in addition to balances) on our existing API connection**

Hi [ADP Implementation Contact name],

Thanks for getting the vacation balance data flowing on our side — that part is working well now.

We're building out a manager-facing vacation board on our end, and for that we also need actual time-off request dates (not just balances) — who's applied, who's approved, and the specific dates, so managers can see overlapping vacations across their team. Right now we're getting an authorization error when we call that part of the API, so it looks like the scope for it hasn't been enabled yet on our connection.

Could you confirm whether the following has been added?

- **Scope:** `timeOffRequest.read`
- **Canonical URI:** `/time/timeLaborManagement/timeOffManagement/timeOffRequestManagement/timeOffRequest.read`
- **Endpoint we're calling:** `GET /time/v3/workers/{aoid}/time-offrequests`

I want to flag that this is a different scope/URI from the balances one we already have (`timeOffBalance.read`), so I believe it needs to be added separately rather than assuming it's covered by what's already enabled.

Separately, one specific employee — Jayaraj Govindan — is showing no time-off balance at all on our end, even setting the access question aside. Could you check on your side whether he currently has a vacation/PTO policy assigned in ADP? Want to rule out whether that's a data setup issue rather than something on our end.

Happy to hop on a quick call if that's easier. Thanks again for the help getting this set up.

Best,
Garima
