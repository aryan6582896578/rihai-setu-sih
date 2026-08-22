# RIHAI SETU — Master Context & Architecture

**Feed this file to the agent at the start of EVERY session, before the numbered prompt for that session.**

## What this is
RIHAI SETU is a real (non-prototype) system to identify undertrial prisoners eligible for
release under Section 479 BNSS, fast-track their bail/personal-bond paperwork, track it
through court back to actual release, and connect in-custody rehabilitation training to
post-release employment.

## Ground rules for the agent
- This is a REAL, production-grade implementation, not a hackathon mock. Real auth, real
  DB persistence, real password hashing, proper role-based access control.
- No public individual-level prisoner data exists (and shouldn't). Use a seed script that
  generates realistic **synthetic** prisoner/case records for dev and demo. Never present
  seeded data as real in any UI copy.
- Do NOT build: automated bail-approval logic, recidivism/reoffense risk-scoring, or live
  scraping of eCourts/e-Prisons. Where a government-system integration is described
  (eCourts CNR lookup, e-Prisons sync), build a clean adapter/interface with a mocked
  implementation behind it, and leave a clearly marked TODO for swapping in the real
  government API once access exists.
- Any module touching a legal/bail decision must make clear a human (judge, DLSA lawyer,
  superintendent) makes the actual call — the system only accelerates paperwork and
  visibility. Never let the system auto-file or auto-approve anything.

## Tech stack (fixed — do not re-decide this per session)
- Frontend: React + TypeScript + Vite, Tailwind CSS, React Router, TanStack Query for data
  fetching, lightweight state (Context or Zustand) for client-only state.
- Backend: Node.js + Express + TypeScript.
- Database: PostgreSQL + Prisma ORM.
- Auth: JWT (short-lived access token + httpOnly-cookie refresh token), bcrypt for
  password hashing, RBAC middleware on every protected route.
- File storage: local disk under `/uploads` in dev, behind a storage adapter interface so
  it can be swapped for AWS S3 later without touching calling code.
- Background jobs: `node-cron` for the nightly eligibility recompute and stall-detection
  sweep.
- Python/ML microservice: not required for this build. Only introduce one if a genuine ML
  component gets added later (e.g. time-series occupancy forecasting as a stretch goal) —
  called from Node over an internal REST call, kept fully optional.

## Repo structure
```
/apps/web        — React frontend
/apps/api        — Express backend
/packages/shared-types  — TS types shared between web and api (DTOs, enums)
/prisma           — schema.prisma, migrations, seed.ts
/TODO.md          — living task list, see below
```

## Roles (RBAC) — use exactly these enum values
- `super_admin` — full access across all jails
- `jail_superintendent` — full access scoped to their assigned jail(s)
- `jail_staff` — read/write on prisoners, cases, applications for their jail; no employee
  management
- `dlsa_lawyer` — read access to assigned cases/applications, can review/update
  application status
- `viewer` — read-only (e.g. an auditor)

## Core shared schema (do not deviate — later prompts assume these exact table/field names)
- `User(id, name, email, password_hash, role, is_active, created_at)`
- `JailAccess(id, user_id, jail_id, role_at_jail)` — many-to-many; lets one user hold
  different roles at different jails
- `Jail(id, name, state, district, code, sanctioned_capacity, address, contact_phone, created_at)`
- `Prisoner(id, jail_id, full_name, prisoner_reg_no, date_of_birth, gender, admission_date, photo_url, created_at)`
- `CaseRecord(id, prisoner_id, cnr_number, case_number, court_name, offence, max_sentence_years, carries_death_or_life, is_first_time_offender, pending_case_count, custody_start_date, case_status, updated_at)`
- `EligibilityAssessment(id, prisoner_id, status[eligible|not_eligible|excluded], reason, computed_at)`
  — append-only; insert a new row each computation, never mutate in place
- `Application(id, prisoner_id, type[bail|personal_bond], stage[flagged|drafted|filed|hearing_scheduled|order_passed|released], generated_document_url, filed_date, hearing_date, order_outcome, reviewed_by, reviewed_at, updated_at)`
- `TrainingProgram(id, name, category)`
- `Enrollment(id, prisoner_id, program_id, status[enrolled|in_progress|completed], progress_pct, certificate_url, completed_at)`
- `StallAlert(id, entity_type, entity_id, stage, days_stalled, escalated, escalated_at)`
- `Note(id, prisoner_id, author_id, body, created_at)`

## Conventions
- Dates: ISO 8601, stored in UTC.
- API: REST under `/api/v1/...`, consistent error shape `{ error: { code, message } }`.
- Every list endpoint supports pagination (`page`, `pageSize`) and relevant filter params.
- The eligibility rule engine (Prompt 3) is pure logic — it must have full branch test
  coverage before anything else depends on it.

## Task tracking (required every session)
On the first session, the agent creates `/TODO.md` at repo root with a checklist for that
session's scope. Every later session **appends** a new dated section rather than
overwriting prior sections. Items get checked off as completed, and nothing counts as done
until it has at least a one-line manual smoke-test note next to it in TODO.md.

## Where AI (LLM) genuinely belongs vs. where it doesn't
Be precise about this across every prompt — it matters for both engineering correctness
and how defensible the system is if questioned:
- Section 479 eligibility, stall detection, occupancy math → deterministic rules only.
  Fully explainable, fully testable, no model involved.
- Application drafting (the "grounds for release" narrative paragraph) → this is the one
  place an LLM call is appropriate, and it's covered in Prompt 3.

## How to use these prompts
This is prompt 0 of 4. Load it into the agent's context every session, then feed the
numbered prompt for whichever module you're building that session:
1. `01-auth-jails-portal-prompt.md` — Public home, login, jail list, jail detail (employee
   management, stall list)
2. `02-prisoners-skill-passport-prompt.md` — Prisoners list & prisoner profile (Skill
   Passport, case info, Section 479 progress)
3. `03-eligibility-superintendent-prompt.md` — Section 479 eligibility engine,
   superintendent portal, auto-draft applications

The NGO/employer job-posting portal is intentionally excluded from all of these — that'll
be a later prompt once you're ready for it.
