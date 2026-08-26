# RIHAI SETU — Prompt 10: Prisoner-Facing Auth (Skill Passport, Documents, Job Board)

Read `00-rihai-setu-master-context.md` first. Builds on `Prisoner`, `Enrollment`,
`Application`, and Prompt 7's `JobPosting` tables. This is a **new, separate auth
domain** — prisoners are not `User`s and don't get `JailAccess`; they authenticate
against their own `Prisoner` record. Same separation-of-concerns pattern as Prompt 7's
`Organization` domain and Prompt 9's staff-SSO placeholder.

## Grounding this design in what's actually real
Two real, current facts should shape this, not guesswork:
- NIC's Aadhaar-linked biometric authentication for prison inmates is already
  operational across the large majority of Indian prisons (per an MHA advisory and
  NIC's own e-Prisons rollout) — so a real production version of this system would
  piggyback on infrastructure that already exists at the jail, not invent a new one.
- Prisoners in custody have no personal phone/internet access, so any login model that
  assumes they can receive an OTP on their own device only works **after release**.
  In-custody access has to be a supervised kiosk/terminal inside the jail.

So this isn't "prisoner number vs. DigiLocker" — it's two different auth contexts tied to
one persistent identity:
1. **In-custody**: a jail-provided kiosk (library, legal-aid room, etc.), staff-supervised
2. **Post-release**: the person's own device, self-service, same underlying identity

## New schema for this session
Add to `Prisoner`: `pin_hash`, `pin_set_at`, `failed_pin_attempts`, `locked_until`,
`aadhaar_ref_token` (nullable — see note below, never store a raw Aadhaar number).

## Auth Layer 1 (functional now, works in both contexts) — Prisoner ID + PIN
- Every prisoner gets a login identity from their existing `prisoner_reg_no` (already
  assigned at intake in Prompt 2) plus a PIN they set themselves.
- First-time PIN setup happens at the kiosk, staff-supervised: prisoner enters a PIN
  twice, it's bcrypt-hashed into `pin_hash`. This mirrors the standard "set a PIN at first
  use" pattern used everywhere from ATMs to DigiLocker's own PIN option — familiar and
  low-friction for a population that may have limited digital literacy.
- PIN login: `prisoner_reg_no` + PIN → JWT scoped with `actor_type: 'prisoner'` and
  `prisoner_id`, distinguishable from staff/org tokens the same way Prompt 7 scoped
  `actor_type: 'organization'`.
- Rate-limit hard: lock the account after 5 failed attempts (`locked_until`), since a PIN
  is a weaker credential than a password and kiosks are physically shared. Reset paths:
  - Staff-assisted reset (jail_staff issues a temp PIN, shown once, prisoner must change
    it on next login)
  - Next-of-kin OTP reset (reuse the `NotificationProvider` from Prompt 6 — send an OTP to
    `Prisoner.next_of_kin_phone`, only usable post-release when the prisoner themself
    might not have staff nearby to assist)
- This PIN carries over unchanged from in-custody to post-release — same credential, same
  identity, no re-registration needed at release.

## Auth Layer 2 (functional mock, in-custody kiosk only) — Aadhaar-linked biometric
- Kiosk screen shows "Verify with Fingerprint" alongside the PIN option.
- Build a `KioskBiometricAuthProvider` interface with a `MockKioskBiometricAuthProvider`
  implementation: a "Simulate Fingerprint Scan" button that, given a `prisoner_reg_no`,
  simulates a successful match and logs in — functional for demo purposes, the same
  mock-but-working pattern already used for `CourtStatusProvider` in Prompt 4.
- Leave the interface seam clearly marked for a real integration later: jails already
  running Aadhaar-authenticated e-Prisons could, with proper UIDAI AUA/KUA registration,
  swap in real biometric hardware behind the same interface. Don't build that real
  integration now — registering as an AUA/KUA and handling live biometric capture is a
  serious compliance undertaking, well beyond this session's scope.
- **Never store a raw Aadhaar number anywhere in this system.** If/when real UIDAI
  integration happens, only store the reference token UIDAI's own vaulting architecture
  issues — this is a legal requirement (Aadhaar Act, 2016), not a style preference. For
  now `aadhaar_ref_token` stays null; it exists in the schema only so the real integration
  has somewhere to land later without a migration.

## Auth Layer 3 (non-functional placeholder, post-release only) — DigiLocker
- Same treatment as Prompt 9's staff SSO button: a "Login with DigiLocker" option on the
  prisoner login page, visually real, wired to a local-only click handler that shows
  "Coming soon" and points back to the PIN login — never a real OAuth flow, since real
  DigiLocker integration isn't available to this build.

## Pages

### Prisoner Login — `/portal/login`
- `prisoner_reg_no` + PIN fields (Layer 1)
- "Verify with Fingerprint" button, visible in a kiosk context (Layer 2, functional mock)
- "Login with DigiLocker" button with the coming-soon treatment (Layer 3, placeholder)

### Prisoner Profile — `/portal/profile`
- Read-only view of their own record: name, reg no, custody duration, Section 479
  eligibility status in plain language (not raw legal jargon — translate the reason
  string from Prompt 3's engine into something a non-lawyer reads easily), and the
  application-progress stepper from Prompt 2/4. Nothing here is editable by the prisoner.

### Job Board — `/portal/jobs`
Deliberately a shell for now, per your instruction — the recommendation engine is a
separate team's work and doesn't belong in this session at all:
- Render an empty state: "Personalized job matches will appear here soon"
- Do not fetch, filter, or display raw postings from Prompt 7's `GET /api/v1/job-postings`
  in this page — even an unsorted raw list starts to look like "the matching," which is
  explicitly not this session's job. Leave a short comment in the component marking where
  the other team's results will render once that engine exists.

### Certificates & Documents — `/portal/documents`
- Skill Passport certificates from completed `Enrollment`s (Prompt 2)
- Application documents — but only once `Application.stage` has reached `filed` or later
  **and** `reviewed_by` is set (Prompt 3's boundary). A prisoner should never see an
  AI-drafted application before a lawyer has reviewed it — that boundary matters here as
  much as it did for the staff-facing side.

## API endpoints needed
```
POST  /api/v1/portal/auth/login-pin
POST  /api/v1/portal/auth/login-kiosk-biometric      (mocked)
POST  /api/v1/portal/auth/set-pin
POST  /api/v1/portal/auth/reset-pin/request-otp
POST  /api/v1/portal/auth/reset-pin/confirm
GET   /api/v1/portal/profile
GET   /api/v1/portal/documents
```
(No `/portal/jobs` endpoint this session — the page is a static empty state.)

## Security notes (ties into Prompt 8)
- Log every prisoner login attempt and document access into the `AuditLog` table with
  `actor_type = 'prisoner'`, same as any other actor
- PIN attempts are rate-limited and lockable, as above
- A prisoner's JWT scopes strictly to their own `prisoner_id` — no endpoint in this
  session should ever accept a prisoner token and return another prisoner's data

## Acceptance criteria
- A seeded prisoner can log in with reg no + PIN (after a staff-simulated first-time PIN
  setup), see their profile, see the job board's empty state, and see only their own
  released/reviewed documents
- The kiosk biometric option logs in successfully via the mock, without any real hardware
  or UIDAI dependency
- The DigiLocker button never calls a network endpoint or navigates away from the login
  page
- Locking out after 5 failed PIN attempts is demonstrable, along with both reset paths
- `/TODO.md` gets a checklist section for this session
