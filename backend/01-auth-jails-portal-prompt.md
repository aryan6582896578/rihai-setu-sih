# RIHAI SETU — Prompt 1 of 4: Public Home, Auth, Jail List, Jail Detail

Read `00-rihai-setu-master-context.md` in full first — tech stack, roles, and shared
schema below assume it. This is a real implementation: real JWT auth + bcrypt, real DB,
no mocked login.

## Scope of this session
Build these end-to-end — DB migrations, seed data, backend routes, frontend pages.

### 1. Public Home Page — `/`
No auth required, no sensitive data.
- Hero: "RIHAI SETU" name/tagline, one-line problem statement (digital bridge from
  undertrial release to rehabilitation & reintegration)
- Static stat strip (hardcoded content, not live data): undertrials as a share of India's
  prison population, and 2–3 other headline figures from your own research
- "How it works" — 3–4 step visual: Eligibility screening → Fast-tracked paperwork →
  Court tracking → Rehabilitation & reintegration
- Login CTA → `/login`
- Footer with source references

### 2. Login Page — `/login`
- Email + password, client- and server-side validation
- `POST /api/v1/auth/login` — verify bcrypt hash, issue short-lived JWT access token
  (~15 min) + httpOnly-cookie refresh token (~7 days)
- On success, redirect every role to `/jails` — jail-level access is what actually gates
  what a user sees, not the redirect target
- Handle: inactive account, wrong credentials, basic rate-limiting (e.g. 5 attempts/min/IP)
- "Forgot password" — build the UI; backend endpoint can log a reset token server-side for
  now (no email service required yet) — leave a TODO for real email delivery

### 3. Jail List Page — `/jails` (auth required)
- Fetch jails the logged-in user has `JailAccess` to (`super_admin` sees all jails)
- Cards/list: jail name, district/state, occupancy badge (current/sanctioned,
  color-coded — green <100%, amber 100–120%, red >120%), undertrial count
- Click → `/jails/:jailId`
- Empty state if a user has zero `JailAccess` rows: "No jail access assigned — contact
  your administrator"

### 4. Jail Detail Page — `/jails/:jailId`
Gated by `JailAccess` (403/404 if the user has no access row for this jail and isn't
`super_admin`). Tabbed layout:

**Overview tab**
- Stat cards: current occupancy, sanctioned capacity, % capacity, total prisoners,
  undertrial count, convict count, staff count
- Recent activity feed (last N application stage changes / new admissions) — derive from
  `Application.updated_at` / `Prisoner.created_at` ordered desc, no separate audit-log
  table needed yet

**Employee Management tab** (visible only to `jail_superintendent` and `super_admin`)
- Table of staff with `JailAccess` to this jail: name, email, role_at_jail, active toggle
- Add staff: search existing `User` by email, or create new (name, email, auto-generated
  temp password shown once, `role_at_jail` dropdown)
- Edit `role_at_jail`; deactivate/remove access (soft — remove the `JailAccess` row, never
  delete the `User`)

**Stall List tab**
- Query: any `Application` where `stage != order_passed/released` AND
  `(now - updated_at) > threshold` for its current stage. Per-stage thresholds, as a
  config object with sensible defaults: flagged→drafted 3 days, drafted→filed 5 days,
  filed→hearing_scheduled 10 days, hearing_scheduled→order_passed 14 days,
  order_passed→released 3 days (this last one is the bond/surety delay case)
- Sorted by days-stalled desc: prisoner name, case number, current stage, days stalled,
  "Escalate" button — sets `StallAlert.escalated=true, escalated_at=now`
- Compute the list live at request time (date math in the query), and upsert into
  `StallAlert` so escalation state persists across views

## API endpoints needed
```
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/jails
GET    /api/v1/jails/:id
GET    /api/v1/jails/:id/stats
GET    /api/v1/jails/:id/staff
POST   /api/v1/jails/:id/staff
PATCH  /api/v1/jails/:id/staff/:userId
GET    /api/v1/jails/:id/stall-list
POST   /api/v1/applications/:id/escalate
```

## Seed data
4–5 jails across different states, 2–3 accounts per jail (superintendent, staff), ~30–50
synthetic prisoners with custody-start dates staggered across the last 6 months — this
range matters for Prompt 3's eligibility engine and for the stall list to show realistic,
varied ages of applications. Also seed a handful of `Application` rows deliberately old
enough to trigger stall thresholds, so the Stall List tab isn't empty on first run.

## Acceptance criteria
- Fresh clone → install → migrate → seed → log in with a seeded superintendent account →
  see the jail list → open a jail → see overview stats populate, add a staff member, see
  the stall list populate from seeded stale applications
- No `/jails*` route is reachable without a valid JWT; `JailAccess` is enforced per jail
- `/TODO.md` gets a checklist section for this session, checked off as you go
