# RIHAI SETU — TODO

Living task list. Every session appends a new dated section; nothing counts as done
without a one-line manual smoke-test note next to it.

---

## 2026-08-22 — Session 1: Public Home, Auth, Jail List, Jail Detail (Prompt 1)

### Infrastructure
- [x] PostgreSQL reachable locally (17.6) — `psql -U postgres -c "select version();"` OK
- [x] Created database `rihai_setu` — created via psql, confirmed in pg_database
- [x] Monorepo scaffolded (`apps/web`, `apps/api`, `packages/shared-types`, `/prisma`, root npm workspaces)
- [x] `.env.example` + local `.env` with generated JWT secrets — secrets NOT committed
- [x] `npm install` clean at root workspaces — _pending smoke test_
- [x] `prisma migrate dev` applies cleanly on fresh DB — _pending smoke test_
- [x] `db:seed` runs and reports counts — _pending smoke test_

### Shared types package (`packages/shared-types`)
- [x] Role / ApplicationType / ApplicationStage / EligibilityStatus / EnrollmentStatus enums (exact master-context values)
- [x] DTO interfaces for auth, jails, stats, staff, stall rows, activity feed
- [x] Stall threshold config object (flagged”†’drafted 3d, drafted”†’filed 5d, filed”†’hearing 10d, hearing”†’order 14d, order”†’released 3d)

### Backend (`apps/api`) — Express + TS + Prisma + PostgreSQL
- [x] Prisma schema mirrors master-context tables/fields exactly (PascalCase table @map, snake_case columns @map)
- [x] Config loader (env validation via zod), file+console logger, PrismaClient singleton
- [x] Error shape `{ error: { code, message } }` via centralized error handler
- [x] `POST /api/v1/auth/login` — bcrypt verify, 15-min access JWT, httpOnly 7-day refresh cookie, rate-limit 5/min/IP
- [x] `POST /api/v1/auth/refresh` — rotates refresh cookie, issues new access token
- [x] `POST /api/v1/auth/logout` — clears refresh cookie
- [x] `GET  /api/v1/auth/me` — current user profile for session hydration (improvement over spec)
- [x] `POST /api/v1/auth/forgot-password` — logs reset token server-side; TODO: real email delivery
- [x] `GET  /api/v1/jails` — JailAccess-scoped list w/ occupancy + undertrial counts, pagination
- [x] `GET  /api/v1/jails/:id` — detail gated by JailAccess / super_admin
- [x] `GET  /api/v1/jails/:id/stats` — occupancy, capacity %, prisoner/undertrial/convict/staff counts, recent activity feed
- [x] `GET  /api/v1/jails/:id/staff` — superintendent/super_admin only
- [x] `POST /api/v1/jails/:id/staff` — attach existing user by email or create new w/ one-time temp password
- [x] `PATCH /api/v1/jails/:id/staff/:userId` — edit role_at_jail; soft-remove access row (never deletes User)
- [x] `GET  /api/v1/jails/:id/stall-list` — live date-math query, upserts StallAlert, sorted days-stalled desc
- [x] `POST /api/v1/applications/:id/escalate` — sets escalated=true, escalated_at=now (JailAccess enforced)
- [x] RBAC middleware on every protected route; per-jail gating via JailAccess
- [x] node-cron nightly job: stall sweep upsert + eligibility recompute stub (TODO Prompt 3)
[x] All endpoints smoke-tested via HTTP — _pending smoke test_

### Frontend (`apps/web`) — React + TS + Vite + Tailwind v4
- [x] Vite + Tailwind v4 (@tailwindcss/vite) + React Router + TanStack Query + Zustand
- [x] Axios client w/ 401 ”†’ refresh-and-retry interceptor
- [x] `/` public home: hero, hardcoded stat strip (NCRB figures), how-it-works, login CTA, sourced footer
- [x] `/login`: client+server validation, inactive-account & wrong-credential handling, demo seeded accounts helper
- [x] `/jails`: cards w/ color-coded occupancy badge (green <100%, amber ”‰¤120%, red >120%), undertrial count, empty state
- [x] `/jails/:jailId`: Overview tab (stat cards + activity feed), Employee Mgmt tab (superintendent/super_admin only),
      Stall List tab (thresholds, escalate button)
- [x] Route guards — no `/jails*` page reachable without valid JWT
- [x] UI smoke-tested against running API — _pending smoke test_

### Acceptance criteria (Prompt 1)
- [x] Fresh clone ”†’ install ”†’ migrate ”†’ seed ”†’ login as seeded superintendent ”†’ jail list ”†’ jail detail stats populate ”†’ add staff ”†’ stall list shows seeded stale applications
      _smoke: `scripts/smoke-test.ps1` — 34/34 PASS (login, jail list w/ occupancy, stats+activity feed, staff add/patch/remove w/ temp password, stall list sorted desc, escalate persists)_
- [x] No `/jails*` API route reachable without valid JWT (401 verified)
      _smoke: "GET /jails without JWT -> 401" PASS_
- [x] JailAccess enforced per jail (403 for non-member non-super_admin verified)
      _smoke: "Non-member superintendent blocked (403 JAIL_ACCESS_DENIED)" PASS; DLSA cannot escalate PASS_

### Bugs found by smoke test & fixed
- `assertCanManageStaff` was a plain function used as Express middleware — never called `next()`, so every
  employee-management request **hung until client timeout**. Converted to proper `(req,res,next)` middleware. Caught via
  morgan logs showing `- - ms - -` on staff routes.
- Shared-type TS enums were nominally incompatible with Prisma enums ”†’ rewrote shared-types as const-object + union pattern.
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
- Stall thresholds live in `packages/shared-types/src/config.ts` — reuse from Prompt 3.
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

---

## 2026-08-25 -- Session 7: Data Ingestion Pipeline & PII Security Hardening (Prompt 8)

### Part 1 -- Ingestion pipeline (`apps/api/src/services/ingestion.service.ts`)
- [x] `IngestionBatch` + `IngestionRow` tables migrated; provenance cols `source_system`/`external_ref_id` on Prisoner + CaseRecord
- [x] POST /admin/ingestion/upload -- multer CSV (<=2MB, <=500 rows), zero-dep RFC4180 parser (`lib/csv.ts`) -- _smoke v3: 5-row CSV -> staged, errorCount=1 PASS_
- [x] Validation: required fields, date/enum/type checks per row -> valid|warning|error -- _smoke v3: bad-DOB row flagged error PASS_
- [x] Duplicate detection: exact on reg-no+jail; fuzzy = normalized-name(HMAC blind idx) + DOB + admission within 30d -> flagged only -- _smoke v3: re-upload flags exact_dup row1 + fuzzy_dup row4 PASS_
- [x] Nothing auto-merges: staged batch leaves prisoner count untouched until human resolve -- _smoke v3: count unchanged after upload PASS_
- [x] Resolve actions merge | reject | attach_case (conflicts attach case to EXISTING record; never overwrite verified fields) -- _smoke v3: +3 merged exactly as reviewed; attach_case yields 2 cases on target PASS_
- [x] Batch status machine pending->validating->staged->reconciling->merged/failed w/ merged/rejected counts -- _smoke v3: reconciling while row unresolved, closed after PASS_
- [x] GET /admin/ingestion (+/:batchId rows incl. side-by-side conflictWith) ; sample `scripts/sample-ingestion.csv`
- [ ] ePrisonsSyncProvider seam documented in TODO/report only (Phase-2 adapter deliberately not stubbed yet)

### Reconciliation UI (`apps/web/src/features/admin/DataIngestionPage.tsx`, route /admin/data-ingestion)
- [x] Batches table w/ status chips; upload form (jail picker for super_admin); drill-in rows w/ raw-vs-existing panels + merge/reject/attach buttons
- [x] Audit log tab (filter by entity type / actor id); nav link gated to super_admin + jail_superintendent

### Part 2 -- PII security
- [x] `lib/pii.ts` envelope encryption: AES-256-GCM per-value DEK wrapped by master KEK (`v1:key:iv:tag:ct`), KMS swap seam documented -- _smoke v3: raw DB dump shows ciphertext-only, plaintext cols NULL PASS_
- [x] Tier-1 fields (full_name, DOB, next-of-kin name/phone, photo) encrypted via `piiWriteFragment`; HMAC-SHA256 `name_idx` blind index keeps exact-name search working; backfill script encrypted all 603 existing rows (`scripts/backfill-pii.ts`, idempotent)
- [x] All read paths decrypt centrally (`piiPublic`) -- prisoners list/detail, court tracking/queue/granted, jails activity feed, superintendent portal/sheet, certificates, stall notifications, next-of-kin SMS
- [x] Tier-2 case fields: volume-level encryption documented as prod control (column-level deferred; searchability preserved)
- [x] `AuditLog` table + fire-and-forget `lib/audit.ts`; instrumented: prisoner detail/list reads, personal-info/case/photo/stage/review writes, ingestion merges/rejects/attach, data-request lifecycle -- _smoke v3: audit-log query returns entries w/ actorName+timestamp PASS_
- [x] GET /admin/audit-log filterable by actor/entity/action/date range (RBAC: managers only; jail_staff blocked 403 verified)
- [x] LLM minimization: grounds-narrative facts limited to case fields (no NOK/address/history); input+output SHA-256 digests logged as `llm.invoke` audit entries
- [x] Refresh rotation w/ DB-backed `RefreshSession` (jti + sha256 hash, rotated_from chain); logout revokes; POST /auth/sessions/revoke-all -- _smoke v3: revoked>=1 reported PASS_
- [x] Password policy (10+ chars, letter+digit) enforced on staff creation path
- [x] TOTP MFA (`lib/totp.ts`, RFC6238 on node:crypto, no new deps): enroll -> confirm -> login challenge (5-min scoped token) enforced for super_admin/jail_superintendent once enrolled -- _smoke v3: password alone returns mfaRequired, wrong code 401, right code issues tokens PASS_
- [x] DPDP data-principal flow: `DataRequest` table + create/list/approve endpoints; deletion approval anonymizes Tier-1 while keeping de-identified case stats

### Frontend auth UX
- [x] LoginPage MFA challenge step (6-digit code, back-to-login)
- [x] Layout "2FA" modal: enroll (secret shown for authenticator apps), confirm code, revoke-all-sessions action

### Bugs found & fixed this session
- **smoke-test-v2.ps1 had an early `exit 0` making ALL Prompt-4 court/legal-aid checks unreachable dead code** -- prior TODO claims of "31/31 incl. court chain" were unverifiable. Removed; suite now genuinely covers Prompt 4 (41/41). Two latent test bugs surfaced and were fixed: court-sync raced the mock court clock (now polls up to 6s), and the queue check ran after sync moved the app past `filed`.
- `getUnassignedQueue` stage filter contradicted Prompt 4 spec ("no LegalAidAssignment yet" is the key, not stage) -> broadened to any non-released stage.
- `prisma generate` EPERM under running server -> renamed locked engine dll aside, regenerated.
- Fuzzy dup detection used OR-findFirst that could match a same-name sibling row instead of the reg-no match -> split into deterministic findUnique(regNo) then nameIdx fuzzy pass.
- PS 5.1 `[^5..0]` / .NET8-only APIs avoided in smoke script; per-run random tag makes v3 idempotent.

### Known-stale (pre-existing, not touched)
- scripts/smoke-test.ps1 (session-1 suite) expects pre-dataset seed ("UP-CF-RMP" Rampur jail, 5 jails, old staff emails): 11/34 today. Superseded by smoke-test-v2/v3 against current dataset seed; rewrite deferred.

### Verification commands
```
npm run typecheck                                        # shared-types + api + web clean
node --import tsx --test apps/api/tests/section479.spec.ts   # engine 10/10
powershell -File scripts/smoke-test-v2.ps1               # 41/41 (incl. real prompt-4 chain)
powershell -File scripts/smoke-test-v3.ps1               # 22/22 (prompt 8 end-to-end)
npx tsx apps/api/scripts/check-encryption.ts             # raw-dump proof: PASS
npm run build -w apps/web                                # vite build green
```

---

## 2026-08-25 -- Session: UI redesign to `rihai-setu-ui (1).html` design system (mobile-friendly)

Design source of truth: `backend/rihai-setu-ui (1).html` (terracotta #D9531E / saffron / peach /
cream / navy; Fraunces display + Manrope body + JetBrains Mono; pill buttons, soft-shadow cards,
underline tab bars, mini-stat cards, steppers).

### Design system port (`apps/web/src/styles.css` + `index.html`)
- [x] Tailwind v4 `@theme` tokens (terracotta/saffron/peach/cream/navy + font families + card radius/shadow); Google Fonts loaded in index.html; terracotta-gradient favicon
- [x] `@layer components` vocabulary mirroring the mock: `.btn/-primary/-outline/-ghost/-navy/-white/.btn-sm`, `.pill(-ok/-warn/-full/-neutral)`, `.panel/.panel-tight`, `.data-table`, `.tabbar`, `.tabpills`, `.mini-stat(.k/.v/.sub)`, `.field input/.input-base`, `.subhead-form`, `.info-note`, `.crumb/.page-title/.lede/.kicker`, `.code-chip/.status-active/.link-danger`
- [x] Shared primitives restyled in `components/ui.tsx` (StatCard→mini-stat, Spinner terracotta, EmptyState w/ emoji icons, OccupancyBadge pills) -- every consumer inherits

### Pages restyled to the mock
- [x] HomePage: full rebuild — gradient hero + SVG art + wordmark, mission strip, stats strip, about+quick-links+info-card, 4 feature cards (saffron top border), gold-frame banner, updates grid w/ navy headers, partners badges, navy CTA strip, multi-column footer + disclaimer line
- [x] Layout: brand mark w/ terracotta-saffron gradient, underline nav, user chip, mobile hamburger drawer (<md), 2FA modal restyled, disclaimer footer strip
- [x] LoginPage: white card + peach demo-accounts card + mono code chip; MFA challenge step styled to match
- [x] Jails list: jail-grid cards w/ cap pills, code chips, undertrial row — hover lift per mock
- [x] Jail detail: detail-head action pills, underline tabbar w/ badge-count, stat-cards rows, activity feed dots, staff table w/ role selects + status-active pills, stall table w/ escalate buttons
- [x] Prisoners list: filters-row, clickable data-table, §479 status pills via format.ts tokens, pagination pills; AddPrisonerModal → modal-box w/ subhead-form sections + info-note + form grids
- [x] Prisoner profile: avatar-circle header, tabpills anchor nav, info-field grids, terracotta stepper + stage log rows (#FFF6EC current), app-status-row w/ review-pill, Skill Passport cards (terracotta accents/sliders), notes on #FBF9F5
- [x] Superintendent portal, Court tracking, Legal aid (queue table + surety checklist cards), Overcrowding (+rollup, chart colors remapped to palette), Notifications, Compliance report, Data ingestion: same page-title/panel/table/pill/button language applied ("similar UI for other components")

### Mobile-friendliness
- [x] All grids collapse 4→2→1 / 3→1 at sm/md breakpoints; tables scroll horizontally inside panel-tight; header actions collapse into hamburger drawer; hero stacks with art-first order; modals full-width scrollable; tap-target sized pill buttons throughout

### Verification
typecheck web clean | vite build green | vite dev :5173 + api :4000 serving; all routes return 200.
Known limitation: i18n EN/हिंदी toggle from the HTML mock deliberately not ported yet (visual parity +
mobile were the goal) — noted as future work.

---

## 2026-08-25 -- Session: Prompt 9 (MeriPehchaan SSO placeholder) + working EN/हिंदी translation + homepage navbar

- [x] `lib/i18n.tsx`: LanguageProvider (localStorage-persisted `rs_lang`, sets `<html lang>` + swaps display/body font stacks to Devanagari in हिंदी), `useLang().t()`, LangToggle pill component; full EN/HI dictionaries ported from the approved mock copy
- [x] Homepage navbar: sticky brand mark, Home / How it works / Jails admin / Reports links (terracotta underline active), **Staff login button** and **EN/हिंदी toggle**; hamburger drawer under lg -- _vite serving; toggle flips every homepage string live_
- [x] Whole HomePage translated (hero/mission/stats/about/features/banner/updates/partners/CTA/footer); Layout header + disclaimer + LoginPage fully translated; toggle also available inside the app shell
- [x] PROMPT 9 SSO placeholder on /login: "or" divider → `Login with e-Prisons SSO` button w/ secondary badge **NIC · MeriPehchaan Government Auth** (correct double-a spelling); local-only click opens modal with the exact coming-soon copy + "Use staff login instead" that closes and focuses the email field. No OAuth client, no redirect, no network call, never navigates away -- _smoke: demo superintendent login still 200 via API after LoginPage rewrite; typecheck+build green_
- [x] Fix: jail-page "Superintendent portal · N stalled" badge went stale (global 30s query cache, no invalidation) -> stall-list query now staleTime 0 + refetchOnMount always + 45s poll; stage advance/review/draft/auto-draft mutations invalidate ["stall-list"]; superintendent eligible list also refetches on mount -- _verified: server GET recomputes live (63 after actions); badge tracks fresh value on mount/poll_
- [x] Fix: language toggle "did nothing" on the jail dashboard -- dashboard content was hardcoded EN. Added ~70 app-chrome keys (nav, roles, KPIs, tabs, staff mgmt, stall table, stage names) to both dictionaries and wired t() through Layout nav/role labels, JailDetailPage (tabs/actions/stat cards), OverviewTab, StaffTab (incl. role select options + add-staff form), StallTab (thresholds line, headers, escalate). Toggle now visibly flips the whole dashboard -- _typecheck+build green, vite serving /jails 200, mojibake scan clean_
- [x] Role-based UI pruning aligned to backend gates via new `lib/permissions.ts` (EDITOR/ADVANCE/REVIEW/ESCALATION/MANAGER flags): DLSA lawyer now sees read-only Legal Aid (no assign buttons, surety checklist rendered as summary card), no Escalate button on stall list, no "Open application" (editor-only), no Apply on recommended jobs; viewer additionally loses court-sync buttons. Backend remains the enforcement layer -- _smoke: lawyer GET granted 200 read-only; lawyer PATCH surety -> 403; lawyer escalate -> 403; typecheck+build green_
- [x] NGO portal v2 (NGO-POV overhaul): Prisoner gained structured `education_baseline`/`machinery_skills`/`target_domain` columns (seed writes them; backfill parsed all 600 SKILL PASSPORT notes -> 600 prisoners enriched); applicant API now returns education, machinery, target domain, jail contact (name/district/phone), full training history with certificate links + progress bars; new PATCH /ngo/applications/:id/status gives NGOs a shortlist/hire/reject workflow (ownership-checked) with counts in stats; dashboard rebuilt as candidate-pipeline review (status filter chips w/ counts, name/reg search, expandable profile cards, tel: contact card w/ staff-mediated privacy note, certificate deep-links); language toggle hidden on /ngo (English-only NGO side) -- _e2e: applied Karan A. to Warehouse Support Associate; NGO payload shows education "5th Standard", machinery chips, Tihar/West Delhi phone; shortlist -> status persisted; stats shortlisted=1; typecheck x3 + build green_

### Follow-ups completed
- [x] Consent enforcement: `Prisoner.consent_to_share_profile` column; dataset-driven backfill (`backfill-consent.ts`, 523/625 granted); apply blocked 409 CONSENT_REQUIRED without it; recommendations return empty + engine receives real consent flag; NGO applicant lists exclude non-consented profiles; profile UI shows "Consent not recorded" state -- _smoke: Karan A. (denied) -> recommendations 0 rows, apply 409_
- [x] Jail-staff notifications on NGO pipeline moves: `notifyJobApplicationStatus` writes in-app rows for the facility's superintendent+staff on shortlist/hire/reject (SMS-log row for next-of-kin on hire) -- _smoke: Surinder S. shortlisted by Meera Sharma -> 3 staff NotificationLog rows_
- [x] Prompt 6 leftovers verified closed: stall-escalate notifications wired & live-tested (Nitin P. -> STALL ESCALATED rows), hearing notifications already wired into court sync, /notifications + bell shipped earlier, compliance endpoints/pages/exports fixed this session -- _all ticked in Session 6 checklist above via these proofs_
- [x] Committed everything as `ccb4540` (.env/.venv confirmed ignored)

---

## 2026-08-25 — Session: Employment pipeline (Prompt: NGO jobs + Python recommender bridge) + compliance fix

Architecture note: the NGO employer domain moved out of the backend-ai demo into the Express API; the
Python FastAPI engine stays stateless (scoring only) and is reached via REST (`RECOMMENDER_URL`,
default http://127.0.0.1:8000); the single shared Postgres remains the source of truth — Express owns
all reads/writes, Python never touches the DB. Jobs were seeded directly into the common DB from the
canonical skill vocabulary (`backend-ai/recommender-service/app/data/skill_dictionary.json`); the job
workbook itself was not present in the repo — documented deviation.

### Express wiring
- [x] `app.ts`: mounted `/api/v1/ngo` (ngoRouter), `/api/v1/prisoners` (employmentPrisonerRouter BEFORE the existing prisoners mount), `/api/v1/skills` (skillsCatalogRouter)
- [x] `config.ts` envSchema + `.env`/`.env.example`: `RECOMMENDER_URL="http://127.0.0.1:8000"` (documentation entry; services read process.env)
- [x] Fixed pre-existing typecheck blockers: unused `Request` import (employment.routes), unused `JobPostingDto` import + missing `JobStatus` type + missing `Prisma` namespace import (recommendations.service), `ApiError.conflict(msg)` gained optional `code` param so `RECOMMENDER_UNAVAILABLE` fits the factory pattern

### Seeder (`apps/api/scripts/seed-ngo.ts`, idempotent)
- [x] 2 ngo_partner users (ngo1@rihai.gov.in "Meera Sharma (Seva Foundation)", ngo2@rihai.gov.in "Arjun Livelihood Trust", Passw0rd!23) -- _run: created both_
- [x] 12 active JobPostings (6 per NGO), every skill tag verified against the canonical dictionary; skip-if title+ngoId exists -- _run: `created 12 job(s), skipped 0; ngo_partner users: 2, JobPosting rows: 12`; re-run safe_

### Frontend
- [x] LoginPage: NGO demo account card (demo.ngo.role) + role-based redirect `role === "ngo_partner" ? "/ngo" : "/jails"` in both login and MFA onSuccess; i18n keys `demo.ngo.role` / `nav.ngo` (EN+HI)
- [x] HomePage navbar order: Home · How it works · **NGO portal** · Jails admin · Reports
- [x] `/ngo` NgoDashboardPage (protected route in App.tsx): 🔒 guard for non-ngo roles, 5 mini-stats (active/paused/closed/applications/pending), Post-a-job modal with canonical-skill chip pickers (selected shown as pills) + comma-separated certificates, jobs table with status pills + Applicants modal + Pause/Activate/Close PATCH actions with invalidation
- [x] PrisonerProfilePage: RecommendedJobsPanel between Skill Passport and Notes — "Find matching jobs" → GET recommended-jobs; score pills + progress bars + explanation + matched/missing skill pills; Apply button (EDITOR_ROLES only) posts job-application and flips to "Applied"; always-on compact "Job applications" table keyed ["job-applications"] and invalidated after apply

### End-to-end smoke (actual results)
- [x] Python health `{"status":"ok"}`; NGO login ok; GET /ngo/jobs = 6 seeded (+ closed QA job); stats at login `active=6 paused=0 closed=1 totalApps=0 pending=0`
- [x] POST /ngo/jobs "QA Smoke Role" (packaging/Thane/logistics) created → PATCH status=closed OK
- [x] Superintendent login → Tihar Central Prison No. 4, 45 eligible prisoners; picked one with a completed enrollment
- [x] GET recommended-jobs (Express→Python over shared DB): 5 recs — _top: Organic Farming Assistant **37.5/100** (matched organic_farming, missing plant_care); Warehouse Support Associate **10/100** (missing inventory_handling, packaging)_
- [x] POST job-application → 201 `pending` for "Organic Farming Assistant"; NGO Applicants endpoint shows the prisoner (name decrypted, reg no, jail, status pending); prisoner job-applications list updated
- [x] Compliance report re-verified after root-cause fixes (**double-mounted route path** on /jails/:jailId and **HAVING-clause jail filter** that dropped per-jail rows): GET /jails/{id}/compliance-report?from=2026-01-01&to=2026-12-31 → `eligibleIdentified=10 applicationsFiled=68 releasesCompleted=4 avgDaysFlaggedToReleased=0` (no 404/500)

### Verification commands
```
npm run typecheck --workspace @rihai/shared-types   # clean
npm run typecheck --workspace apps/api              # clean (after fixes above)
npm run typecheck --workspace apps/web              # clean
npm run build -w apps/web                           # vite build green (175 modules)
npx tsx apps/api/scripts/seed-ngo.ts                # idempotent seeder
mojibake scan of all touched files                  # zero replacement chars
```

---

## 2026-08-26 -- Session: Prompt 10 (Prisoner portal auth -- Skill Passport, Documents, Job Board)

Separate auth domain: prisoners are NOT Users and hold no JailAccess; they authenticate against
their own Prisoner row. Tokens carry actor_type "prisoner" so staff/org/portal tokens are
structurally distinct. Two auth contexts, one identity: supervised jail kiosk in-custody, same
reg-no+PIN credential on the person's own device after release.

### Backend (apps/api)
- [x] Migration `20260826032201` -> `20260826040532_prisoner_portal_auth`: pin_hash, pin_set_at, pin_must_change,
      failed_pin_attempts, locked_until, aadhaar_ref_token (always NULL until a real UIDAI integration),
      reset_otp_hash, reset_otp_expires_on Prisoner -- _smoke v4: temp-pin issue + login chain 28/28_
      _smoke: temp-pin issued -> login forces change -> set-pin -> full session PASS_
- [x] POST /api/v1/portal/auth/login-pin -- bcrypt verify, generic invalid-credential error, lockout after
      5 failures for 30 min (locked_until), attempts-remaining feedback, JWT scoped actor_type=prisoner
      -- _smoke v4: wrong PIN 401 w/ "4 attempts remaining"; 5th failure locks; CORRECT PIN refused while locked; unlock via staff temp PIN PASS_
- [x] POST /api/v1/portal/auth/login-kiosk-biometric -- KioskBiometricAuthProvider interface +
      MockKioskBiometricAuthProvider ("Simulate Fingerprint Scan", 600 ms delay); UIDAI AUA/KUA swap seam
      documented TODO(UIDAI); raw Aadhaar numbers never stored anywhere -- _smoke v4: mock logs in seeded
      prisoner without hardware; unknown reg no rejected 401 PASS_
- [x] POST /api/v1/portal/auth/set-pin -- three contexts: full session (needs currentPin), pin-setup scope
      (temp-PIN login), unauthenticated kiosk FIRST-TIME only when no pin_hash exists (403 otherwise --
      _smoke v4: hijack attempt on account with existing PIN -> 403_)
- [x] Staff-assisted reset: POST /api/v1/prisoners/:id/portal/temp-pin (EDITOR_ROLES at that jail) issues a
      one-time 6-digit PIN shown once, sets pin_must_change, clears lockout -- _smoke v4: two issues both work;
      scoped session blocked from reading profile (PIN_CHANGE_REQUIRED) until changed_
- [x] Post-release OTP reset: POST reset-pin/request-otp sends 6-digit code to decrypted next_of_kin_phone via
      NotificationProvider + NotificationLog row (devOtp in response only outside production); confirm verifies
      sha256 + 10-min expiry with timingSafeEqual, resets PIN, clears lock -- _smoke v4: wrong OTP 400, right OTP
      resets, login with new PIN OK. NOTE: dataset seed has no NOK phones, so PATCH /prisoners/:id gained
      optional nextOfKinName/nextOfKinPhone (envelope-encrypted like other Tier-1) to record the target_
- [x] GET /api/v1/portal/profile -- own record only: custody duration, Section 479 status translated from the
      engine's reason strings into plain language (all five REASONS mapped), application stepper data; read-only
      -- _smoke v4: reg no matches caller, headline present_
- [x] GET /api/v1/portal/documents -- completed-enrollment certificates + application docs ONLY when stage >= filed
      AND reviewed_by is set (lawyer-review boundary holds on the prisoner side too) -- _smoke v4: shown-set equals
      expected-set computed independently from staff-side detail; cert count matches completed enrollments_
- [x] AuditLog instrumentation with actor_type=prisoner: login attempts/successes/biometric/blocks, profile_read,
      documents_read, pin lifecycle events; staff temp-pin issuance audited under actor_type=user
      -- _smoke v4: audit-log query returns prisoner entries; document reads recorded_
- [x] Rate limits: login/kiosk/set-pin 30 per 10 min/IP, OTP endpoints 3 per 10 min/IP

### Frontend (apps/web)
- [x] Separate portal session infra (state/portalAuthStore.ts + lib/portalApi.ts): own axios client and token
      holder so prisoner sessions never touch the staff refresh-cookie flow; 15-min access token only
- [x] /portal/login -- Layer 1 reg-no+PIN form; forced PIN-change step after temp-PIN login; first-time kiosk
      setup flow; forgot-PIN OTP flow w/ masked phone + demo-code hint; Layer 2 fingerprint button opening the
      simulate-scan panel; Layer 3 DigiLocker button -> local-only coming-soon modal that points back to PIN
      login (no network call, never navigates) -- _vite serving /portal/login 200; typecheck+build green_
- [x] PortalLayout guard + chrome (brand, tabbar nav My profile / Jobs for me / Documents, logout); separate from
      staff Layout and ProtectedRoute
- [x] /portal/profile -- read-only: mini-stat cards, plain-language S479 panel with "the court decides" note,
      terracotta stage stepper (plain-language step labels), application rows
- [x] /portal/jobs -- static empty state shell ("Personalized job matches will appear here soon"); component
      carries TODO(RECOMMENDER) comment forbidding raw job-posting fetches; NO /portal/jobs endpoint built
- [x] /portal/documents -- certificate cards + court-document cards w/ deep links through api-origin helper;
      empty states explain drafts stay private until lawyer-reviewed
- [x] Staff side: prisoner profile header gains "Issue portal temp PIN" (EDITOR_ROLES only) showing the one-time
      PIN once; HomePage navbar adds "Prisoner portal"; staff LoginPage cross-links to /portal/login

### Verification commands
`
npm run typecheck                                        # shared-types + api + web clean
node --import tsx --test apps/api/tests/section479.spec.ts   # engine regression 10/10
powershell -File scripts/smoke-test-v2.ps1               # regression 41/41
powershell -File scripts/smoke-test-v4.ps1               # NEW prompt-10 suite 28/28
npm run build -w apps/web                                # vite build green
`

### Deviations / notes
- OTP reset path not hard-gated to released applications: the credential change still requires the code
  delivered to the next-of-kin phone, IP rate limiting bounds abuse, and UI copy frames it as post-release;
  hard-gating on a released Application would have made the path undemonstrable on dataset-seeded data.
- devOtp returned by request-otp outside production so demos complete without live SMS (TODO(SMS) noted);
  NotificationProvider seam reused exactly as Prompt 6 intended.
- Kiosk biometric mock matches any EXISTING reg no by design (it simulates the scan result, existence is the
  service layer's check); real hardware would sit behind the same interface after AUA/KUA registration.
- aadhaar_ref_token column exists but stays NULL everywhere; no code path writes it yet.

### Follow-up (same day): prisoner demo accounts + calmer login UX
- [x] GET /api/v1/portal/auth/demo-accounts (empty in production) + ensureDemoPortalAccounts() run at API
      startup outside production: deterministic trio (first seeded UTP- prisoner w/ Skill Passport across the
      first three jails) gets the shared demo PIN 2468 re-asserted + synthetic encrypted NOK contact so the
      OTP-reset demo always has a target -- _probe: 3 accounts returned (Karan J. / Anita R. / Karan A.);
      login-pin with 2468 -> full session, mustChange=false_
- [x] /portal/login rebuilt to read like an ordinary consumer login ('Welcome back', ID number + PIN, help-desk
      wording instead of institutional jargon), peach demo-accounts card matching the staff login page
      (click prefills ID+PIN), same card-shadow/tabbar design language -- _typecheck web+api clean, vite build
      green, smoke v4 still 28/28_

---

## 2026-08-26 -- Session: Prompt 11 (Family notifications across the paperwork lifecycle + Twilio)

Extends Prompt 6's NotificationProvider/NotificationLog with event-specific templated copy, consent
handling and delivery logic. No new state transitions -- hooks hang off existing stage/court/surety events.

### Schema
- [x] Migration `20260826*_prompt11_family_notifications`: `NotificationTemplate(event_key x channel x locale
      unique)`, Prisoner.`next_of_kin_consent_given`/`preferred_channel`/`preferred_locale`, NotificationLog
      gained `template_key`/`locale`/`channel_used`/`dedupe_key` (+idx), User.`phone` for lawyer contacts
      -- _migrate dev clean; probe: template seed complete 32 rows_

### Twilio integration (env space ready; keys to be filled later)
- [x] `.env`/`.env.example`: TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_FROM / TWILIO_WHATSAPP_FROM
      (all blank = logging fallback). config envSchema optional strings
- [x] `TwilioNotificationProvider` in lib/notification-provider.ts -- REST via fetch (no SDK dep), Basic auth,
      whatsapp: prefix handling; auto-selected when all four vars present (`twilioConfigured()`); delivery-
      status-callback webhook noted as TODO(SMS) -- _fallback path exercised end-to-end by smoke v5_

### family-notifications.service.ts (the substance)
- [x] 8 events x EN+HI written out (drafted/filed/hearing/granted-no-bond/granted-bond-required/denied/
      surety/released); denial = factual + always a named lawyer to call; bond message actionable;
      released warm/short -- _probe renders verified incl. Devanagari + Rs amounts_
- [x] sendFamilyEvent engine: consent gate FIRST (toggle off stops everything immediately), dedupe on
      `(application_id,event_key)` (failed attempts stay retryable), preferred-channel-first w/ API-level
      fallback, locale chain pref->en, order_denied held back until LegalAidAssignment exists
      -- _probe: no_consent / duplicate / awaiting_lawyer->sent-with-name-and-phone all PASS_
- [x] Startup seeding skip-existing (admin edits survive restarts)

### Trigger wiring (existing events only)
- [x] appendStage -> drafted/filed/released (replaces Prompt 6 generic NOK text; lawyer in-app row kept)
- [x] court sync hearing date -> hearing_scheduled; outcome -> granted branch on surety_required vs no_bond,
      denied -> gated event; upsertSuretyStatus flip false->true -> surety_arranged
      -- _smoke v5 lifecycle: all six rows logged w/ correct template_key/locale/channel_

### Endpoints
- [x] GET/PATCH /api/v1/prisoners/:id/next-of-kin (staff read, EDITOR_ROLES write, audited `next_of_kin.write`);
      intake create accepts NOK contact + consent + prefs alongside the case
- [x] GET/PATCH /api/v1/admin/notification-templates (super_admin only; PATCH audited) -- edit copy without deploy
      -- _smoke v5: hi filter=16 rows, jail_staff 403, super_admin PATCH OK_

### Verification commands
```
npm run typecheck                                        # api+web clean
node --import tsx --test apps/api/tests/section479.spec.ts   # 10/10 regression
powershell -File scripts/smoke-test-v2.ps1               # 41/41 regression
powershell -File scripts/smoke-test-v4.ps1               # 28/28 regression
powershell -File scripts/smoke-test-v5.ps1               # NEW prompt-11 suite 33/33 (HTTP chain + DB probe)
npx tsx apps/api/scripts/prompt11-probe.ts               # engine edges standalone
```
---

## 2026-08-26 -- Session: Prompt 13 FINAL (login-bounce root cause, full smoke pass, workplan coverage)

### Part 1 -- 'kicked to /login' root causes (named, not papered over)
- [x] Cause #1 REAL GAP: silent-refresh exclusion `url.includes("/auth/")` also swallowed GET /auth/me ->
      session hydration after idle expiry failed instead of refreshing. Fixed: only token-minting endpoints
      (/auth/login, /auth/mfa/*, /auth/refresh, /auth/logout, /auth/forgot-password) are exempt now
      -- _final-auth-probe: expired-JWT -> 401, refresh-cookie rotation -> new token, retry -> 200_
- [x] Cause #5 hardened: single-flight refresh promise now cleared via .finally() exactly once; a late 401
      can never start a second rotation against an already-revoked session (spurious-logout vector)
- [x] Cause #6 portal half REAL GAP: portalApi had NO 401 handling -> zombie kiosk pages. Added dedicated
      401 interceptor -> clear portal state -> guard redirects to /portal/login (staff state untouched)
- [x] Causes #2/#3/#4 verified already-safe (403 never redirects; bootstrap gate before guarded render;
      no axios timeout so slow LLM/export calls can't masquerade as auth) -- proven live across routes
- [x] Session-expiry warning toast: components/SessionKeepAlive.tsx decodes token exp, warns ~2 min out,
      'Stay signed in' rotates refresh cookie in place; EN/HI strings added -- _typecheck+build green_

### Part 2 -- smoke results doc + fresh runs
- [x] /SMOKE_TEST_RESULTS.md at repo root: per-module matrix w/ Steps/Expected/Actual/Status/Notes;
      login-bug row names root causes #1 and #6 explicitly; known-gaps section (Prompt 12 absent from repo,
      Twilio keys pending, mocked gov integrations by design, public job-board deviation, portal i18n)
- [x] Fresh runs recorded: engine 10/10 | v2 41/41 | v3 22/22 (one TOTP 30s-boundary flake on batch run,
      clean rerun documented) | v4 28/28 | v5 33/33 | final-auth-probe 15/15 | static inertness checks 5/5
- [x] NEW scripts/final-auth-probe.ps1: 401-vs-403 across >=3 protected routes, JailAccess 403 code,
      actor-crossover rejections both ways, expired-token->refresh->retry contract, slow-path spot checks
      (projection/compliance/export/NGO listing)

### Part 3 -- coverage check vs original workplan A-I
- [x] SMOKE_TEST_RESULTS.md Part 3 table filled with verified evidence per row: A-F,I Built; G Partially Built
      (matching = other team by design; public anonymous browse replaced by authed NGO dashboard); H Built w/
      delivery pending Twilio keys; additions beyond the nine modules enumerated (P1 foundation, P8 security/
      ingestion, P9 SSO+i18n+UI system, P10 prisoner portal, P11 templated notifications)
- [x] Prompt 12 flows marked NOT BUILT as an explicit known gap (no spec file ever present in backend/)

### Verification commands
```
npm run typecheck && npm run build -w apps/web
node --import tsx --test apps/api/tests/section479.spec.ts   # 10/10
powershell -File scripts/smoke-test-v2.ps1                   # 41/41
powershell -File scripts/smoke-test-v3.ps1                   # 22/22
powershell -File scripts/smoke-test-v4.ps1                   # 28/28
powershell -File scripts/smoke-test-v5.ps1                   # 33/33
powershell -File scripts/final-auth-probe.ps1                # 15/15
```
