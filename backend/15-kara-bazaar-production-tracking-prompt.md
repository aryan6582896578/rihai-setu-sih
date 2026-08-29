# RIHAI SETU — Prompt 15: In-Custody Production Tracking & Kara Bazaar Linkage

Read `00-rihai-setu-master-context.md` first. Builds on the `Prisoner` and
`TrainingProgram`/`Enrollment` tables from Prompt 2, adds a panel to the prisoner
profile (Prompt 2), a jail-level stat (Prompt 1's Overview tab), and a read-only view on
the prisoner portal (Prompt 10).

## Grounding this in what's real
Kara Bazaar is a genuine national portal — the third module of NIC's e-Prisons suite,
alongside the MIS and NPIP — for showcasing and selling products inmates make across the
country's prisons, with individual state prison departments onboarding into it
centrally. There's no indication it exposes a public write API for third-party systems
to push listings into. Treat it exactly like e-Prisons and eCourts elsewhere in this
project (Prompts 4 and 8): track production data as your own system of record, and
handle Kara Bazaar itself as a manually-updated listing status until a real integration
is coordinated through NIC/the state prison department. Don't attempt to scrape or
auto-post to the real site.

## New schema for this session
- `ProductionRecord(id, prisoner_id, training_program_id [nullable, links to Prompt 2's
  TrainingProgram if the item ties to a completed skill], category, item_name, quantity,
  produced_at, sale_value_estimate, kara_bazaar_listing_status[not_listed|pending|listed],
  kara_bazaar_listing_url, recorded_by, created_at)`

`training_program_id` being nullable matters — some production (e.g. kitchen/bakery work,
housekeeping) may not map to a formal enrolled program even though it's still real
in-custody work worth tracking.

## 1. Prisoner Profile addition — "Prison Industries" panel
On the existing prisoner profile (Prompt 2), add a panel showing:
- Total items produced (count), and a simple breakdown by category (e.g. handicrafts,
  textiles, bakery, carpentry)
- A list of individual `ProductionRecord` entries: item name, quantity, date, Kara
  Bazaar listing status badge
- "Add Production Entry" form (`jail_staff`+): item name, category, quantity, date,
  optional linked training program, optional estimated sale value
- Staff can update a record's `kara_bazaar_listing_status` and paste in the real listing
  URL once/if the item is actually onboarded to Kara Bazaar by whoever manages that
  process at the jail — this is a manual status field, not a live sync

## 2. Jail Overview stat (Prompt 1)
Add to the jail detail Overview tab:
- "Items produced this quarter" (or a configurable period) — a simple count across all
  prisoners at that jail
- Optional: "Estimated production value" rollup, summing `sale_value_estimate` where
  present — this mirrors how real jail industries programs already report their output
  (state prison departments already track and publicize turnover figures for exactly
  this kind of program), so it's a natural, defensible metric to surface here rather
  than something invented for this project

## 3. Prisoner Portal addition (Prompt 10) — "Things I've Made"
- Read-only section on `/portal/profile` listing the prisoner's own `ProductionRecord`
  entries — this is meant to read as a point of pride and evidence of a real skill, not
  just an administrative log, and it doubles as tangible support for the Skill Passport
  story once the job-matching side of the system exists

## API endpoints needed
```
GET/POST   /api/v1/prisoners/:id/production
PATCH      /api/v1/production/:id
GET        /api/v1/jails/:jailId/production-summary
```

## Acceptance criteria
- Staff can log a production entry against a prisoner, optionally linked to a completed
  training program, and see it reflected in that prisoner's total count and category
  breakdown
- Updating a record's Kara Bazaar listing status and URL is reflected on both the staff
  profile view and the prisoner's own portal view
- The jail Overview tab shows a correct aggregate count (and value rollup, where
  estimates exist) across all prisoners at that jail
- A prisoner logged into the portal sees only their own production records, never
  another prisoner's
- `/TODO.md` gets a checklist section for this session
