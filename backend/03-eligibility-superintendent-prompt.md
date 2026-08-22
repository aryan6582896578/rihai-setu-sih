# RIHAI SETU — Prompt 3 of 4: Section 479 Eligibility Engine & Superintendent Portal

Read `00-rihai-setu-master-context.md` first. Wires into Prompt 2's `CaseRecord` /
`EligibilityAssessment` / `Application` tables. This is the core differentiator of the
project — but be precise about what's actually AI here and what isn't (see master
context): eligibility itself is deterministic and must stay that way, because a legal
eligibility decision has to be explainable, not a black box. The one legitimate LLM use
in this module is drafting the narrative section of the generated application.

## 1. Section 479 Eligibility Engine
Implement as a pure, fully unit-tested function:

```ts
Input:  {
  custodyStartDate: Date,
  maxSentenceYears: number,
  carriesDeathOrLife: boolean,
  isFirstTimeOffender: boolean,
  pendingCaseCount: number,
}
Output: {
  status: 'eligible' | 'not_eligible' | 'excluded',
  reason: string,
}
```

Rules, checked in this exact order (exclusions first):
1. `carriesDeathOrLife === true` → `excluded`, reason: "Offence carries death penalty or
   life imprisonment"
2. `pendingCaseCount > 1` → `excluded`, reason: "More than one pending case
   (investigation/inquiry/trial)"
3. Compute `timeInCustody = now - custodyStartDate`
4. `timeInCustody >= maxSentenceYears / 2` → `eligible`, reason: "Custody period has
   reached half of maximum sentence"
5. else if `timeInCustody >= maxSentenceYears / 3 && isFirstTimeOffender` → `eligible`,
   reason: "Custody period has reached one-third of maximum sentence and prisoner is a
   first-time offender"
6. else → `not_eligible`, reason: "Custody period has not yet reached the statutory
   threshold"

Recompute triggers (always insert a new `EligibilityAssessment` row, never mutate):
- Synchronously on `CaseRecord` create/update
- Nightly `node-cron` sweep across all active prisoners — this is what catches a
  prisoner becoming eligible purely because time has passed, with no data edit, and is
  what makes this a real system rather than a one-shot form calculator

## 2. Superintendent Portal — `/jails/:jailId/superintendent`
Gated to `jail_superintendent`, `super_admin` only.
- List of prisoners in this jail whose latest `EligibilityAssessment.status ===
  'eligible'` AND who have no `Application` yet (or one still at stage `flagged`)
- Columns: name, case number, offence, eligibility reason, custody duration, bulk-select
  checkbox
- "Auto-Draft Application" — per-row and bulk actions. On click:
  1. Create an `Application` row (`type: bail` by default, staff can change to
     `personal_bond`) at stage `flagged` if one doesn't already exist
  2. Fill a real document template (case number, prisoner name, offence, sentence
     details, custody dates, assigned DLSA lawyer if any) — HTML→PDF or a docx template
     with placeholders, either is fine
  3. Server-side only (never client-side) call the LLM with the structured case facts to
     draft the 1–2 paragraph "grounds for release" narrative, and insert it into the
     template
  4. Save the generated file via the storage adapter, set
     `Application.generated_document_url`, advance stage to `drafted`
  5. Show a preview + download link with a prominent **"AI-drafted — pending lawyer
     review"** badge, and a "Mark Reviewed" action (gated to `dlsa_lawyer` /
     `jail_superintendent`) that sets `reviewed_by` / `reviewed_at`
  6. The application cannot advance to stage `filed` unless `reviewed_by` is set — enforce
     this server-side, not just in the UI

## API endpoints needed
```
POST  /api/v1/prisoners/:id/eligibility/recompute     (real implementation, replaces Prompt 2's stub)
GET   /api/v1/jails/:jailId/superintendent/eligible-prisoners
POST  /api/v1/prisoners/:id/applications/auto-draft
POST  /api/v1/applications/:id/review
```

## Testing requirement
Unit tests for the rule engine covering every branch: exactly-half-sentence boundary,
exactly-one-third-plus-first-time boundary, exclusion by death/life, exclusion by
>1 pending case, not-yet-eligible. This function is the legal core of the product — do
not ship it without full branch coverage.

## Acceptance criteria
- The nightly cron correctly flips a seeded prisoner from `not_eligible` to `eligible` on
  the date they cross the threshold (seed a `custody_start_date` deliberately timed to
  cross today to test this)
- The superintendent portal shows exactly the eligible + not-yet-flagged prisoners for
  that jail
- Auto-draft produces a downloadable document with the AI-drafted section clearly marked,
  and the application cannot reach stage `filed` without `reviewed_by` set
- `/TODO.md` gets a checklist section for this session
