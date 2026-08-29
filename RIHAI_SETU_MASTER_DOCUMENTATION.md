# 🏛️ RIHAI SETU — Master Technical Architecture & System Documentation

> **An End-to-End Platform for Undertrial Bail Acceleration under Section 479 BNSS, In-Custody Skill Passporting, and Post-Release Rehabilitation Placement**

---

## 📖 Executive Summary & Core Mission

**RIHAI SETU** (translates to *"Bridge to Freedom"*) is an enterprise-grade, production-ready digital ecosystem designed to solve one of the most critical structural challenges in the Indian judicial and penal systems: **undertrial prisoner overcrowding and post-release re-integration delays**.

According to National Crime Records Bureau (NCRB) data, over **75% of inmates in Indian prisons are undertrials** (individuals awaiting trial or court decisions who have not been convicted). A vast majority of these undertrials remain incarcerated simply due to poverty, lack of legal representation, inability to furnish monetary bail/surety bonds, or bureaucratic delays in tracking court eligibility.

The enactment of **Section 479 of the Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023** introduced a transformative statutory mandate:
1. **First-Time Offenders**: Mandatory release on personal bond if they have served **one-third (1/3)** of the maximum imprisonment period specified for the offence.
2. **Other Undertrials**: Mandatory release on bail if they have served **one-half (1/2)** of the maximum imprisonment period.
3. **Exclusions**: Offence carrying death penalty or life imprisonment, or multiple pending cases under investigation/trial.

**RIHAI SETU** automates the identification of Section 479 eligible prisoners, auto-drafts legal bail/personal-bond petitions with human-in-the-loop judicial oversight, tracks court proceedings through CNR numbers, assists DLSA (District Legal Services Authority) lawyers with surety management, projects jail overcrowding trends, and bridges in-custody vocational training with post-release NGO employment placement.

---

## 💡 Tech Stack & Architectural Decisions ("Why & What")

The technology stack for RIHAI SETU was chosen to ensure **high performance, strict PII privacy compliance, 100% explainable legal calculations, multi-lingual accessibility, and effortless maintainability**.

```
+---------------------------------------------------------------------------------------------------+
|                                      RIHAI SETU SYSTEM LANDSCAPE                                  |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  |                             FRONTEND WEB APP (React 18 + Vite)                              |  |
|  |   - Tailwind CSS v4 Custom Design System (Terracotta #D9531E / Saffron / Cream / Navy)     |  |
|  |   - TanStack React Query (Server State) | Zustand (Auth State)                              |  |
|  |   - Bi-lingual i18n Engine (English & Hindi) | Zero-Dependency SVG Charting                 |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                │                                                  |
|                                        HTTP REST / JSON                                           |
|                                                ▼                                                  |
|  +---------------------------------------------------------------------------------------------+  |
|  |                             EXPRESS BACKEND API (Node.js + TS)                              |  |
|  |   - Deterministic Section 479 Rule Engine (`domain/section479.ts`)                            |  |
|  |   - Field-Level AES-256-GCM Envelope Encryption & HMAC Blind Indexing (`lib/pii.ts`)        |  |
|  |   - Dual Auth Architecture (Staff JWT + Cookie Refresh | Prisoner Kiosk PIN/Biometrics)    |  |
|  |   - Role-Based Access Control (RBAC) & Per-Jail Membership Authorization                     |  |
|  |   - Node-Cron Nightly Sweeps & Notification Engine (Twilio SMS/WhatsApp Adapter)              |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                      │                       │                                    |
|                      Prisma ORM v6   │                       │ Internal REST HTTP                 |
|                                      ▼                       ▼                                    |
|  +---------------------------------------+       +---------------------------------------------+  |
|  |    POSTGRESQL DATABASE (v17)            |       |     PYTHON FASTAPI RECOMMENDER SERVICE      |  |
|  |  - Encrypted PII Columns              |       |   - RapidFuzz Typo & Alias Extractor        |  |
|  |  - AuditLog & Ingestion Reconciliation|       |   - Canonical Skill Vector Cosine Similarity|  |
|  |  - Append-only Eligibility & Snapshots|       |   - 100-Point Hybrid Scoring Formula        |  |
|  +---------------------------------------+       +---------------------------------------------+  |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

### 1. Frontend: React 18 + TypeScript + Vite + Tailwind CSS v4
* **Why React 18 + TypeScript?**
  Guarantees type safety across complex legal DTOs, application stages, and user roles. React 18’s concurrent rendering handles large tables (e.g., 600+ prisoner directories) without UI stutter.
* **Why Vite?**
  Instant HMR (Hot Module Replacement) and optimized production builds (175+ modular chunks bundled in seconds).
* **Why Tailwind CSS v4 (Custom Design Tokens)?**
  Tailwind v4's CSS `@theme` directives allow defining custom institutional design tokens matching state portal aesthetics:
  * **Primary Terracotta** (`#D9531E`): Represents judicial gravity and warmth.
  * **Accent Saffron** (`#F59E0B`): Highlights status badges, stepper milestones, and callouts.
  * **Deep Navy** (`#1E293B`): Provides executive headers and readable data structures.
  * **Cream & Peach** (`#FAF7F2` / `#FFF6EC`): Soft, accessible background canvas.
* **Why TanStack Query & Zustand?**
  * **TanStack Query (React Query)** handles server state caching, background polling (e.g. 30s stall alerts), automatic query invalidation upon stage transitions, and zero stale UI states.
  * **Zustand** provides lightweight, atomic client-side authentication state persistence without context re-render overhead.

---

### 2. Core API Backend: Node.js + Express + TypeScript + Prisma ORM
* **Why Express + TypeScript?**
  Provides a stable, battle-tested REST architectural pattern with middleware chaining for authentication, audit logging, rate limiting, and RBAC authorization.
* **Why Prisma ORM v6 + PostgreSQL 17?**
  * **PostgreSQL** offers robust relational constraints, raw SQL performance (`$queryRaw` for multi-table LATERAL joins), index support, and JSON column capabilities.
  * **Prisma ORM** provides end-to-end type safety from schema definitions to Express routes. Database migrations (`prisma migrate dev`) ensure schema consistency across environments.
* **Why Node-Cron?**
  Executes automated background tasks every night at 02:00:
  1. Re-calculating Section 479 eligibility across all active prisoners as time passes.
  2. Recording daily facility `OccupancySnapshot` rows for 30/60/90-day capacity trends.
  3. Scanning for stalled applications exceeding stage SLA thresholds and creating `StallAlert` records.

---

### 3. AI Microservice: Python 3.11 + FastAPI + Uvicorn
* **Why a Separate Python FastAPI Microservice for Employment Recommendation?**
  * Python’s rich ecosystem (`RapidFuzz`, `NumPy`, `Scikit-Learn`) allows high-performance fuzzy text matching and vector similarity calculations.
  * Running as a stateless microservice on `http://127.0.0.1:8000` guarantees strict decoupling: **Python NEVER touches the PostgreSQL database directly**. Express handles data retrieval and passes anonymized candidate models over internal REST.
* **Why No Heavy Model Training?**
  Job matching for released prisoners must be **100% explainable and deterministic**. Generative LLMs or black-box embeddings can introduce hallucinations or bias. The service normalizes text, resolves synonyms via `skill_dictionary.json`, performs RapidFuzz typo recovery, and computes cosine similarity over canonical skill vectors with a published **100-point scoring formula**.

---

### 4. PII Security Architecture: AES-256-GCM Envelope Encryption & HMAC Blind Index
* **Why Field-Level Envelope Encryption?**
  Under Indian DPDP (Digital Personal Data Protection) standards, undertrial personal data (Tier-1 PII: Name, Date of Birth, Photo, Next-of-Kin contact) must not be stored in cleartext.
  * **Wire Format**: `v1:<wrappedKey b64>:<iv b64>:<tag b64>:<ciphertext b64>`
  * **Envelope Encryption**: Each value is encrypted with a random 256-bit AES-GCM Data Encryption Key (DEK). The DEK is encrypted (wrapped) with a Master Key (KEK).
  * **AWS KMS Ready**: The wire format is designed so the Master Key can be backed by AWS KMS or CloudHSM without re-encrypting existing database rows.
* **Why HMAC-SHA256 Blind Indexing (`name_idx`)?**
  Because plaintext names are set to `NULL` in the database, SQL `ILIKE` queries cannot search ciphertext. An HMAC-SHA256 hash (`blindIndex("idx:ramesh kumar")`) is computed at write time. Searching for exact names queries the blind index index in SQL, while Node memory decryption allows seamless partial/substring searching across names, registration numbers, and CNR case numbers.

---

## ⚙️ Detailed Module Breakdown & Working Logic

### Module 1: Section 479 BNSS Eligibility Engine (`apps/api/src/domain/section479.ts`)
The eligibility rule engine is written as a pure, deterministic TypeScript function with **zero external state side-effects** and **10/10 automated test coverage**.

#### Decision Rules:
1. **Exclusions (Evaluated First)**:
   * Offence carries death penalty or life imprisonment (`carriesDeathOrLife == true`) $\rightarrow$ **EXCLUDED**.
   * Inmate has multiple pending court cases (`pendingCaseCount > 1`) $\rightarrow$ **EXCLUDED**.
2. **First-Time Offender Threshold**:
   * If `isFirstTimeOffender == true`, threshold fraction is **1/3 (33.33%)** of `maxSentenceMonths`.
3. **Repeat / General Undertrial Threshold**:
   * If `isFirstTimeOffender == false`, threshold fraction is **1/2 (50.00%)** of `maxSentenceMonths`.
4. **Calculations**:
   $$\text{Custody Days} = \lfloor (\text{Current Date} - \text{Custody Start Date}) / 86400000 \rfloor$$
   $$\text{Required Days} = \text{Round}(\text{Max Sentence Months} \times 30.4375 \times \text{Threshold Fraction})$$
   * If $\text{Custody Days} \ge \text{Required Days} \rightarrow$ **ELIGIBLE**.
   * Otherwise $\rightarrow$ **NOT ELIGIBLE** (stating exact days remaining).

---

### Module 2: Legal Paperwork Auto-Generation & Superintendent Portal
Once a prisoner is identified as **ELIGIBLE**, jail staff or the superintendent can auto-draft legal bail/personal-bond petitions.

1. **Auto-Drafting**: Generates a formal HTML legal petition from structured prisoner facts and case records.
2. **LLM Narrative Generation**: Integrates with OpenAI API (or deterministic legal template fallback) to generate the `"grounds for release under Section 479 BNSS"` paragraph.
3. **Mandatory Banner**: Every auto-drafted document embeds a prominent notice:
   > `⚠️ AI-DRAFTED DOCUMENT — PENDING LAWYER REVIEW & SIGNATURE`
4. **Lawyer Review Gate**: The API enforces that an application cannot be advanced to stage `filed` until a DLSA Lawyer (`dlsa_lawyer`) or Superintendent reviews it and sets `reviewed_by` and `reviewed_at`. Premature filing attempts return HTTP `409 Conflict`.

---

### Module 3: Court Filing & Status Tracking (`CourtStatusProvider`)
Tracks the legal application through court proceedings.

* **Adapter Seam**: `CourtStatusProvider` interface allows plugging in real eCourts / e-Prisons APIs.
* **Mock Provider**: Includes a time-accelerated `MockCourtStatusProvider` for live demonstrations. Synchronizing court status calculates hearing dates and returns order outcomes (`granted` vs `denied`).
* **Automated Workflow**: When a court grants bail (`granted`), the system automatically creates a `SuretyStatus` record and advances the application stage to `order_passed`.

---

### Module 4: Legal Aid & Bond / Surety Assistance
Addresses the primary reason undertrials remain stuck after receiving bail: **inability to furnish surety bonds**.

1. **Lawyer Roster Assignment**: Unassigned applications enter a queue. The system supports **Round-Robin** assignment to the least-loaded DLSA Lawyer or manual assignment by superintendents.
2. **Surety Checklist**: Tracks essential release requirements:
   * Identification Documents (Aadhaar / Voter ID verified)
   * Local Surety Holder Verified
   * Solvency Certificate Obtained
   * Personal Bond Executed
3. **Release Enforcement**: The backend prevents advancing an application stage to `released` unless `orderOutcome == "granted"` AND `suretyArranged == true`.

---

### Module 5: Overcrowding Dashboard & 30/60/90-Day Projections
Provides facility-level and state-wide capacity insights.

1. **Nightly Snapshot**: Stores total inmate count, undertrials, convicts, and capacity ratio.
2. **Projection Formula**:
   $$\text{Projected Inmates}(t) = \text{Current Inmates} + (\text{Daily Admission Rate} \times t) - \text{Projected Releases}(t)$$
   Where projected releases account for:
   * Undertrials progressing through Section 479 paperwork.
   * Inmates crossing eligibility thresholds within the $t$-day window.
   * Convicts reaching scheduled sentence completion dates.
3. **Stacked Backlog Breakdown**: Visualizes the difference between **eligible-but-unprocessed** undertrials vs. **genuine structural jail capacity load**.

---

### Module 6: Rehabilitation & Skill Passport
Turns custodial downtime into post-release employment readiness.

* **Vocational Trade Catalog**: 10 standardized trades (e.g., Organic Farming, Electrical Maintenance, Apparel Manufacturing, Computer Basics).
* **Enrollment & Progress**: Tracks workshop hours and completion percentage.
* **QR Certificate Generation**: Generates official PDF/HTML certificates with a QR code pointing to an unalterable verification endpoint (`/verify/certificate/:id`).

---

### Module 7: Python FastAPI Skill Recommender Engine (`backend-ai/recommender-service`)
Evaluates post-release candidates against active NGO trade job postings.

#### **100-Point Hybrid Scoring Formula**:

$$\text{Total Score} = S_{\text{req}} + S_{\text{pref}} + S_{\text{cos}} + S_{\text{cert}} + S_{\text{exp}} + S_{\text{dist}} + S_{\text{cat}}$$

| Component | Max Points | Evaluation Logic |
| :--- | :---: | :--- |
| **Required Skills ($S_{\text{req}}$)** | **35** | Proportional coverage of job's mandatory skill tags. |
| **Preferred Skills ($S_{\text{pref}}$)** | **15** | Proportional coverage of job's preferred skill tags. |
| **Cosine Similarity ($S_{\text{cos}}$)** | **20** | Cosine distance over canonical binary skill vectors. |
| **Required Certificates ($S_{\text{cert}}$)** | **5** | Verified course completion certificates. |
| **Experience Match ($S_{\text{exp}}$)** | **5** | In-custody workshop hours vs. required months. |
| **District Preference ($S_{\text{dist}}$)** | **10** | Home/preferred district alignment with job location. |
| **Category Preference ($S_{\text{cat}}$)** | **10** | Target domain preference match. |

#### **Consent Gating**:
Profile sharing is strictly governed by `Prisoner.consent_to_share_profile`. If consent is not recorded, recommendation queries return zero candidate matches and job application creation returns HTTP `409 Consent Required`.

---

### Module 8: Prisoner Kiosk & Self-Service Portal
Empowers prisoners to track their own legal case progress independently.

* **Supervised Kiosk Authentication**: Prisoners authenticate using their Registration Number + 4-digit PIN (or simulated Kiosk Biometric Fingerprint scan).
* **Plain-Language Legal Stepper**: Translates complex statutory terms into plain language (e.g., *"Your lawyer has filed the petition in District Court. Next hearing: 15 Oct"*).
* **Document Library**: Displays QR trade certificates and court orders (only after lawyer review to prevent premature document leakage).

---

### Module 9: Multi-Lingual & Family Notifications
Keeps inmate families informed across the multi-month legal process.

* **Bi-Lingual Engine (`lib/i18n.tsx`)**: Complete English & Hindi dictionaries for all public and staff pages with dynamic font stack switching.
* **8-Stage Templated Events**: Triggers automated Next-of-Kin SMS/WhatsApp notifications on key milestones (e.g., Petition Drafted, Hearing Scheduled, Bail Granted, Released).
* **Twilio Integration**: Built with `TwilioNotificationProvider` with fallback to in-app logging.

---

## 🗄️ Database Schema Reference (Prisma ORM)

```prisma
// Core Prisma Schema Representation

enum Role {
  super_admin
  jail_superintendent
  jail_staff
  dlsa_lawyer
  ngo_partner
  viewer
}

model User {
  id           String       @id @default(cuid())
  name         String
  email        String       @unique
  passwordHash String       @map("password_hash")
  role         Role
  phone        String?
  isActive     Boolean      @default(true) @map("is_active")
  mfaSecret    String?      @map("mfa_secret")
  mfaEnrolled  Boolean      @default(false) @map("mfa_enrolled")
  jailAccess   JailAccess[]
  createdAt    DateTime     @default(now()) @map("created_at")
}

model Jail {
  id                 String     @id @default(cuid())
  name               String
  state              String
  district           String
  code               String     @unique
  sanctionedCapacity Int        @map("sanctioned_capacity")
  address            String
  contactPhone       String     @map("contact_phone")
  prisoners          Prisoner[]
  staffAccess        JailAccess[]
}

model Prisoner {
  id                     String      @id @default(cuid())
  jailId                 String      @map("jail_id")
  prisonerRegNo          String      @unique @map("prisoner_reg_no")
  gender                 String
  admissionDate          DateTime    @map("admission_date")
  
  // Encrypted Tier-1 PII (AES-256-GCM Envelope Encryption)
  fullNameEnc            String?     @map("full_name_enc")
  dateOfBirthEnc         String?     @map("date_of_birth_enc")
  photoUrlEnc            String?     @map("photo_url_enc")
  nextOfKinNameEnc       String?     @map("next_of_kin_name_enc")
  nextOfKinPhoneEnc      String?     @map("next_of_kin_phone_enc")
  
  // HMAC-SHA256 Blind Index for Exact Search
  nameIdx                String?     @map("name_idx")
  
  // Skill Passport & Rehabilitation
  educationBaseline      String?     @map("education_baseline")
  machinerySkills        String?     @map("machinery_skills")
  targetDomain           String?     @map("target_domain")
  consentToShareProfile Boolean     @default(false) @map("consent_to_share_profile")
  
  // Prisoner Kiosk Authentication
  pinHash                String?     @map("pin_hash")
  pinMustChange          Boolean     @default(false) @map("pin_must_change")
  failedPinAttempts      Int         @default(0) @map("failed_pin_attempts")
  lockedUntil            DateTime?   @map("locked_until")
  
  jail                   Jail        @relation(fields: [jailId], references: [id])
  cases                  CaseRecord[]
  assessments            EligibilityAssessment[]
  applications           Application[]
  enrollments            Enrollment[]
}

model CaseRecord {
  id                   String     @id @default(cuid())
  prisonerId           String     @map("prisoner_id")
  cnrNumber            String?    @map("cnr_number")
  caseNumber           String     @map("case_number")
  courtName            String     @map("court_name")
  offence              String
  maxSentenceMonths    Int        @map("max_sentence_months")
  carriesDeathOrLife   Boolean    @default(false) @map("carries_death_or_life")
  isFirstTimeOffender  Boolean    @default(true) @map("is_first_time_offender")
  pendingCaseCount     Int        @default(0) @map("pending_case_count")
  custodyStartDate     DateTime   @map("custody_start_date")
  caseStatus           String     @map("case_status") // undertrial | convicted
  prisoner             Prisoner   @relation(fields: [prisonerId], references: [id], onDelete: Cascade)
}

model EligibilityAssessment {
  id           String     @id @default(cuid())
  prisonerId   String     @map("prisoner_id")
  status       String     // eligible | not_eligible | excluded
  reason       String
  computedAt   DateTime   @default(now()) @map("computed_at")
  prisoner     Prisoner   @relation(fields: [prisonerId], references: [id], onDelete: Cascade)
}

model Application {
  id                   String     @id @default(cuid())
  prisonerId           String     @map("prisoner_id")
  type                 String     // bail | personal_bond
  stage                String     // flagged | drafted | filed | hearing_scheduled | order_passed | released
  generatedDocumentUrl String?    @map("generated_document_url")
  filedDate            DateTime?  @map("filed_date")
  hearingDate          DateTime?  @map("hearing_date")
  orderOutcome         String?    @map("order_outcome") // granted | denied
  reviewedBy           String?    @map("reviewed_by")
  reviewedAt           DateTime?  @map("reviewed_at")
  prisoner             Prisoner   @relation(fields: [prisonerId], references: [id], onDelete: Cascade)
}
```

---

## 🛠️ Verification & Smoke Test Matrix

The system has been verified using multi-stage automated test suites and PowerShell smoke probes:

```bash
# 1. Section 479 Rule Engine Unit & Branch Tests (10/10 PASS)
node --import tsx --test apps/api/tests/section479.spec.ts

# 2. Workspace Typecheck (0 Errors)
npm run typecheck

# 3. Prompt 1-11 Integration Smoke Suites
powershell -File scripts/smoke-test-v2.ps1    # 41/41 PASS (Core lifecycle, court sync, surety)
powershell -File scripts/smoke-test-v3.ps1    # 22/22 PASS (Ingestion & PII envelope encryption)
powershell -File scripts/smoke-test-v4.ps1    # 28/28 PASS (Prisoner portal & PIN auth)
powershell -File scripts/smoke-test-v5.ps1    # 33/33 PASS (Family notifications & templates)
powershell -File scripts/final-auth-probe.ps1 # 15/15 PASS (Auth security & 401/403 bounds)
```

---

## 🚀 Environment Setup & Deployment Guide

### Prerequisites
* **Node.js**: v20.x or newer
* **Python**: v3.11 or newer
* **PostgreSQL**: v17.x running locally on port `5432`

### 1. Backend Setup & Database Migration
```powershell
# Create PostgreSQL Database
psql -U postgres -c "CREATE DATABASE rihai_setu;"

# Install Monorepo Dependencies
npm install

# Run Prisma Database Migrations & Seed Realistic Synthetic Data
npm run db:migrate
npm run db:seed

# Seed NGO Job Catalog & Test Accounts
npx tsx apps/api/scripts/seed-ngo.ts
```

### 2. Launch FastAPI Recommender Microservice
```powershell
cd backend-ai/recommender-service
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 3. Launch Monorepo Web & API Servers
```powershell
npm run dev
# Starts Express API server on http://localhost:4000
# Starts React Web App on http://localhost:5173
```

---

## 📌 Conclusion

**RIHAI SETU** represents a complete, highly defensible, and privacy-compliant technical solution for judicial undertrial management in India. By combining **deterministic Section 479 BNSS eligibility math**, **AES-256-GCM field-level encryption**, **LLM paperwork auto-drafting**, **court tracking sync**, and **explainable Python skill-matching**, the platform transforms undertrial processing from a slow manual bottleneck into a fast, transparent, and humane digital pathway.
