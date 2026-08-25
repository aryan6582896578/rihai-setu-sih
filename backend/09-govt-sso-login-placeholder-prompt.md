# RIHAI SETU — Prompt 9: Government SSO Login Placeholder (e-Prisons via MeriPehchaan)

Read `00-rihai-setu-master-context.md` first. Builds on Prompt 1's login page (`/login`).
This is a **UI-only, clearly-labeled placeholder** — it must not authenticate anyone or
attempt any real SSO handshake. Purpose: signal a credible future integration path
without pretending it already exists.

One correction before building: the platform's actual name is **MeriPehchaan** (double
"a"), not "MeriPehchan" — use the correct spelling in the UI copy, since the whole point
of this button is demonstrating you understand the real government auth landscape.

## Scope

### Login page addition
Below the existing email/password form from Prompt 1, add a visually distinct section:
- A divider labeled "or"
- A button:
  - Primary label: `Login with e-Prisons SSO`
  - Sub-text/badge (small, muted, secondary styling — not equal visual weight to the
    label): `NIC · MeriPehchaan Government Auth`
- Style it to look like a real, intentional option — not a greyed-out disabled HTML
  button, which reads as broken rather than "coming soon." Wire it to a **local-only**
  click handler, nothing that hits the network.

### On click
Open a small modal or toast — never a dead link, never a silent no-op, never a console
error:
> "Government SSO coming soon — RIHAI SETU is designed to authenticate jail staff through
> NIC's MeriPehchaan National Single Sign-On once integrated with e-Prisons. For now,
> please use your assigned staff login below."

Include a "Use staff login instead" action that closes the modal and focuses the email
field.

No real OAuth client, no redirect URL, no fake token exchange — nothing in this session
should assume MeriPehchaan credentials or API access exist, because they don't yet.

### What stays exactly as-is
- The existing email/password + JWT flow from Prompt 1 remains the only working
  authentication path; every seeded demo account keeps working unchanged.
- Don't touch `User`, `JailAccess`, auth middleware, or backend token issuance in this
  session at all — this is frontend-only.

## Why this is worth doing
A real rollout across state jails wouldn't ask staff to create yet another password — it'd
piggyback on identity infrastructure the government already runs (MeriPehchaan has been
live since 2022 and is already used across government portals). Showing the button,
clearly marked as not yet wired up, demonstrates you've scoped that integration path
rather than ignored it, without overclaiming an integration you haven't built — the same
"mark what's mocked vs. real" pattern already used for the eCourts/e-Prisons adapters in
Prompts 4 and 8.

## Acceptance criteria
- Clicking "Login with e-Prisons SSO" never calls any network endpoint and never
  navigates away from `/login`
- All seeded demo accounts still log in exactly as before
- The badge text is legible at small size and doesn't visually compete with the real
  login form for primary attention
- `/TODO.md` gets a one-line entry for this session
