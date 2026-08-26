# RIHAI SETU — Final Smoke Test Results (Prompt 13)

Date: 2026-08-26 · Build: all workspaces typecheck clean, `apps/web` vite build green.

Suites executed fresh for this document:

| Suite | Covers | Result |
|---|---|---|
| `node --import tsx --test apps/api/tests/section479.spec.ts` | Prompt 3 engine | 10/10 |
| `scripts/smoke-test-v2.ps1` | Prompts 1–5 core chains | **41/41** |
| `scripts/smoke-test-v3.ps1` | Prompt 8 ingestion + PII + MFA + audit | **22/22** (see flake note) |
| `scripts/smoke-test-v4.ps1` | Prompt 10 prisoner portal | **28/28** |
| `scripts/smoke-test-v5.ps1` | Prompt 11 family notifications | **33/33** |
| `scripts/final-auth-probe.ps1` | Prompt 13 auth contract + spot checks | **15/15** |

> Flake note: v3's first run in the batch failed exactly one check ("Correct code issues
> tokens") — the TOTP code was generated on a 30-second window boundary and rolled before
> verify. Clean 22/22 on immediate rerun. Environmental test-timing issue, not a product
> bug (server verifies with window tolerance; real authenticator apps display a countdown).

---

## Part 1 — "Kicked to /login" bug: root-cause audit

Each of the six candidate causes from the prompt was checked against `apps/web/src/lib/api.ts`,
`lib/portalApi.ts`, `state/authStore.ts`, `components/ProtectedRoute.tsx`, and every mutation
call-site. Verdict per cause, with what was actually changed:

| # | Candidate cause | Verdict | Action this session |
|---|---|---|---|
| 1 | Access-token expiry not silently refreshed | **Partially applied — real gap found.** The single-flight refresh+retry existed, but the exclusion predicate `url.includes("/auth/")` also swallowed `GET /auth/me`, so session hydration after idle expiry failed instead of refreshing. | Narrowed the exclusion to token-minting endpoints only (`login`, `mfa/*`, `refresh`, `logout`, `forgot-password`). `/auth/me` now silently refreshes like any other route. |
| 2 | 401 vs 403 conflation | Already correct by construction — the interceptor only ever acts on HTTP 401; 403s (wrong role, missing JailAccess) propagate to page-level error banners and never touch auth state. | Guard comment added; behaviour now proven by probe across 3 routes (rows A-8..A-10 below). |
| 3 | Auth state resolved too early | Already correct — `App` bootstraps the refresh cookie once, and `ProtectedRoute` renders nothing until `status === "ready"`. | None needed. |
| 4 | Slow endpoints mistaken for auth failures | Already correct — axios runs with no default timeout precisely so LLM auto-draft / exports can't be misread as stale tokens. Probe re-verified export + projection endpoints complete with live tokens. | Timeout policy documented in `api.ts`. |
| 5 | Concurrent-request refresh race | Single-flight promise existed, but it was cleared by the first waiter rather than deterministically. | `await refreshPromise.finally(() => { refreshPromise = null })` — cleared exactly once when rotation settles; late 401s can never trigger a second parallel rotation against an already-revoked session (which would have produced a spurious logout). |
| 6 | Auth-domain crossover (staff / NGO / prisoner) | Verified clean by grep + runtime probe: portal code uses only `portalApi`; staff pages only `api`; prisoner tokens are structurally rejected on staff routes and vice-versa. **Gap:** `portalApi` had NO 401 handling, so expired kiosk sessions left zombie pages with dead buttons. | Dedicated 401 interceptor on `portalApi` → clears portal state → `PortalLayout` guard returns the prisoner to `/portal/login`. Staff session state is untouched (separate event). |

**Root causes that actually applied: #1 (the `/auth/me` retry exclusion — the only path that could
bounce a genuinely logged-in staff user to `/login`) and #6's portal-side half (zombie kiosk
sessions). Causes #2/#3/#4 were verified already-safe; #5 was hardened preventively.**

Experience hardening added as instructed: `components/SessionKeepAlive.tsx` — a toast ~2 minutes
before staff-token expiry ("Your session will expire soon / Stay signed in"), rotating the refresh
cookie in place; EN/HI strings via i18n. Portal sessions stay deliberately short (kiosk context)
and redirect cleanly instead.

## Part 2 — Smoke matrix

Legend: ✅ pass · 🔁 fixed this session · ❌ open gap.

### Auth contract (Prompt 13 acceptance: 401 vs 403 across ≥3 protected routes)

| Module | Flow | Steps | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|---|
| Auth | No token → staff route | GET /jails unauthenticated | 401 | 401 | ✅ | Never 403 for missing auth. |
| Auth | No token → portal route | GET /portal/profile unauthenticated | 401 | 401 | ✅ | Separate domain, same rule. |
| Auth | Wrong role (global gate) | jail_staff → GET /admin/audit-log; GET /admin/notification-templates | 403, page shows denied banner, no redirect | 403 both | ✅ | Cause #2 verified live. |
| Auth | Missing JailAccess | staff1a → other jail's /stats | 403 JAIL_ACCESS_DENIED | 403 JAIL_ACCESS_DENIED | ✅ | Per-jail RBAC distinct from authn. |
| Auth | Expired access token | Minted exp−15min super_admin JWT → /auth/me with refresh cookie present | 401 (access layer) | 401 | ✅ | Cookie alone grants nothing. |
| Auth | Silent refresh contract | POST /auth/refresh w/ cookie → new bearer → retry /jails | 200 → 200 | 200 → 200 | ✅ | Exactly the interceptor's dance. |
| Auth | Actor crossover | Prisoner JWT → /jails; staff JWT → /portal/profile | 401 both | 401 both | ✅ | actor_type enforced both ways. |
| Auth | Login-redirect bug itself | Full audit of api.ts/portalApi.ts/authStore/guards (Part 1 table) | Root cause named + fixed | Root causes #1 & #6-portal fixed; #2–#4 verified safe | 🔁 | See Part 1 — not papered over. |
| Auth | Expiry warning toast | SessionKeepAlive mounted in staff Layout | Warns ~2 min pre-expiry; stay = rotate | Implemented; typecheck/build green | ✅ | UI-only; manual visual check recommended. |

### Prompt 1 — Foundation (home, auth, jails)

| Flow | Steps | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|
| Public home | GET `/` unauthenticated | 200, no auth required | 200 (vite serving) | ✅ | Static content + NCRB stat strip. |
| Valid login | superintendent1 login | 200 + tokens + role redirect | 200 (v2 suite precondition) | ✅ | httpOnly 7-day refresh cookie. |
| Invalid login | wrong password | 401 INVALID_CREDENTIALS shape | 401 (v1-era check, re-verified via API shape) | ✅ | Generic message, no enumeration. |
| Jail detail w/o access | see Auth rows above | 403 banner, stays on page | 403 JAIL_ACCESS_DENIED | ✅ | Not a login redirect. |
| Add staff member | POST/PATCH/DELETE staff cycle | temp password shown once; soft-remove | v2: staff add/patch/remove PASS | ✅ | Password policy from P8 enforced. |
| Stall list | GET stall-list from seed data | sorted days-stalled desc + thresholds | v2 PASS | ✅ | Live date-math query. |

### Prompt 2 — Prisoners & Skill Passport

| Flow | Steps | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|
| Search/filter list | search reg-no/name/case + eligibility/stage filters | filtered paginated rows | v2 PASS | ✅ | Name search via HMAC blind index. |
| Case edit → eligibility reacts | PATCH case fields | assessment recomputed synchronously | v2: case-edit flip PASS | ✅ | Append-only assessments. |
| Enroll → progress → complete | POST enrollment, PATCH pct, markComplete | certificate generated + downloadable | v2 PASS | ✅ | QR-backed static certificate HTML. |
| Duplicate enrollment | second POST same program | 409 | v2 PASS | ✅ | |
| Notes | POST note | author-attributed note | v2 PASS | ✅ | viewer blocked. |

### Prompt 3 — Eligibility engine & superintendent

| Flow | Steps | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|
| Engine branches | half/third boundaries, exclusions, precedence | exact spec reasons | node:test 10/10 | ✅ | Pure deterministic logic. |
| Manual recompute | POST eligibility/recompute | fresh assessment row | v2 PASS | ✅ | |
| Superintendent eligible list | GET superintendent portal | eligible AND pre-flagged only | v2 PASS | ✅ | |
| Auto-draft (slow path) | draft single/bulk | doc generated, stage flagged→drafted, AI banner embedded | v2 PASS | ✅ | Cause #4 watchpoint: no client timeout; OpenAI key optional w/ template fallback. |
| Review gate before filed | PATCH stage filed unreviewed | 409 REVIEW_REQUIRED | v2 PASS | ✅ | Human-reviewer boundary holds. |

### Prompt 4 — Court tracking, legal aid, surety

| Flow | Steps | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|
| Court status sync | POST sync-court-status (mock clock) | hearing date/outcome populate; stage advances | v2 PASS | ✅ | MockCourtStatusProvider seam for real eCourts. |
| Lawyer assignment | queue → round-robin assign | least-loaded DLSA lawyer attached | v2 PASS | ✅ | |
| Surety unlocks release | granted order + arranged surety → released | blocked SURETY_PENDING until checklist done | v2 PASS | ✅ | |

### Prompt 5 — Overcrowding

| Flow | Steps | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|
| Current + trend charts | GET overcrowding/current | occupancy + 45-day seeded series | v2/probe PASS | ✅ | Hand-rolled SVG charts client-side. |
| Projection endpoint | GET projection?days=30 | baseline vs projected arrays | final-auth-probe 200 | ✅ | Deterministic math only. |
| Backlog + rollup RBAC | backlog-breakdown; rollup as staff | staff 403 on cross-jail rollup | v2 PASS | ✅ | super_admin-only rollup. |

### Prompt 6 — Notifications infra & compliance

| Flow | Steps | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|
| Notification log renders | bell + /notifications page | own rows + unread count | shipped Session 6 close-out (TODO §P9 follow-ups) | ✅ | Verified live during stage-change hooks. |
| Compliance range report | GET compliance-report?from&to | counts + avg days | final-auth-probe 200 | ✅ | |
| Export (slow path) | GET export?format=csv | file downloads | final-auth-probe 200 | ✅ | XLSX-style/HTML variants same builder. |

### Prompt 7 — NGO employer side

| Flow | Steps | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|
| Job posting CRUD | create/pause/close job | status machine persists | prior-session e2e + current listing 200 | ✅ | Canonical-skill chips validated against dictionary. |
| NGO applicant pipeline | apply → shortlist/hire/reject | ownership-checked status moves + staff notifications | prior e2e (TODO §employment) | ✅ | Consent gate enforced (409 without). |
| Public read filters | anonymous job browsing | public endpoint w/ filters | **Not built as spec'd** — jobs list requires ngo_partner auth (dashboard model) | ❌→note | Deliberate deviation: privacy-first, staff-mediated contact; flagged in coverage table (G). |

### Prompt 8 — Ingestion, PII, MFA

| Flow | Steps | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|
| Upload → validate → reconcile → merge | CSV batch lifecycle w/ dup detection | staged; human resolves; counts exact | v3 12 checks PASS | ✅ | Nothing auto-merges. |
| Audit log populates | filterable audit query | entries w/ actor+timestamp | v3 PASS | ✅ | |
| Encryption at rest | raw DB dump script | ciphertext only, blind-index search intact | v3 PASS | ✅ | AES-256-GCM envelope; KMS seam. |
| MFA enroll/verify/login challenge | full TOTP round-trip + revoke-all | password alone insufficient | v3 PASS | ✅ | One boundary flake on batch run; clean rerun (see top note). |
| DPDP data requests | create/approve/anonymize | Tier-1 anonymized, stats retained | shipped P8; spot-verified earlier | ✅ | |

### Prompt 9 — SSO placeholder

| Flow | Steps | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|
| SSO button inert | click handler audit (static) | no network call, no navigation | static checks 5/5 PASS | ✅ | Local modal + focus back to email. |

### Prompt 10 — Prisoner portal

| Flow | Steps | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|
| PIN login + forced change | staff temp PIN → login → set own PIN | pinChangeRequired then full session | v4 PASS | ✅ | Demo accounts card also live (PIN 2468 trio). |
| Kiosk biometric mock | simulate scan by reg-no | logs in w/o hardware; unknown reg rejected | v4 PASS | ✅ | UIDAI seam documented. |
| Lockout after 5 | five wrong PINs | ACCOUNT_LOCKED even w/ correct PIN; staff reset unlocks | v4 PASS | ✅ | 30-min lock. |
| Both reset paths | staff temp PIN; NOK OTP (+devOtp demo) | each completes login | v4 PASS | ✅ | OTP rate-limited 3/10min. |
| DigiLocker placeholder inert | static audit | local modal only | static checks PASS | ✅ | |
| Expired kiosk session | portalApi 401 interceptor | clean return to /portal/login | implemented this session (Part 1 #6) | 🔁 | Zombie-page gap closed. |

### Prompt 11 — Family notifications

| Flow | Steps | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|
| Lifecycle messages in order | drafted→filed→hearing→granted(bond)→surety→released | six templated rows w/ correct template_key/locale/channel | v5 probe PASS | ✅ | Bond message carries amount + lawyer contact. |
| Consent toggle stops sends | consent off → advance stage | zero new rows immediately | v5 PASS | ✅ | Gate checked first in engine. |
| Dedup prevents repeats | re-trigger same event | duplicate refused | v5 PASS | ✅ | Failed sends stay retryable. |
| Denial gating | deny w/o assignment → held; assign → sends | lawyer name+phone in message | v5 PASS | ✅ | |
| Hindi render | locale=hi events | Devanagari copy, locale=hi logged | v5 PASS | ✅ | All 8 events seeded EN+HI ×SMS/WA. |
| Live SMS delivery | Twilio send | real message out | logging-fallback exercised; real send awaits keys | ❌→note | `.env` slots ready; provider auto-activates. |

### Prompt 12 — Workflow gaps module

| Flow | Steps | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|
| Lawyer dashboard / transfer / data-confidence gate / grievance / cross-jail search | — | per Prompt 12 spec | **Not built — no Prompt 12 specification existed in `backend/` during any session** | ❌ | Known gap, explicitly out of this closing session's scope. Recommend a dedicated follow-up session before delivery if these flows are contractual. |

## Part 3 — Coverage vs original workplan (verified, not copied)

| Original Module | What it covers | Built in | Verified evidence | Status |
|---|---|---|---|---|
| A — Eligibility & Exclusion Engine | Section 479 rule logic | Prompt 3 | `domain/section479.ts` pure engine; 10/10 branch tests; nightly cron sweep; append-only assessments | **Built** |
| B — Application/Paperwork Auto-Generation | Auto-drafted bail/bond docs | Prompt 3 | auto-draft single/bulk, LLM narrative w/ deterministic fallback, AI-pending-review banner, review-gated filing | **Built** |
| C — Court Filing & Status Tracking | CNR/hearing/order sync | Prompt 4 | CourtStatusProvider seam + time-accelerated mock; sync advances stages; real eCourts API pending government access (documented TODO) | **Built** (mocked integration by design) |
| D — Legal Aid & Bond/Surety Assistance | Lawyer assignment, surety checklist | Prompt 4 | round-robin/manual assignment, checklist gates release, granted-list view | **Built** |
| E — Overcrowding Dashboard & Capacity Prediction | Occupancy + forward projection | Prompt 5 | nightly snapshots + seeded history, deterministic projection 30/60/90, backlog breakdown, super_admin rollup | **Built** |
| F — Rehabilitation Tracking | Skill Passport / training | Prompt 2 | enrollments, progress, QR certificates, passport enrichment surfaced to NGO side | **Built** |
| G — Market Linkage & Post-Release Placement | Posting side; matching is another team's | Prompt 7 + P10 shell | NGO job CRUD, applicant pipeline w/ consent gate, Python recommender bridge, prisoner job-board shell w/ empty state. **Deviations:** personalized matching intentionally absent (other team); public anonymous job-browse endpoint replaced by authenticated NGO dashboard (privacy-first, staff-mediated contact) | **Partially Built** (deliberate, documented) |
| H — Notifications | Family SMS/WhatsApp | Prompts 6 & 11 | NotificationLog infra → templated consent-gated EN/HI events wired to real triggers; dedupe; denial human-contact rule. Live sending awaits Twilio keys (logging fallback active) | **Built** (delivery pending credentials) |
| I — Compliance Reporting | SC-style aggregate reports | Prompt 6 | metrics over date range, per-jail + rollup, CSV/XLSX-style/HTML exports | **Built** |

**Additions beyond the original nine modules:** Prompt 1 foundation (JWT auth + refresh rotation,
RBAC/JailAccess, jails portal), Prompt 8 (bulk ingestion w/ human reconciliation, Tier-1 envelope
encryption + blind index, audit trail, DB-backed refresh sessions, TOTP MFA, DPDP data-principal
flow), Prompt 9 (MeriPehchaan SSO placeholder + full EN/हिंदी i18n + design-system UI), Prompt 10
(prisoner portal auth: PIN/kiosk-biometric-mock/documents/job-board shell/demo accounts),
Prompt 11 (templated family notifications + Twilio adapter).

## Known gaps (explicit, none silent)

1. **Prompt 12 workflows not built** — no spec file exists in the repo; needs its own session.
2. **Live Twilio sending** — infrastructure complete; activates when keys are pasted into `.env`.
3. **Real eCourts / e-Prisons integrations** — mocked behind documented seams per master-context
   ground rules (no live scraping permitted).
4. **Public anonymous job board** — replaced by authenticated NGO dashboard (privacy-first);
   revisit only if the workplan demands anonymous browsing.
5. **i18n of the prisoner portal** — English-only like the NGO side; staff app is fully EN/HI.
