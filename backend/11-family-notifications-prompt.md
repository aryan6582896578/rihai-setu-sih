# RIHAI SETU — Prompt 11: Family Notifications Across the Paperwork Lifecycle (Twilio)

Read `00-rihai-setu-master-context.md` first. This extends Prompt 6's `NotificationProvider`
/ Twilio adapter and `NotificationLog` table — **don't rebuild that infrastructure**, this
prompt adds the actual event-by-event message content, consent handling, and delivery
logic that Prompt 6 left generic ("notify next-of-kin on stage change").

## Why this needs more care than a generic "send an update" trigger
A family being told their relative's bail was denied is meaningfully different from being
told a hearing date was set. Getting the tone and the "what do I do now" part wrong on the
denial message is worse than not sending it at all. Build this as templated,
event-specific messages, not one generic "status changed" text.

## New schema for this session
- `NotificationTemplate(id, event_key, channel[sms|whatsapp], locale, message_template)`
  — templates use placeholders like `{{prisoner_name}}`, `{{court_name}}`,
  `{{hearing_date}}`, `{{bond_amount}}`, `{{lawyer_name}}`, `{{lawyer_phone}}`
- Add to `Prisoner` (or split into a small `NextOfKinContact` table if you want to support
  more than one contact — either is fine): `next_of_kin_consent_given` (bool),
  `next_of_kin_preferred_channel` (sms|whatsapp), `next_of_kin_preferred_locale`
- Extend `NotificationLog` (Prompt 6) with `template_key`, `locale`, `channel_used`,
  `dedupe_key`

## Consent, first — before any message content
- Capture `next_of_kin_consent_given` at intake (staff-entered, alongside the
  `next_of_kin_phone` field from Prompt 4) — this is legal-case information about a
  specific person going out over SMS/WhatsApp to another named person; treat that consent
  step as mandatory, not a UI afterthought
- No trigger in this prompt sends anything if `next_of_kin_consent_given` is false,
  regardless of stage
- Respect `next_of_kin_preferred_channel` — try that channel first, fall back to the
  other only if the send fails (Twilio delivery status callback, if you wire it; a
  simple "assume WhatsApp send success unless the API call itself errors" is fine for now)
- Respect `next_of_kin_preferred_locale` for template selection; seed at least English and
  Hindi templates for every event so this isn't English-only from day one — most family
  members receiving this are far more likely to read Hindi or a regional language
  comfortably than legal English

## Event → message mapping
Seed a `NotificationTemplate` row per `event_key` × `channel` × `locale`. Content
guidance per event (write the actual templates, this is the substance of the wording, not
just a list of triggers):

- `application_drafted` — neutral, informative: their release application has been
  prepared and is under legal review; no action needed from them yet
- `application_filed` — the application has been filed in court; include the CNR number
  (that's public information via eCourts anyway) and say they'll be updated once a
  hearing date is set
- `hearing_scheduled` — hearing date and court name; no other detail needed
- `order_granted_no_bond` — bail/personal bond granted, release is being processed, no
  further action from the family required
- `order_granted_bond_required` — granted, but a surety/bond of `{{bond_amount}}` needs
  to be arranged; give the assigned DLSA lawyer's name and phone as the contact for how
  to do that — this message needs to be actionable, not just informative, since it's the
  #1 real-world delay point per your own problem statement
- `order_denied` — the most sensitive one. Factual, not blame-laden, no legal jargon,
  and always paired with a named human to call: "The court did not grant [bail/personal
  bond] for [name] at this time. Their legal aid lawyer, [lawyer name], can explain the
  next steps — [lawyer phone]." Never send this one without a `lawyer_name`/`lawyer_phone`
  populated (i.e. `LegalAidAssignment` from Prompt 4 must exist first) — a denial message
  with no one to call is worse than delaying it briefly to backfill the assignment
- `surety_arranged` — bond/surety completed, release processing is now underway
- `released` — warm, short: they've been released today

## Trigger wiring
Hang these off events that already exist from earlier prompts — this session adds
content and delivery, not new state transitions:
- `Application.stage` changes (Prompt 1/3) → `application_drafted`, `application_filed`
- Court sync (Prompt 4) setting a hearing date → `hearing_scheduled`
- Court sync setting `order_outcome` → `order_granted_no_bond` /
  `order_granted_bond_required` (branch on whether `SuretyStatus.surety_required` is
  true) / `order_denied`
- `SuretyStatus.surety_arranged` flips to true → `surety_arranged`
- `Application.stage` reaches `released` → `released`

## Deduplication
Compute a `dedupe_key` from `(application_id, event_key)` and check `NotificationLog`
before sending — a retried webhook, a manual re-sync, or an edit that doesn't actually
change the underlying outcome should never re-send the same family notification twice.

## API endpoints needed
```
GET/PATCH  /api/v1/prisoners/:id/next-of-kin       (contact, consent, channel, locale)
GET/PATCH  /api/v1/admin/notification-templates     (super_admin — edit template copy
                                                      without a code deploy)
```
(Triggers themselves are internal event hooks, not endpoints.)

## Acceptance criteria
- Walking a seeded application through drafted → filed → hearing_scheduled →
  order_passed (granted, bond required) → surety arranged → released produces the
  correct message at each step, each logged in `NotificationLog` with its `template_key`
- A denied outcome only sends once a `LegalAidAssignment` exists for that application,
  and the message includes the lawyer's name and phone
- Toggling `next_of_kin_consent_given` to false stops all sends for that prisoner
  immediately, at any stage
- Re-triggering the same stage/event a second time does not send a duplicate message
- Hindi and English templates both render correctly for at least three of the events
  above
- `/TODO.md` gets a checklist section for this session
