# 🏛️ RIHAI SETU — *Bridge to Freedom*

> **An end-to-end platform for undertrial bail acceleration under Section 479 BNSS, in-custody skill passporting, and post-release rehabilitation placement.**

Built for the **internal round of Smart India Hackathon 2026**, RIHAI SETU automates the identification of undertrials eligible for release, auto-drafts legally sound bail / personal-bond petitions with human-in-the-loop judicial oversight, tracks court proceedings via CNR numbers, helps DLSA lawyers manage surety and bond workflows, projects jail overcrowding, and bridges in-custody vocational training with post-release NGO employment placement.

---

## Table of Contents

- [Problem & Mission](#problem--mission)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Monorepo Layout](#monorepo-layout)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Database Setup](#database-setup)
  - [Running Locally](#running-local)
  - [Python Microservices](#python-microservices)
- [Configuration](#configuration)
- [Environment / Demo Accounts](#environment--demo-accounts)
- [Testing](#testing)
- [Security & Privacy](#security--privacy)
- [Key Modules & Workflows](#key-modules--workflows)
- [Documentation](#documentation)
- [Known Gaps](#known-gaps)
- [License](#license)

---

## Problem & Mission

According to the National Crime Records Bureau (NCRB), **over 75% of inmates in Indian prisons are undertrials** — individuals awaiting trial who have not been convicted. Many remain incarcerated simply because of poverty, a lack of legal representation, the inability to furnish monetary bail/surety bonds, or bureaucratic delays in tracking court eligibility.

**Section 479 of the Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023** introduced a transformative statutory mandate:

1. **First-time offenders** must be released on a personal bond after serving **one-third (1/3)** of the maximum sentence for the offence.
2. **Other undertrials** must be released on bail after serving **one-half (1/2)** of the maximum sentence.
3. **Exclusions** apply to offences carrying the death penalty or life imprisonment, or to persons with multiple pending cases under investigation/trial.

RIHAI SETU operationalises this mandate into a working, role-based digital platform for police/staff, jail superintendents, DLSA lawyers, NGOs, and prisoners themselves.

---

## Features

- **Section 479 Eligibility Engine** — a pure, deterministic rule engine (`domain/section479.ts`) with exclusions-first semantics and append-only assessment history. Unit-tested 10/10.
- **Bail / Personal-Bond Auto-Drafting** — superintendent portal generates server-side HTML petitions (LLM narrative with deterministic template fallback), stamped **"AI-DRAFTED — PENDING LAWYER REVIEW"**, review-gated before filing.
- **Court Filing & Status Tracking** — CNR-based sync via a swappable `CourtStatusProvider` seam (time-accelerated mock provider; real eCourts adapter documented).
- **Legal Aid & Surety Management** — DLSA lawyer queue with round-robin / manual assignment, surety checklist gating release, "never decides bail" boundary.
- **Overcrowding Dashboard & Capacity Prediction** — nightly occupancy snapshots, 30/60/90-day deterministic projections, backlog breakdown, super-admin cross-jail rollup (hand-rolled SVG charts, zero chart deps).
- **Prisoners & Skill Passport** — searchable/filterable prisoner directory, vocational training programs, enrollments, progress, QR-backed certificates, notes, and a **Prison Industries** production log linked to the **Kara Bazaar** marketplace.
- **NGO Employment Pipeline** — job postings, consent-gated applicant pipeline (shortlist / hire / reject), and an explainable Python recommender bridge with a published 100-point scoring formula.
- **Prisoner Portal** — a separate auth domain (PIN login, mocked kiosk biometric, OTP reset) giving prisoners read-only access to their profile, Section 479 status, documents, and job board.
- **Family Notifications** — templated, consent-gated English/Hindi SMS/WhatsApp messages across the whole paperwork lifecycle (drafted → filed → hearing → granted → surety → released), via an auto-activating Twilio adapter or logging fallback.
- **Compliance Reporting** — per-jail and rollup reports over a date range with CSV / XLSX-style / HTML exports.
- **Bulk Data Ingestion** — CSV upload → validation → duplicate detection (exact + fuzzy via HMAC blind index) → human reconciliation → merge.
- **PII Security & Privacy (DPDP-ready)** — AES-256-GCM field-level envelope encryption, HMAC blind indexing, append-only audit trail, TOTP MFA, DB-backed refresh-session rotation, and a data-principal (correction/deletion) request flow.
- **Localisation** — full English / हिंदी (Devanagari) i18n across the staff app, with a live language toggle.
- **Scoped Support Chatbot & RAG** — document-grounded FAQ assistant over approved Government/NALSA PDFs (Groq or local Ollama).

---

## Architecture

```
+---------------------------------------------------------------------------+
|                         RIHAI SETU SYSTEM LANDSCAPE                        |
+---------------------------------------------------------------------------+
|                                                                           |
|  +------------------------------------------------------------------------+ |
|  |              FRONTEND (React 19 + Vite + Tailwind CSS v4)            | |
|  |   Terracotta/Saffron design system · TanStack Query · Zustand · i18n | |
|  |   Staff app / NGO dashboard / Prisoner portal (3 auth domains)        | |
|  +------------------------------------------------------------------------+ |
|                                   |  HTTP REST / JSON                       |
|                                   V                                        |
|  +------------------------------------------------------------------------+ |
|  |                EXPRESS BACKEND API (Node.js + TypeScript + Prisma)   | |
|  |   Section 479 engine · PII envelope encryption · RBAC + JailAccess   | |
|  |   Dual auth (staff JWT+cookie | prisoner PIN/biometric) · cron jobs   | |
|  +------------------------------------------------------------------------+ |
|              |                          |  Internal REST                     |
|              V                          V                                   |
|  +------------------------+   +------------------------------------------+ |
|  |  POSTGRESQL (v17)      |   |  PYTHON FASTAPI                       | |
|  |  - Encrypted PII cols  |   |  Recommender (port 8000)             | |
|  |  - AuditLog, ingestion |   |  Chatbot / RAG (port 8001)           | |
|  |  - 24 models, 7 enums  |   |  - Stateless, deterministic, explain | |
|  +------------------------+   +------------------------------------------+ |
+---------------------------------------------------------------------------+
```

**Key architectural principles:**

- **Monorepo** with npm workspaces (`apps/*`, `packages/*`).
- **Single source of truth:** the shared PostgreSQL database. The Express API owns **all** reads/writes; the Python services are stateless and reached only over REST (never touching the DB).
- **Dual auth domains:** staff / NGO (JWT + httpOnly refresh cookie with server-side rotation) and prisoners (scoped JWT over their own `Prisoner` row, PIN/biometric/OTP). Actor types are structurally distinct and rejected cross-domain.
- **Explainability over black-box AI:** the Section 479 engine and job recommender are deterministic and auditable; generative input is minimised and defaulted to safe templates.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, TypeScript 5.7, Tailwind CSS v4, TanStack Query 5, Zustand, React Router 7, Axios |
| Backend | Node.js, Express 4, TypeScript, Prisma ORM 6, node-cron, Multer, Zod, jsonwebtoken, bcryptjs, Helmet, express-rate-limit |
| Database | PostgreSQL 17 |
| AI Microservices | Python 3.11, FastAPI, Uvicorn, RapidFuzz; RAG via PyPDF + BM25 (Groq / Ollama) |
| Security | AES-256-GCM envelope encryption, HMAC-SHA256 blind indexing, TOTP (RFC 6238 on `node:crypto`), helmet |
| Notifications | Twilio (SMS/WhatsApp) adapter with logging-only fallback |

---

## Monorepo Layout

```
rihai-setu-sih/
├── apps/
│   ├── api/                     # Express + TypeScript + Prisma REST backend
│   │   └── src/
│   │       ├── domain/          # section479.ts — pure eligibility engine
│   │       ├── jobs/cron.ts     # nightly eligibility/stall/snapshot sweeps
│   │       ├── lib/             # pii, audit, totp, llm, storage, providers...
│   │       ├── middleware/      # auth, roles, errors
│   │       ├── routes/          # 19 route modules (auth, jails, ngo, portal...)
│   │       ├── services/        # 19 service modules (business logic)
│   │       └── tests/           # node:test suite (section479 10/10)
│   └── web/                     # React 19 + Vite + Tailwind v4 frontend
│       └── src/
│           ├── features/        # 13 feature dirs / 33 page components
│           ├── components/      # Layout, ChatbotWidget, LineChart, ui...
│           ├── lib/             # api, portalApi, i18n, permissions, format
│           └── state/           # authStore, portalAuthStore (Zustand)
├── packages/
│   └── shared-types/            # @rihai/shared-types — enums, DTOs, stall config
├── backend-ai/                  # Python FastAPI microservices
│   ├── recommender-service/     # employment recommender (port 8000)
│   ├── chatbot-service/         # RAG support chatbot (port 8001)
│   └── ai-demo-frontend/        # standalone demo client
├── prisma/
│   ├── schema.prisma            # 24 models, 7 enums, PostgreSQL
│   ├── seed.ts                  # dataset-driven seeder
│   └── migrations/              # 11 migrations
├── dataset/                     # NCRB-derived synthetic datasets (600 rows each)
├── scripts/                     # PowerShell smoke-test suites + sample CSV
├── docs/                        # architecture/UML diagrams, pitch deck
├── backend/                     # prompt/spec markdown files + design HTML
├── sujay_dashboard/             # separate self-contained SIH prototype (FastAPI+React)
├── SMOKE_TEST_RESULTS.md        # final smoke matrix + coverage report
├── TODO.md                      # session-by-session living task list
└── RIHAI_SETU_MASTER_DOCUMENTATION.md  # master technical architecture doc
```

---

## Getting Started

### Prerequisites

- Node.js (18+) and npm
- PostgreSQL 17 running locally with a `rihai_setu` database
- Python 3.11+ (only if running the recommender / chatbot microservices)

### Installation

```bash
git clone <repo-url>
cd rihai-setu-sih
npm install
```

Copy the environment template and fill in your values:

```bash
cp .env.example .env
```

At minimum set a real `DATABASE_URL` and generate 64-byte random secrets for the JWT keys:

```powershell
# PowerShell example
[Convert]::ToBase64String((1..64 | % { Get-Random -Max 256 }))
```

### Database Setup

```bash
# Create the database (adjust to your PG install)
psql -U postgres -c "CREATE DATABASE rihai_setu;"

# Apply the schema and seed synthetic datasets
npm run db:migrate
npm run db:seed
```

> `db:seed` reads `dataset/*.xlsx` and produces 4 jails / 600 prisoners / 600 cases / 268 applications plus assessments, enrollments, notes, snapshots, and production logs. An NGO seed is applied separately:
>
> ```bash
> npm run db:seed:ngo
> ```

### Running Local

```bash
npm run dev          # shared-types build + API (:4000) + web (:5173) concurrently
```

- **API** → http://localhost:4000 (`/healthz` for health)
- **Web** → http://localhost:5173

Rebuild / typecheck across all workspaces:

```bash
npm run build        # shared-types → api → web
npm run typecheck    # shared-types + api + web
```

### Python Microservices

Start the stateless AI services (order-independent; each is optional):

```bash
# Employment recommender (port 8000)
cd backend-ai/recommender-service && pip install -r requirements.txt && uvicorn app.main:app --port 8000

# RAG support chatbot (port 8001)
cd backend-ai/chatbot-service && pip install -r requirements.txt && uvicorn app.main:app --port 8001
```

Both are optional at runtime — the Express API degrades gracefully if these are unreachable (e.g. the eligibility engine and bail drafting fall back to deterministic templates).

---

## Configuration

Key environment variables (see `.env.example` for the full set):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | 64-byte random secrets for token signing |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL_DAYS` | Access token (15m) / refresh cookie (7d) lifetimes |
| `WEB_ORIGIN` | Allowed CORS origin (default `http://localhost:5173`) |
| `PII_MASTER_KEY` | 256-bit KEK for field-level envelope encryption (KMS-swappable) |
| `RECOMMENDER_URL` | Recommender service base URL (default `http://127.0.0.1:8000`) |
| `CHATBOT_URL` / `CHATBOT_TIMEOUT_MS` | Chatbot service + timeout |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` | Twilio credentials — leave blank to use the logging-only fallback |

---

## Environment / Demo Accounts

Seeded accounts (password `Passw0rd!23` unless noted), useful for demos:

| Role | Email | Notes |
|---|---|---|
| Jail Superintendent | `superintendent{1..n}@rihai.gov.in` | per-jail superintendents |
| Jail Staff | `staff{n}{a|b}@rihai.gov.in` | facility staff |
| DLSA Lawyer | `dlsa{1..n}@rihai.gov.in` | legal aid |
| NGO Partner | `ngo1@rihai.gov.in` (Meera Sharma), `ngo2@rihai.gov.in` | see `npm run db:seed:ngo` |
| Super Admin | `superadmin@rihai.gov.in` | global admin |

**Prisoner portal** demo accounts (dev-only, PIN `2468`): three deterministic prisoners across the first three jails are auto-provisioned at API startup (outside production). The admin temp-PIN and next-of-kin OTP reset flows are demonstrated through these accounts.

---

## Testing

The project ships both a unit test suite and end-to-end PowerShell smoke suites:

```bash
# Section 479 engine unit tests (node:test)
node --import tsx --test apps/api/tests/section479.spec.ts        # 10/10

# End-to-end HTTP smoke suites (start the API first)
powershell -File scripts/smoke-test-v2.ps1                        # Prompts 1–5 core chains  41/41
powershell -File scripts/smoke-test-v3.ps1                        # Ingestion + PII + MFA     22/22
powershell -File scripts/smoke-test-v4.ps1                        # Prisoner portal          28/28
powershell -File scripts/smoke-test-v5.ps1                        # Family notifications     33/33
powershell -File scripts/final-auth-probe.ps1                     # Auth contract + spot     15/15
```

> `scripts/smoke-test.ps1` (session-1 suite, 34 checks) is superseded by the above against the current dataset seed and is retained as historical. See `SMOKE_TEST_RESULTS.md` for the full per-module matrix and coverage report.

---

## Security & Privacy

RIHAI SETU treats undertrial PII with a production-grade posture:

- **Envelope encryption (`lib/pii.ts`)** — Tier-1 fields (name, DOB, next-of-kin, photo) are AES-256-GCM encrypted per-value with a wrapped DEK; the wire format `v1:key:iv:tag:ct` is designed for AWS KMS/CloudHSM substitution without re-encryption.
- **Blind indexing (`name_idx`)** — HMAC-SHA256 hashes keep exact-name search working over ciphertext while plaintext columns remain `NULL`.
- **Audit trail (`lib/audit.ts`)** — append-only `AuditLog` records PII reads/writes, stage changes, ingestion merges, and data-request lifecycle; LLM inputs/outputs are SHA-256 digests.
- **TOTP MFA** — enforced for super_admin / jail_superintendent once enrolled.
- **Refresh-session rotation** — DB-backed `RefreshSession` (jti + hash, rotation chain), logout revocation, `revoke-all`.
- **DPDP data-principal flow** — data-request correction/deletion with Tier-1 anonymisation that preserves de-identified case stats.

---

## Key Modules & Workflows

| Module | Location | Status |
|---|---|---|
| A — Eligibility & Exclusion Engine | `apps/api/src/domain/section479.ts` | Built |
| B — Application / Paperwork Auto-Generation | superintendent service + `lib/llm.ts` | Built |
| C — Court Filing & Status Tracking | `lib/court-status-provider.ts` | Built (mocked, seam documented) |
| D — Legal Aid & Bond/Surety | court service + surety checklist | Built |
| E — Overcrowding Dashboard & Prediction | overcrowding service + SVG charts | Built |
| F — Rehabilitation Tracking | enrollments, QR certificates, skill passport | Built |
| G — Market Linkage & Post-Release Placement | NGO jobs + recommender bridge + prisoner board | Partially built (see gaps) |
| H — Notifications | templated family messages + Twilio adapter | Built (delivery pending keys) |
| I — Compliance Reporting | per-jail + rollup + exports | Built |

---

## Documentation

- [`RIHAI_SETU_MASTER_DOCUMENTATION.md`](./RIHAI_SETU_MASTER_DOCUMENTATION.md) — full system landscape, tech-stack rationale, and module-by-module working logic.
- [`TO DO — TODO.md`](./TODO.md) — session-by-session living task list with verification notes.
- [`SMOKE_TEST_RESULTS.md`](./SMOKE_TEST_RESULTS.md) — final smoke matrix and an honest coverage report against the original 9-module workplan.
- [`backend/`](./backend/) — the master-context and per-prompt specification files that drove the build.
- `docs/` — architecture / UML / Section 479 flow diagrams and the pitch deck.

---

## Known Gaps

These are explicitly documented rather than hidden:

1. **Prompt 12 workflows are not built** — no specification file was ever present in the repo; they need a dedicated session.
2. **Live Twilio sending** — the infrastructure is complete; real sends activate when credentials are pasted into `.env`.
3. **Real eCourts / e-Prisons integrations** are mocked behind documented seams per the master-context ground rules (no live government scraping).
4. **Public anonymous job board** was replaced by an authenticated NGO dashboard (privacy-first, staff-mediated contact).
5. **Prisoner portal and NGO side are English-only** — the staff app is fully EN/हिंदी.

---

## License

Private / internal project (internal round of Smart India Hackathon 2026). See the master documentation and backend specs for context.
