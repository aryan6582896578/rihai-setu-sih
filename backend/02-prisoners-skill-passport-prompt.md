# RIHAI SETU — Prompt 2 of 4: Prisoners List & Prisoner Profile (Skill Passport)

Read `00-rihai-setu-master-context.md` first. Assumes Prompt 1's auth/RBAC and jail-detail
pages already exist — this session adds the prisoner-level pages nested under a jail,
using the `Prisoner`, `CaseRecord`, `EligibilityAssessment`, `Application`,
`TrainingProgram`, `Enrollment`, `Note` tables from the master schema.

## Scope of this session

### 1. Prisoners List — `/jails/:jailId/prisoners`
- Paginated, searchable table (name, reg no, case number)
- Columns: name, reg no, case number, offence, custody duration (computed:
  `now - custody_start_date`, formatted "X months Y days"), Section 479 status badge
  (Eligible / Not Eligible / Excluded / Pending — from the latest `EligibilityAssessment`;
  "Pending" if none exists yet), current application stage (or "—" if no `Application` row)
- Filters: eligibility status, application stage, free-text search
- Row click → `/jails/:jailId/prisoners/:prisonerId`
- "Add Prisoner" button (`jail_staff`+) → admission intake form: personal info + initial
  `CaseRecord` fields

### 2. Prisoner Profile — `/jails/:jailId/prisoners/:prisonerId`
Single page with anchored sections (tabs are fine too, your call):

**Personal info** — name, reg no, DOB, gender, admission date, photo (upload via the
storage adapter)

**Case details** — CNR number, case number, court name, offence, max sentence (years),
carries-death-or-life flag, first-time-offender flag, pending case count, custody start
date. Editable by `jail_staff`+; any edit should trigger an eligibility recompute call
(from Prompt 3's engine — if Prompt 3 hasn't been built yet this session, stub the call
behind the same function signature and leave a `// TODO: wire real engine` comment; don't
block this page on it)

**Section 479 eligibility panel** — status badge + reason text, "last computed"
timestamp, manual "Recompute" button

**Application progress** — horizontal stepper: Flagged → Drafted → Filed → Hearing
Scheduled → Order Passed → Released, current stage highlighted, each completed stage
shows its date. A simple manual "Advance Stage" action for `jail_staff`/`dlsa_lawyer` is
enough for this session — Prompt 3 adds the actual auto-draft generation button that
creates the `Application` row in the first place

**Skill Passport panel** — list of `Enrollment`s: program name, status, progress %,
certificate download link once completed. "Enroll in Program" → pick from a
`TrainingProgram` catalog (seed ~10, e.g. Tailoring, Carpentry, Computer Basics / DSEU
certification, Bakery, Electrical Wiring). Staff can update `progress_pct` and mark
complete, which creates a placeholder certificate record for now (real PDF certificate
generation can reuse Prompt 3's document-generation utility once that exists)

**Notes / activity log** — free-text notes, timestamped and attributed to the author

## API endpoints needed
```
GET/POST   /api/v1/jails/:jailId/prisoners
GET/PATCH  /api/v1/prisoners/:id
GET/PATCH  /api/v1/prisoners/:id/case
POST       /api/v1/prisoners/:id/eligibility/recompute   (stub if Prompt 3 not built yet)
GET/POST   /api/v1/prisoners/:id/applications             (manual stage advance)
GET        /api/v1/training-programs
POST       /api/v1/prisoners/:id/enrollments
PATCH      /api/v1/enrollments/:id
POST       /api/v1/prisoners/:id/notes
```

## Data notes
- Custody duration and the eligibility badge are always computed, never manually entered
  — don't let any UI let staff directly set eligibility status.
- `EligibilityAssessment` is append-only (insert, don't update) so later you can show a
  history of "eligibility changed on X date" — the profile page just reads the latest row.

## Acceptance criteria
- From a jail detail page, staff can reach the prisoners list, search/filter it, open a
  profile, edit case details, see the eligibility badge respond (even reflecting a stub
  value if Prompt 3 isn't built yet), manually advance an application stage, enroll a
  prisoner in a training program and mark it complete, add a note
- `/TODO.md` gets a checklist section for this session
