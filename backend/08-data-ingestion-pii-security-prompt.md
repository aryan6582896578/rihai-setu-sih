# RIHAI SETU — Prompt 8: Realistic Government Data Ingestion & PII Security Hardening

Read `00-rihai-setu-master-context.md` first. This prompt exists to close two specific
gaps from judge feedback: (1) the data-ingestion story from government portals needs to
be clearer and more realistic, and (2) the security architecture around PII needs
tightening. Treat both as first-class build work, not slide-only fixes — the acceptance
criteria below are things you should be able to demo, not just describe.

## Part 1 — Realistic Government Data Ingestion Strategy

### Why "we'll just call their API" isn't a real plan, and what to say instead
- e-Prisons MIS is run per-state, with no standardized public write API for third
  parties. Real access requires a data-sharing agreement / MoU with the relevant State
  Prisons Department — a government process, not something available on day one.
- eCourts/NJDG does support CNR-based case-status lookups (already the basis for
  Prompt 4's `CourtStatusProvider`), but bulk onboarding of case data still needs
  authorization beyond a single-case lookup.
- NPIP publishes aggregate, state/national-level statistics only — useful for
  benchmarking numbers in your report, not a source of individual prisoner records.

State this phased plan explicitly in your report — it's what judges are actually asking
for when they say "clearer, more realistic strategy":

**Phase 1 (now)** — Manual entry + bulk import. Staff use the "Add Prisoner" form
(Prompt 2) or a CSV/Excel bulk importer, since most state e-Prisons deployments already
support exporting their own records to spreadsheet form.

**Phase 2 (pilot, after an MoU with one state)** — Scheduled secure batch sync. Same
adapter pattern as `CourtStatusProvider`: define an `EPrisonsSyncProvider` interface with
a `MockEPrisonsSyncProvider` for dev, and leave the seam for the state's IT department to
plug in a secure SFTP drop or an authorized API once access is formally granted.

**Phase 3 (post-pilot, at scale)** — Direct read-only API integration once the state/NIC
issues real API credentials, swapped in behind the same interface without touching any
downstream code.

### Ingestion pipeline (build this now, it works for any source in every phase)
New schema:
- `IngestionBatch(id, source_system[e_prisons|ecourts_bulk|csv_upload], initiated_by,
  file_url, status[pending|validating|staged|reconciling|merged|failed], row_count,
  error_count, created_at)`
- `IngestionRow(id, batch_id, raw_data JSON, mapped_data JSON,
  validation_status[valid|warning|error], conflict_type, resolved, resolved_by)`

Flow: upload → schema/type validation → duplicate detection (exact match on
`prisoner_reg_no` + `jail_id`; fuzzy match on name + DOB + admission_date gets flagged,
never auto-merged) → staged rows go into `IngestionRow` → a human reviews
warnings/conflicts on a reconciliation screen → only reviewed rows merge into the
canonical `Prisoner`/`CaseRecord` tables.

**The one rule that matters most here**: nothing from an automated or bulk source ever
silently overwrites an existing, manually-verified record. Every canonical record touched
by ingestion carries `source_system` and `external_ref_id` for provenance. A bad
government data sync corrupting a legal case record silently is a disqualifying failure
mode in this domain, not an edge case — build the reconciliation step as non-optional,
not a "nice to have."

### Reconciliation Screen — `/admin/data-ingestion`
(`super_admin` and `jail_superintendent`, scoped to their jail for the latter)
- List of `IngestionBatch`es with status and error counts
- Drill into a batch → rows needing review (warnings/conflicts), side-by-side raw vs.
  existing record, approve/reject/edit-then-merge per row

## Part 2 — PII Security Architecture

### Data classification
- **Tier 1** (most sensitive): full name, DOB, address, next-of-kin contact, photo
- **Tier 2** (sensitive, case-related): case number, CNR, offence details
- **Tier 3** (operational): jail-level stats, aggregate occupancy — no special handling

### Encryption
- At rest: field-level envelope encryption (AES-256) for Tier 1 fields via a managed key
  service (AWS KMS, consistent with the existing stack); Tier 2 fields encrypted at the
  column or volume level
- In transit: TLS 1.2+ enforced everywhere, HSTS, no plain-HTTP fallback

### Access control & least privilege
- Extend the existing RBAC (master context) with field-level masking where relevant — a
  role that only needs aggregate numbers should never receive raw Tier 1 fields in an API
  response, even if it technically has "read" on the resource
- NGOs/employers (Prompt 7) structurally never touch `Prisoner`/`CaseRecord` at all — that
  separate auth domain is itself a security control, worth stating explicitly in your
  report, not just a data-modeling choice
- The API's own DB credentials are scoped (row-level, jail-scoped) — no shared superuser
  credential used by application code

### Audit logging
New table: `AuditLog(id, actor_id, actor_type, action, entity_type, entity_id,
fields_touched, ip_address, timestamp)`. Every read and write touching Tier 1/Tier 2
fields gets logged. This is both a real control and something you can put in front of a
judge live: "here's exactly who accessed this record and when."

### LLM-specific handling (Prompt 3's auto-draft)
- Send only the minimum case facts needed for the narrative paragraph into the LLM call —
  never next-of-kin contact info, never unrelated case history
- Use an API tier/agreement with no data retention or training on submitted content, given
  the sensitivity of this data
- Log every such call's input/output pairing in `AuditLog`, same as any other Tier 1/2
  access

### Authentication hardening
- bcrypt hashing (already specified) with an enforced minimum password policy
- Refresh token rotation — invalidate the old refresh token on each use — plus a
  "revoke all sessions" action per user
- MFA (TOTP) required for `super_admin` and `jail_superintendent` — the two roles that can
  see and do the most damage if compromised; optional for the rest

### Retention & deletion
- Retain full case-processing data through release plus a defined reintegration
  follow-up window; after that, Tier 1 fields get archived/anonymized while Tier 2
  case-outcome statistics remain in de-identified form for compliance reporting
  (Prompt 6)
- Build a simple admin-actioned correction/deletion request flow — this is squarely what's
  expected of a system holding this category of data

### Regulatory framing to put directly in your report
India's Digital Personal Data Protection Act, 2023, together with the DPDP Rules notified
in November 2025, is the applicable framework and is now in a phased enforcement rollout.
RIHAI SETU would sit under it as a Data Fiduciary processing sensitive personal data —
with a legitimate legal basis for the core case-processing data (a state's own prison and
legal administration function), while still owing data principals rights like access,
correction, and grievance redressal, and being subject to breach-notification
obligations. Naming the actual law and what it requires, rather than gesturing at
"security best practices," is what turns this feedback item into a closed loop.

## API endpoints needed
```
POST  /api/v1/admin/ingestion/upload
GET   /api/v1/admin/ingestion/:batchId
POST  /api/v1/admin/ingestion/:batchId/rows/:rowId/resolve
GET   /api/v1/admin/audit-log                 (filterable by actor/entity/date)
POST  /api/v1/auth/mfa/enroll
POST  /api/v1/auth/mfa/verify
POST  /api/v1/auth/sessions/revoke-all
```

## Acceptance criteria
- Uploading a sample CSV of prisoner records goes through validation and staging, and any
  duplicate/conflicting rows require manual reconciliation before merging into canonical
  tables — nothing merges automatically on conflict
- Tier 1 fields are unreadable from a raw DB dump without the KMS key (demonstrable by
  inspecting raw rows directly)
- Every prisoner record read/write shows up in the audit log with actor and timestamp
- `super_admin` and `jail_superintendent` accounts cannot complete login without MFA once
  enrolled
- `/TODO.md` gets a checklist section for this session
