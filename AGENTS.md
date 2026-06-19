# AGC Member Portal — Agent Handoff Guide

This document helps AI assistants (Claude, Cursor, etc.) work safely and effectively on this codebase. Read it before making changes.

---

## Quick start (every task)

1. Read all rules in `.cursor/rules/` (7 files) if available in the workspace.
2. Run: `git status`, `git branch`, `git pull origin main`
3. Review related files before editing — do not guess patterns.
4. Make small, focused changes. **Do not commit unless the user asks.**
5. Never expose secrets. Never commit `.env` files.
6. Be careful with SSO, auth middleware, admin grants, and Render deployment.

When done, suggest: `git status`, `npm run build` (in `frontend/`), and what to test manually.

---

## What this project is

Internal **member portal** for Amir Group of Companies — not just an LMS.

| Area | Description |
|------|-------------|
| Home / Dashboard | Spotlight feeds, birthdays, mini calendar (Toronto timezone) |
| AGC University (LMS) | Courses, lessons, assignments, progress, facility-based access |
| Team / Manager | Org chart, leave requests, manager tools |
| AGC sidebar | Company content: about, benefits, policy, policy changes, portal links, website links, forms |
| Administration | Scoped admin grants (not all admins see everything) |
| IT Tickets | Submit/track tickets, email IT department |
| Calendar / Upcoming | Engagement calendar, facility events |
| Reports | Power BI embeds |
| Auth | Email/password + Microsoft Entra ID SSO + invite setup + password reset |

**Business units:** `AGC`, `AQM`, `SCF`, `ASP`  
**Roles:** `Admin`, `Manager`, `Employee`

---

## Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | React 18, Vite 5, Tailwind 3, React Router 6, Axios |
| Backend | Node 18+, Express 4, JWT auth, bcrypt |
| Local DB | SQLite via `sql.js` (no native compiler on Windows) |
| Production DB | PostgreSQL via `pg` |
| File storage | Local `uploads/` in dev; **DigitalOcean Spaces required on Render** |
| Email | SMTP (Microsoft 365 / Outlook typical) |
| SSO | Microsoft Entra ID (Azure AD) |
| Deploy | **Render** — separate static site (frontend) + web service (API) |

### Local development

```bash
# Backend (port 5000)
cd backend
cp .env.example .env
npm install
npm run dev

# Frontend (port 5173)
cd frontend
npm install
npm run dev
```

Default local admin (if seeded): `admin@company.com` / `admin123`

---

## Production deployment (Render)

**Two Render services:**

1. **Static site (frontend)** — build: `npm run build`, publish `dist/`
   - Env: `VITE_API_URL=https://agc-member-portal.onrender.com` (no trailing slash)
   - SPA rewrite: `/*` → `/index.html`
   - Custom domain example: `https://memberportal.amirgc.com`

2. **Web service (backend)** — start: `npm start`
   - Required: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`
   - Recommended: `APP_BASE_URL=https://memberportal.amirgc.com`
   - SSO vars on **API only**: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
   - Uploads: `DO_SPACES_*` vars (required in production)

**Important:** Custom SPA domain does **not** replace `VITE_API_URL`. The frontend still calls the API Render URL unless a custom API domain is configured too.

**Never commit:** `.env`, secrets, tokens, production credentials.

See `backend/.env.example` and `frontend/.env.example` for full env documentation.

---

## Project structure

```
AGC University/
├── frontend/src/
│   ├── App.jsx                      # All routes
│   ├── context/AuthContext.jsx      # Login state, token, user cache
│   ├── components/layout/           # AppSidebar, AppTopBar, SidebarIcons
│   ├── hooks/usePortalNavItems.js   # Sidebar nav (main + AGC + admin)
│   ├── constants/
│   │   ├── companyContentConfig.js  # AGC section labels, routes, icons
│   │   └── adminGrants.js           # MUST match backend
│   ├── pages/                       # 40+ page components
│   ├── services/api.js              # API base URL logic (complex!)
│   └── utils/adminAccess.js         # hasAdminGrant()
│
├── backend/src/
│   ├── server.js                    # Express app, route mounting
│   ├── config/
│   │   ├── companyContentSections.js  # Valid section keys (API validation)
│   │   ├── adminGrants.js             # MUST match frontend
│   │   ├── constants.js               # Roles, business units
│   │   └── database/                  # sqlite.js, postgres.js, sqlDialect.js
│   ├── middleware/
│   │   ├── auth.js                  # authRequired JWT middleware
│   │   └── adminGrants.js           # requireAdminGrant()
│   ├── routes/                      # 27 route files
│   └── services/                    # Business logic
│
└── .cursor/rules/                   # 7 always-on project rules (in this repo)
```

**Note:** Root `README.md` is outdated (describes basic LMS only). Trust the code and `.env.example` files for current behavior.

---

## Critical gotchas

### 1. Company content — section key sync

Frontend and backend must stay in sync or API returns **"invalid section"**.

| Frontend key | Backend DB key | Route slug |
|--------------|----------------|------------|
| `about` | (intro stored separately) | `/about-company/about` |
| `benefits` | `benefits` | `/about-company/benefits` |
| `policy` | `policy` | `/about-company/policy` |
| `policy_changes` | `policy_changes` | `/about-company/policy-changes` |
| `links` | `links` | `/about-company/links` |
| `links_websites` | `links_websites` | `/about-company/websites` |
| `forms` | `forms` | `/about-company/forms` |

**Sidebar group label:** `AGC`  
**Nav order:** about → benefits → policy → policy changes → links to portal → links to websites → **forms last**

When adding/changing a section, update **all** of:
- `frontend/src/constants/companyContentConfig.js`
- `backend/src/config/companyContentSections.js`
- `frontend/src/hooks/usePortalNavItems.js` (if nav order changes)
- `backend/src/routes/companyContent.routes.js` (uses `normalizeCompanySectionKey`)

### 2. Admin grants — must match on both sides

These files must use identical grant key strings:
- `frontend/src/constants/adminGrants.js`
- `backend/src/config/adminGrants.js`

Frontend: `<ProtectedRoute adminGrant={ADMIN_GRANT_KEYS.X}>`  
Backend: `requireAdminGrant(ADMIN_GRANT_KEYS.X)`

Full `Admin` role bypasses grant checks; scoped admins only see granted areas.

### 3. Dual database (SQLite local / Postgres production)

- Entry point: `backend/src/config/database/` (via `db.js`)
- Shared SQL must use `sqlDialect.js` helpers
- Do **not** use SQLite-only syntax (`INSERT OR IGNORE`, `?` placeholders) in shared route code without dialect translation
- Test locally with SQLite; production uses Postgres

### 4. API URL resolution (`frontend/src/services/api.js`)

Handles local dev, Render sibling URLs, custom domain fallback, HTTPS mixed-content fixes, and retry logic. **Do not simplify lightly.**

### 5. SSO lives on the API, not the SPA

- Login start: `GET /api/auth/microsoft`
- Callback: `https://YOUR-API.onrender.com/api/auth/microsoft/callback`
- Frontend receives token via `/login/sso` redirect

**Do not change callback URLs** unless Azure app registration is updated too.

### 6. Uploads on Render

Local `uploads/` files are ephemeral on Render. Production requires DigitalOcean Spaces (`DO_SPACES_*`).

---

## Authentication flow

1. User logs in → JWT stored in `localStorage.token`
2. User profile cached in `localStorage.user`
3. `AuthContext` refetches `/users/me` on load and when tab becomes visible
4. `authRequired` middleware validates JWT on every protected API route
5. 401 responses clear token and redirect to `/login`

**Protected routes:** wrapped in `<ProtectedRoute>` inside `AuthenticatedLayout`  
**Public routes:** `/login`, `/login/sso`, `/invite`, `/forgot-password`, `/reset-password`

---

## Sidebar / navigation

- **Main nav:** `usePortalNavItems.js` — Home, Team, AGC University, Reports, Calendar, Upcoming, IT Ticket, Profile
- **AGC group:** from `ABOUT_COMPANY_NAV_ITEMS` in `companyContentConfig.js`
- **Admin nav:** grant-filtered, grouped via `adminNavGroups.js`
- **Icons:** custom SVG components in `SidebarIcons.jsx`

Some users see a **facility-university-only** reduced nav (`utils/facilityUniversityOnly.js`).

---

## Project rules (`.cursor/rules/`)

| File | Purpose |
|------|---------|
| `00-project-overview.mdc` | What the portal is |
| `01-git-workflow.mdc` | Pull first, no surprise commits |
| `02-code-quality.mdc` | Small, clean changes |
| `03-security-sso.mdc` | Auth/secrets safety |
| `04-render-deployment.mdc` | Build/env/deploy rules |
| `05-ui-portal-design.mdc` | Professional UI standards |
| `06-testing-checklist.mdc` | Pre-completion checks |

---

## What NOT to do

- Do not remove `authRequired` or bypass login checks
- Do not change Microsoft SSO callback URLs without Azure update
- Do not commit `.env` or paste real secrets into code
- Do not force push to `main`
- Do not add section keys in frontend only (causes "invalid section")
- Do not use SQLite-only SQL in shared backend code
- Do not rewrite `api.js` URL logic without understanding Render + custom domain setup
- Do not delete existing routes/pages unless explicitly requested
- Do not change Render build/start commands unless truly required

---

## Testing checklist (before marking work complete)

**Frontend**
- Page loads without console errors
- Navigation and sidebar active states work
- Forms validate; buttons and links work
- Layout is responsive (desktop, tablet, mobile)

**Auth**
- Login/logout works
- SSO still works (if configured)
- Protected pages blocked when logged out

**Backend**
- API returns expected data
- Admin grant restrictions enforced
- No sensitive data leaked in responses

**Deploy readiness**
- `npm run build` passes in `frontend/`
- New env vars documented in `.env.example` only
- `git status` run; changed files summarized

---

## Key environment variables (names only)

**Backend:** `JWT_SECRET`, `DATABASE_URL`, `APP_BASE_URL`, `AZURE_*`, `DO_SPACES_*`, `SMTP_*`, `PORTAL_TIMEZONE`  
**Frontend:** `VITE_API_URL`, `VITE_ORG_CHART_ASSETS_BASE`

Full docs: `backend/.env.example`, `frontend/.env.example`

---

## Suggested first prompt for a new session

```
Read AGENTS.md and .cursor/rules. Run git status and git branch.
Review related files before editing. Follow project rules — small changes,
no commits unless I ask. Then: [your task here].
```
