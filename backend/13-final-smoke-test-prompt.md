# RIHAI SETU — Prompt 13 (Final): Smoke Test, Auth-Redirect Bug Fix, Workplan Coverage Check

Read `00-rihai-setu-master-context.md` first. This is the closing pass across everything
built in Prompts 1–12. Three jobs, in order: (1) root-cause and fix the specific bug
you've hit — actions unexpectedly bouncing the user to `/login` — properly, not by
papering over the symptom; (2) run and record a full smoke test across every module;
(3) confirm coverage against the original SIH workplan document's Module A–I list, so
nothing from the original spec quietly got dropped somewhere across twelve sessions.

## Part 1 — Root-cause the "kicked to login" bug
This pattern almost always comes from one or more of the following. Check each in order
and fix whichever apply — it's common for more than one to be true at once:

1. **Access-token expiry not silently refreshed.** Whatever your fetch/axios wrapper is,
   verify a `401` triggers exactly one attempt at silent refresh (via the refresh cookie)
   and a retry of the original request — only redirect to `/login` if that refresh itself
   fails.
2. **401 vs 403 conflation.** A `403` (wrong role, or no `JailAccess` for this jail) must
   show an "access denied" view, never redirect to `/login`. Audit every place a global
   interceptor currently treats any auth-adjacent non-2xx as "log the user out" — this is
   the single most common cause of this exact bug report.
3. **Auth state resolved too early.** On page load/refresh, the app must finish
   attempting a silent token refresh — and know the real auth state — before any
   protected route renders or redirects. A route guard reading auth state before that
   resolution completes will bounce a genuinely logged-in user.
4. **Slow endpoints mistaken for auth failures.** Long-running actions — Prompt 3's
   LLM-backed auto-draft, Prompt 6/8's document export/generation — must not be misread
   as a stale token just because they take longer than a typical request. Check your
   token TTL and any client-side timeout logic against these specifically; this is a very
   plausible source of an intermittent "I click this one button and get logged out"
   report.
5. **Race conditions across concurrent requests.** If a page fires several API calls at
   once and the token expires between them, only one refresh attempt should run — others
   should wait on it, not each independently redirect.
6. **Auth-domain crossover.** Staff (`User`), NGO (`Organization`), and prisoner
   (`Prisoner`) tokens are three separate domains (Prompts 1, 7, 10). Confirm no
   staff-facing button is accidentally calling an endpoint gated to a different
   `actor_type` — that produces exactly this kind of confusing auth failure.

Once the actual cause(s) are fixed, add a short session-expiry-warning toast ("your
session will expire soon, stay signed in?") — a surprise logout is a bad experience even
after the root cause is gone; this reduces how often anyone hits the edge of it at all.

## Part 2 — Full Smoke Test Pass
Produce `/SMOKE_TEST_RESULTS.md` at repo root, one row per test:
`Module | Flow | Steps | Expected | Actual | Status (✅/❌/Fixed) | Notes`.
Include the login-redirect bug as its own row, with whichever root cause(s) from Part 1
actually applied written in the Notes column — not just "fixed."

Test at least these flows per module:

- **Prompt 1**: unauthenticated `/` loads fine; valid/invalid login; direct navigation to
  a jail with no `JailAccess` shows access-denied (not a login redirect); add staff
  member; stall list renders from seed data
- **Prompt 2**: search/filter prisoners list; edit case details and see eligibility
  react; enroll + complete a training program; add a note
- **Prompt 3**: manual recompute; superintendent portal eligible list; auto-draft
  (specifically watch for Part 1, cause #4 here); mark-reviewed gate before `filed`
- **Prompt 4**: court status sync; lawyer assignment; surety checklist unlocking
  `released`
- **Prompt 5**: overcrowding dashboard charts render; projection endpoint responds
- **Prompt 6**: notification log renders; compliance report date range + PDF/Excel
  export (watch for cause #4 here too — export generation isn't instant)
- **Prompt 7**: NGO signup → pending state; admin approval; job posting CRUD; public
  read endpoint filters correctly
- **Prompt 8**: ingestion upload → reconciliation → merge; audit log populates; MFA
  enroll/verify (a strong candidate for cause #1 or #3 if it misbehaves)
- **Prompt 9**: SSO placeholder never navigates or calls the network
- **Prompt 10**: PIN login; kiosk biometric mock; lockout after 5 attempts; both reset
  paths; DigiLocker placeholder inert
- **Prompt 11**: full application lifecycle produces correct family messages in order;
  consent toggle stops sends; dedup prevents repeats
- **Prompt 12**: lawyer dashboard aggregates across jails; transfer preserves history;
  data-confidence gate holds eligibility at `pending` until reconciled; grievance flow
  end to end; cross-jail search

## Part 3 — Coverage Check Against the Original Workplan
Confirm every module from the originally uploaded workplan document maps to something
built, using this table as your starting point (verify each row, don't just copy it):

| Original Module | What it covers | Built in | Status |
|---|---|---|---|
| A — Eligibility & Exclusion Engine | Section 479 rule logic | Prompt 3 | |
| B — Application/Paperwork Auto-Generation | Auto-drafted bail/bond docs | Prompt 3 | |
| C — Court Filing & Status Tracking | CNR/hearing/order sync | Prompt 4 | |
| D — Legal Aid & Bond/Surety Assistance | Lawyer assignment, surety checklist | Prompt 4 | |
| E — Overcrowding Dashboard & Capacity Prediction | Occupancy + forward projection | Prompt 5 | |
| F — Rehabilitation Tracking | Skill Passport / training enrollment | Prompt 2 | |
| G — Market Linkage & Post-Release Job Placement | Posting side only — matching is a separate team's work | Prompt 7 (+ Prompt 10 job-board shell) | |
| H — Notifications | Family SMS/WhatsApp | Prompts 6 & 11 | |
| I — Compliance Reporting | SC-style aggregate reports | Prompt 6 | |

Also note the additions made beyond the original nine modules (Prompt 1's foundational
auth/jail layer, Prompt 8's data ingestion and PII security, Prompt 9's SSO placeholder,
Prompt 10's prisoner portal, Prompt 12's workflow gaps) so the coverage picture is
complete, not just a checklist of the original nine.

Fill in the "Status" column for real (Built / Partially Built / Not Built) after
verifying, not from memory of what the prompts said to build. If anything comes back
"Not Built" or "Partially Built," fix it now if it's small, or state clearly in
`SMOKE_TEST_RESULTS.md` that it's a known gap and why it wasn't closed in this session —
don't silently expand scope without saying so.

## Acceptance criteria
- `/SMOKE_TEST_RESULTS.md` exists, every row is ✅ or explicitly explains what's still
  open and why
- The login-redirect bug's actual root cause is named in the results doc, not just
  marked "fixed"
- `401` and `403` are demonstrably handled differently across at least three different
  protected routes
- Every row in the Module A–I coverage table has a verified, non-blank status
- `/TODO.md` gets a final wrap-up entry
