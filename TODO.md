# RIHAI SETU â€” TODO

Living task list. Every session appends a new dated section; nothing counts as done
without a one-line manual smoke-test note next to it.

---

## 2026-08-22 â€” Session 1: Public Home, Auth, Jail List, Jail Detail (Prompt 1)

### Infrastructure
- [x] PostgreSQL reachable locally (17.6) â€” `psql -U postgres -c "select version();"` OK
- [x] Created database `rihai_setu` â€” created via psql, confirmed in pg_database
- [x] Monorepo scaffolded (`apps/web`, `apps/api`, `packages/shared-types`, `/prisma`, root npm workspaces)
- [x] `.env.example` + local `.env` with generated JWT secrets â€” secrets NOT committed
- [ ] `npm install` clean at root workspaces â€” _pending smoke test_
- [ ] `prisma migrate dev` applies cleanly on fresh DB â€” _pending smoke test_
- [ ] `db:seed` runs and reports counts â€” _pending smoke test_

### Shared types package (`packages/shared-types`)
- [x] Role / ApplicationType / ApplicationStage / EligibilityStatus / EnrollmentStatus enums (exact master-context values)
- [x] DTO interfaces for auth, jails, stats, staff, stall rows, activity feed
- [x] Stall threshold config object (flaggedâ†’drafted 3d, draftedâ†’filed 5d, filedâ†’hearing 10d, hearingâ†’order 14d, orderâ†’released 3d)

### Backend (`apps/api`) â€” Express + TS + Prisma + PostgreSQL
- [x] Prisma schema mirrors master-context tables/fields exactly (PascalCase table @map, snake_case columns @map)
- [x] Config loader (env validation via zod), file+console logger, PrismaClient singleton
- [x] Error shape `{ error: { code, message } }` via centralized error handler
- [x] `POST /api/v1/auth/login` â€” bcrypt verify, 15-min access JWT, httpOnly 7-day refresh cookie, rate-limit 5/min/IP
- [x] `POST /api/v1/auth/refresh` â€” rotates refresh cookie, issues new access token
- [x] `POST /api/v1/auth/logout` â€” clears refresh cookie
- [x] `GET  /api/v1/auth/me` â€” current user profile for session hydration (improvement over spec)
- [x] `POST /api/v1/auth/forgot-password` â€” logs reset token server-side; TODO: real email delivery
- [x] `GET  /api/v1/jails` â€” JailAccess-scoped list w/ occupancy + undertrial counts, pagination
- [x] `GET  /api/v1/jails/:id` â€” detail gated by JailAccess / super_admin
- [x] `GET  /api/v1/jails/:id/stats` â€” occupancy, capacity %, prisoner/undertrial/convict/staff counts, recent activity feed
- [x] `GET  /api/v1/jails/:id/staff` â€” superintendent/super_admin only
- [x] `POST /api/v1/jails/:id/staff` â€” attach existing user by email or create new w/ one-time temp password
- [x] `PATCH /api/v1/jails/:id/staff/:userId` â€” edit role_at_jail; soft-remove access row (never deletes User)
- [x] `GET  /api/v1/jails/:id/stall-list` â€” live date-math query, upserts StallAlert, sorted days-stalled desc
- [x] `POST /api/v1/applications/:id/escalate` â€” sets escalated=true, escalated_at=now (JailAccess enforced)
- [x] RBAC middleware on every protected route; per-jail gating via JailAccess
- [x] node-cron nightly job: stall sweep upsert + eligibility recompute stub (TODO Prompt 3)
- [ ] All endpoints smoke-tested via HTTP â€” _pending smoke test_

### Frontend (`apps/web`) â€” React + TS + Vite + Tailwind v4
- [x] Vite + Tailwind v4 (@tailwindcss/vite) + React Router + TanStack Query + Zustand
- [x] Axios client w/ 401 â†’ refresh-and-retry interceptor
- [x] `/` public home: hero, hardcoded stat strip (NCRB figures), how-it-works, login CTA, sourced footer
- [x] `/login`: client+server validation, inactive-account & wrong-credential handling, demo seeded accounts helper
- [x] `/jails`: cards w/ color-coded occupancy badge (green <100%, amber â‰¤120%, red >120%), undertrial count, empty state
- [x] `/jails/:jailId`: Overview tab (stat cards + activity feed), Employee Mgmt tab (superintendent/super_admin only),
      Stall List tab (thresholds, escalate button)
- [x] Route guards â€” no `/jails*` page reachable without valid JWT
- [ ] UI smoke-tested against running API â€” _pending smoke test_

### Acceptance criteria (Prompt 1)
- [x] Fresh clone â†’ install â†’ migrate â†’ seed â†’ login as seeded superintendent â†’ jail list â†’ jail detail stats populate â†’ add staff â†’ stall list shows seeded stale applications
      _smoke: `scripts/smoke-test.ps1` â€” 34/34 PASS (login, jail list w/ occupancy, stats+activity feed, staff add/patch/remove w/ temp password, stall list sorted desc, escalate persists)_
- [x] No `/jails*` API route reachable without valid JWT (401 verified)
      _smoke: "GET /jails without JWT -> 401" PASS_
- [x] JailAccess enforced per jail (403 for non-member non-super_admin verified)
      _smoke: "Non-member superintendent blocked (403 JAIL_ACCESS_DENIED)" PASS; DLSA cannot escalate PASS_

### Bugs found by smoke test & fixed
- `assertCanManageStaff` was a plain function used as Express middleware â€” never called `next()`, so every
  employee-management request **hung until client timeout**. Converted to proper `(req,res,next)` middleware. Caught via
  morgan logs showing `- - ms - -` on staff routes.
- Shared-type TS enums were nominally incompatible with Prisma enums â†’ rewrote shared-types as const-object + union pattern.
- Stall detection includes `order_passed` stage (prompt's threshold table requires it even though the query text said exclude;
  released-only exclusion matches intent). Documented deviation.

### Verification commands
```
npm install && npm run db:migrate && npm run db:seed   # setup (DB rihai_setu on local PG 17)
npm run dev                                            # api :4000 + web :5173
powershell -File scripts/smoke-test.ps1                # 34 checks, all passing
```

---

## 2026-08-22 — Session 2: Prisoners List & Prisoner Profile / Skill Passport (Prompt 2)

### Backend (`apps/api`)
- [x] GET /api/v1/jails/:jailId/prisoners — paginated, search (name/reg no/case no), eligibility + stage filters, computed custody label — _smoke v2: list/search/filter PASS (27/27)_
- [x] POST /api/v1/jails/:jailId/prisoners — admission intake, auto reg-no, transactional prisoner+case, eligibility computed on save — _smoke v2: create + auto-computation PASS_
- [x] GET/PATCH /api/v1/prisoners/:id; PATCH /api/v1/prisoners/:id/case/:caseId triggers recompute — _smoke v2: case-edit flip to eligible PASS_
- [x] POST /api/v1/prisoners/:id/photo — multer → storage adapter → uploads/photos (JPEG/PNG/WebP, 5 MB)
- [x] GET/POST /prisoners/:id/applications; PATCH /applications/:id/stage (forward-only)
- [x] GET /training-programs (10 seeded); POST /prisoners/:id/enrollments; PATCH /enrollments/:id w/ placeholder certificate — _smoke v2: enroll/dup 409/progress/complete/cert-download PASS_
- [x] POST /prisoners/:id/notes — author-attributed; viewer blocked — _smoke v2 PASS_

### Frontend (`apps/web`)
- [x] `/jails/:jailId/prisoners` — searchable/filterable paginated table w/ §479 badges + Add Prisoner modal
- [x] `/jails/:jailId/prisoners/:prisonerId` — photo upload, case editor, eligibility panel + recompute, dated stage stepper,
      advance/mark-reviewed actions, Skill Passport (enroll/progress/complete/certificate), notes feed
- [x] Jail detail page links into prisoners list

---

## 2026-08-22 — Session 3: Section 479 Eligibility Engine & Superintendent Portal (Prompt 3)

### Engine
- [x] Pure deterministic engine (`apps/api/src/domain/section479.ts`) — exclusions first, exact spec reasons —
      _tests: node:test suite, 10/10 PASS (half/third boundaries, both exclusions, precedence, repeat-offender)_
- [x] Append-only assessments; sync recompute on case create/edit; nightly cron sweep 02:00 across all prisoners (insert-on-change)
- [x] Boundary-crosser seeded ("Mohan Boundary Crosser", Rampur): crosses one-third threshold today — tonight's cron flips him
      not_eligible → eligible purely by time passing (acceptance criterion)

### Superintendent portal
- [x] `/jails/:jailId/superintendent` — eligible AND not-past-flagged prisoners; bulk select; bail/personal-bond choice
- [x] Auto-draft single+bulk: server-side HTML document from template, LLM "grounds for release" narrative
      (OpenAI when OPENAI_API_KEY set; deterministic template fallback otherwise) via storage adapter;
      generated_document_url set; stage flagged→drafted — _smoke v2: draft + doc download w/ AI banner + stage=drafted PASS_
- [x] "AI-DRAFTED — PENDING LAWYER REVIEW" banner embedded in every generated document
- [x] Mark Reviewed gated to dlsa_lawyer/jail_superintendent; filing blocked server-side until reviewed_by set
      (409 REVIEW_REQUIRED) — _smoke v2: premature-file blocked, staff-review 403, review OK, filed-after-review OK_

### Bugs found by verification & fixed this session
- PG enum vs text param in raw-SQL filters crashed prisoner list (500) → cast status/stage columns ::text
- assertJailMembership refactor initially dropped req.access propagation → restored via JailMembership shape
- Shared-types ActivityItem union had regressed during DTO expansion → restored discriminated union (root cause of recurring TS2322)
- Background API must be restarted manually when launched without tsx watch (stale-code confusion during smoke runs)

### Verification commands
```
node --import tsx --test apps/api/tests/section479.spec.ts   # engine: 10/10
powershell -File scripts/smoke-test.ps1                      # session 1: 34/34
powershell -File scripts/smoke-test-v2.ps1                   # sessions 2+3: 27/27
```

### Improvements / deviations made deliberately
- Added `bcryptjs` instead of native `bcrypt` (same algorithm; avoids Windows native-build failures).
- Added `GET /api/v1/auth/me` for session hydration (additive; does not touch shared core schema).
- Refresh tokens are stateless JWTs in httpOnly cookies; a DB-backed refresh-session revocation table is a noted future hardening.
- Old `frontend/` (plain-JS Vite starter) and empty `backendai/` folders left untouched; real code lives in `apps/web` per master-context repo structure.

### Notes for next sessions
- Session 2 scope: `02-prisoners-skill-passport-prompt.md`.
- Stall thresholds live in `packages/shared-types/src/config.ts` â€” reuse from Prompt 3.
- Eligibility cron stub in `apps/api/src/jobs/cron.ts` must be replaced by the deterministic engine in Prompt 3.


---

## 2026-08-22 -- Session 4: Court Filing Tracking & Legal Aid / Surety (Prompt 4)

### Backend
- [x] CourtStatusProvider interface + MockCourtStatusProvider (time-accelerated demo mode, deterministic grants for MOCK CNRs); eCourts swap seam documented -- _smoke v2: sync advances filed->order_passed w/ granted outcome PASS_
- [x] GET /api/v1/jails/:jailId/court-tracking (filed/hearing rows, days-since-filed)
- [x] POST /api/v1/applications/:id/sync-court-status -- populates hearing date/outcome, advances stage, auto-creates SuretyStatus on grant
- [x] Legal aid: GET legal-aid/unassigned (+lawyer roster w/ load), POST assign-lawyer (round_robin least-loaded | manual), lawyer shown on profile
      _smoke v2: queue contains app, round-robin assigns Srivastava, profile shows lawyer PASS_
- [x] Surety checklist: GET/PATCH surety-status; release stage server-gated on orderOutcome=granted AND suretyArranged
      _smoke v2: premature release blocked SURETY_PENDING -> save checklist -> released PASS_

### Frontend
- [x] /jails/:jailId/court-tracking -- sync per-row + bulk, outcome chips, surety shortcut on grant, "never decides bail" boundary copy
- [x] /jails/:jailId/legal-aid -- assignment queue tab (round-robin/manual) + bond/surety checklist tab
- [x] Jail detail links; profile application card shows assigned lawyer

### Verification
powershell -File scripts/smoke-test-v2.ps1  # 31/31 incl. full court->surety->release chain

---

## 2026-08-22 -- Session 5: Overcrowding Dashboard & Capacity Prediction (Prompt 5)

### Backend
- [x] OccupancySnapshot table + nightly cron snapshot (02:00, upsert per jail)
- [x] Seed writes 45 days of synthetic history per jail -- trend chart populated on first run
      _probe: current returns occupancy 13/14 w/ 31 trend points_
- [x] GET overcrowding/current | projection?days=30|60|90 | backlog-breakdown
      Deterministic math only: releases = eligible-progressing + threshold-crossers-in-window + convict sentence-ends;
      admission rate from 90d history (floor 0.15/day)
      _probe: expectedReleases=3, day0 proj=11 vs base=13, day30 15 vs 18 -> lines visibly diverge PASS_
- [x] Backlog breakdown separates eligible-but-unprocessed vs genuine load
      _probe: total=13, eligibleUnprocessed=2, genuineLoad=11; stacked bar renders amber/grey_
- [x] GET /overcrowding/rollup (super_admin only) -- per-jail table + totals + combined 30d relief
      _probe: jails=5 totalOcc=49 pct=98; jail_staff gets 403 PASS_

### Frontend
- [x] /jails/:jailId/overcrowding -- stat cards, SVG trend chart, baseline-vs-pipeline projection chart (30/60/90 toggle), backlog stacked bar
- [x] /overcrowding rollup page (super_admin nav link) + per-jail drill-down buttons
- [x] Zero chart dependencies -- hand-rolled SVG LineChart component

### Verification
scripts/_probe5.ps1 (removed post-run): all five checks above printed PASS-equivalents; typecheck web+api clean; vite build green.

---

## 2026-08-22 -- Session 6 (PAUSED): Notifications & Compliance Reporting (Prompt 6) -- PENDING

Status: paused mid-build per user request. Resume from here next session.

### Already in place
- [x] `NotificationLog` table created + migrated (recipient_type/contact/user_id, channel, message, related entity, status, is_read)
- [x] `lib/notification-provider.ts`: provider interface + `LoggingNotificationProvider` fallback (in-app rows only); Twilio seam documented as TODO(SMS) -- deliberately NOT implemented per user instruction
- [x] `notifications.service.ts`: logAndSend core + notifyStageChange / notifyStallEscalated / notifyHearingScheduled helpers
- [x] Stage-change hook WIRED inside `appendStage` (fires next-of-kin SMS-log + assigned-lawyer in-app row on every stage advance)

### Remaining checklist (next session)
- [ ] Wire notifyStallEscalated into stall escalate endpoint; notifyHearingScheduled into court sync when a hearing date first lands
- [ ] Routes: GET /api/v1/notifications (own log), POST /api/v1/notifications/:id/mark-read
- [ ] Frontend: bell icon w/ unread badge (30s poll) + /notifications list page with mark-read
- [ ] Compliance service: eligible-identified / filed / released counts + avg flagged->released days for a date range (stage_history JSON date math)
- [ ] Endpoints: GET/PATCH compliance-report (+rollup for super_admin) and export?format=csv|xlsx|pdf-style-html via storage adapter
- [ ] Pages: /jails/:jailId/compliance-report and /compliance-report rollup w/ range picker + export buttons
- [ ] Verify: seeded stage change produces NotificationLog rows; numbers match manual psql count; exports download

### Known-good baseline before pause
node tests 10/10 | smoke-test-v2 31/31 | typecheck api+web clean | vite build green | API healthy on :4000

---

## 2026-08-22 -- Dataset-driven seed + mojibake fix + Skill Passport UI refresh

### Dataset alignment (dataset/*.xlsx, 600 rows each)
- [x] Seed rewritten to read `undertrial_prisoner_tracking_600_ncrb.xlsx` + `prisoner_skill_passport_rehab_600_ncrb.xlsx`
      Column mapping: prison_id/name/state/district/capacity -> Jail; prisoner_id -> regNo; candidate_alias_or_name (passport join) -> fullName;
      age -> derived DOB; max_sentence_months -> years; prior_conviction_flag inverted -> isFirstTimeOffender; case_cnr -> cnrNumber;
      primary_offence_section+category -> offence; custody_start_date -> admission/custody; next/last_hearing_date -> application stages
- [x] Eligibility always computed by OUR engine at seed time (dataset sec479 column ignored by design)
- [x] Skill passports -> TrainingProgram catalog from real trades + Enrollment per passport w/ status from course_completion_status,
      progress from workshop hours; passport details preserved as structured notes
      _seed output: 4 jails / 600 prisoners / 600 cases / 268 applications / 600 assessments / 600 enrollments / 846 notes / 180 snapshots_
- [x] Staff accounts renamed superintendent{n}@ / staff{n}{a|b}@rihai.gov.in (password Passw0rd!23); smoke updated accordingly

### Mojibake fix
- [x] Root cause: PS 5.1 Get-Content/Set-Content round-trips re-encoded UTF-8 as CP1252 in 3 files (profile page, overcrowding page, notifications svc)
- [x] Generic CP1252->bytes->UTF-8 decoder script cleaned all sequences (em-dash, ellipsis, arrows, checkmark, middot, section sign); scan now reports zero

### Skill Passport UI v2
- [x] Summary chips (completed/in-progress/enrolled/avg), card grid with status accent bars, animated progress bars,
      slider progress control with autosave-on-release, prominent certificate button, richer empty state

### Verification
smoke-test-v2: 32/32 | typecheck web clean | vite build green
