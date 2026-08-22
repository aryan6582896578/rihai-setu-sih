# RIHAI SETU employment recommender

This folder contains an independent FastAPI service for post-release employment recommendations. It turns free text into standard skill tags, scores how well a candidate fits a job, and ranks jobs or candidates. Every score is deterministic and returned with its component scores, matches, gaps, and a plain-language explanation so that an Express backend can safely consume it.

The scoring engine remains schema-independent: it accepts validated JSON models and does not know about spreadsheet column positions or database tables. Privacy-safe candidate and job adapters map both supplied synthetic workbooks into those stable models, and an end-to-end command can rank the complete catalog for every consenting candidate.

## Why no model training is needed

This is a deterministic matching problem, not a generative-AI problem. The service normalizes text, resolves aliases through `app/data/skill_dictionary.json`, uses RapidFuzz for controlled typo recovery, and calculates cosine similarity over shared canonical skill vectors. It then applies a published 100-point formula. The same input always produces the same output, and each point can be explained. No LLM, embeddings, external AI API, or model training is required.

## Scoring at a glance

| Component | Maximum |
| --- | ---: |
| Required skills | 35 |
| Preferred skills | 15 |
| Canonical-skill cosine similarity | 20 |
| Required certificates | 5 |
| Experience | 5 |
| Preferred district | 10 |
| Preferred job category | 10 |
| **Total** | **100** |

Skill and certificate coverage is proportional. Experience is proportional until the requirement is met. An empty job requirement receives that component's full points. Component scores and the total are rounded to two decimals and clamped to 0–100.

A candidate who has not consented is ineligible. A closed or paused job is also ineligible. Ranking endpoints exclude ineligible matches unless `include_ineligible` is explicitly enabled where supported.

## Project structure

```text
recommender_service/
|-- app/
|   |-- main.py                 # FastAPI application and router registration
|   |-- schemas.py              # Validated Candidate, Job, request, and response models
|   |-- config.py               # Service settings such as fuzzy-match threshold
|   |-- adapters/
|   |   |-- skill_passport.py   # Candidate workbook to CandidateProfile mapper
|   |   `-- job_catalog.py      # Job workbook to canonical Job mapper
|   |-- routers/
|   |   |-- health.py           # Health endpoint
|   |   |-- skills.py           # Skill-extraction endpoint
|   |   `-- recommendations.py  # Score and ranking endpoints
|   |-- services/
|   |   |-- normalizer.py       # Text cleanup
|   |   |-- skill_extractor.py  # Exact, synonym, and fuzzy skill matching
|   |   |-- similarity.py       # Canonical binary-vector cosine similarity
|   |   |-- geography.py        # Explicit district aliases for preference matching
|   |   |-- scoring.py          # Deterministic hybrid 100-point calculation
|   |   |-- recommender.py      # Eligibility, sorting, and top-k filtering
|   |   `-- explanation.py      # Explanations built from actual results
|   `-- data/
|       `-- skill_dictionary.json
|   `-- workbook_recommender.py # End-to-end workbook ranking command
|-- examples/                   # Copy-ready candidate, job, and score request JSON
|-- tests/                      # Unit and API tests
|-- requirements.txt
`-- README.md
```

## Windows setup

Open PowerShell or Command Prompt, move into this folder, and create a virtual environment. Python 3.11 or newer is required.

```powershell
cd recommender_service
py -m venv .venv
```

Activate it in Command Prompt:

```bat
.venv\Scripts\activate
```

Or activate it in PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

If PowerShell blocks the activation script, allow it for only the current window and try again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.venv\Scripts\Activate.ps1
```

Install the pinned dependencies:

```powershell
pip install -r requirements.txt
```

## Start the API

Run this command from `recommender_service` while the virtual environment is active:

```powershell
uvicorn app.main:app --reload
```

The API is available at `http://127.0.0.1:8000`. Interactive Swagger documentation is at:

```text
http://127.0.0.1:8000/docs
```

FastAPI's OpenAPI document is at `http://127.0.0.1:8000/openapi.json` and its alternative ReDoc page is at `http://127.0.0.1:8000/redoc`.

Stop the development server with `Ctrl+C`.

## Run the tests

From the same folder:

```powershell
pytest
```

For a little more detail, use `pytest -v`.

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Confirm that the service is running |
| `GET` | `/api/v1/skills/catalog` | List canonical skills for UI/backend validation |
| `POST` | `/api/v1/skills/extract` | Extract canonical skills from `{ "text": "..." }` |
| `POST` | `/api/v1/recommendations/score` | Score one candidate against one job |
| `POST` | `/api/v1/recommendations/rank-jobs` | Rank jobs for one candidate |
| `POST` | `/api/v1/recommendations/rank-candidates` | Rank candidates for one job |

Swagger shows the validated request and response schema for every endpoint. Invalid input, such as negative experience or an unsupported job status, receives FastAPI's `422 Unprocessable Entity` response.

Skill lists used by the scoring endpoints are a trusted boundary: put canonical
tags from `app/data/skill_dictionary.json` in `verified_skills`,
`required_skills`, and `preferred_skills`. Use `/api/v1/skills/extract` first
when the source is free text, or use the skill-passport adapter for the synthetic
candidate workbook.
The scorer treats case and space/hyphen/underscore variants as equivalent, but
it deliberately does not infer unverified skills from a job description or
silently fuzzy-match arbitrary profile fields.

For example, `POST /api/v1/skills/extract` with an exact skill phrase:

```json
{
  "text": "Baking"
}
```

returns the normalized input and an auditable match record:

```json
{
  "normalized_text": "baking",
  "matches": [
    {
      "matched_phrase": "baking",
      "canonical_skill": "baking",
      "match_method": "exact",
      "confidence": 100.0
    }
  ]
}
```

Dictionary aliases use `"match_method": "synonym"`, and typo-tolerant matches use `"match_method": "fuzzy"`. The default fuzzy threshold is 85 and can be overridden with the `RECOMMENDER_FUZZY_MATCH_THRESHOLD` environment variable.

## Synthetic skill-passport workbook

The candidate adapter understands the confirmed synthetic workbook columns and
emits only the employment fields allowed by `CandidateProfile`. It deliberately
does not copy prisoner IDs, names, gender, age, conduct grades, savings, NGO
preferences, health/behaviour labels, or verification hashes into scoring.

Validate the workbook and display a safe summary:

```powershell
python -m app.adapters.skill_passport "C:\Users\ThinkPad\Downloads\prisoner_skill_passport_rehab (1).xlsx"
```

Optionally create sanitized CandidateProfile JSON for integration testing:

```powershell
python -m app.adapters.skill_passport `
  "C:\Users\ThinkPad\Downloads\prisoner_skill_passport_rehab (1).xlsx" `
  --output mapped_candidates.json
```

Mapping rules:

| CandidateProfile field | Workbook source/rule |
| --- | --- |
| `candidate_id` | `passport_id` |
| `verified_skills` | Certified trade and machinery phrases mapped through the skill dictionary |
| `certificates` | Optional future `canonical_certificates`; empty in the current workbook |
| `experience_months` | Optional future column; defaults to `0` with a warning |
| `preferred_job_categories` | Canonical snake-case form of `target_job_domain` |
| `preferred_districts` | Pipe-split `preferred_work_districts`, with known labels normalized |
| `available_from` | Optional future `YYYY-MM-DD` column; currently `null` |
| `consent` | Strict Boolean from `consent_to_share_profile` |

`workshop_production_hours` is not converted into employment experience because
training practice and employment experience are not equivalent. Candidates
whose course status is `In_Training` do not receive verified skill tags until an
approved verification rule says otherwise.

## Complete score example

The files in `examples/` describe a consenting candidate who satisfies every requirement of an active bakery job. Therefore this example scores 100.00. From PowerShell, with the API running:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/api/v1/recommendations/score `
  -ContentType "application/json" `
  -InFile examples\match_request.json
```

The request in `examples/match_request.json` is:

```json
{
  "candidate": {
    "candidate_id": "PRI-0009",
    "verified_skills": ["baking", "food_preparation", "kitchen_hygiene"],
    "certificates": ["Food Safety"],
    "experience_months": 10,
    "preferred_job_categories": ["bakery", "food service"],
    "preferred_districts": ["Thane", "Mumbai"],
    "available_from": "2026-06-17",
    "consent": true
  },
  "job": {
    "job_id": "JOB-0007",
    "title": "Bakery Assistant",
    "description": "Assist with bread preparation, baking and kitchen hygiene.",
    "required_skills": ["baking", "food_preparation"],
    "preferred_skills": ["kitchen_hygiene"],
    "required_certificates": ["Food Safety"],
    "minimum_experience_months": 6,
    "job_category": "bakery",
    "district": "Thane",
    "status": "active"
  }
}
```

A successful response has this form:

```json
{
  "candidate_id": "PRI-0009",
  "job_id": "JOB-0007",
  "eligible_for_recommendation": true,
  "score": 100.0,
  "cosine_similarity": 1.0,
  "component_scores": {
    "required_skills": 35.0,
    "preferred_skills": 15.0,
    "skill_similarity": 20.0,
    "certificates": 5.0,
    "experience": 5.0,
    "district": 10.0,
    "category": 10.0
  },
  "matched_required_skills": ["baking", "food_preparation"],
  "missing_required_skills": [],
  "matched_preferred_skills": ["kitchen_hygiene"],
  "missing_certificates": [],
  "explanation": "Recommended because canonical skill cosine similarity is 100.0%; the candidate matches all required skills; matches all preferred skills; has all required certificates; meets the experience requirement with 10 months; prefers work in Thane; prefers bakery work.",
  "ineligibility_reasons": []
}
```

The explanation is generated from the match; it is not a hard-coded template for this candidate.

## Ranking requests

`/rank-jobs` accepts one candidate plus `jobs`, while `/rank-candidates` accepts one job plus `candidates`. Both accept `top_k` and `minimum_score` controls. Results are sorted from highest to lowest score. Ties are resolved by `job_id` for job ranking and `candidate_id` for candidate ranking, so repeated requests remain deterministic. The respective response envelopes are `{ "candidate_id": "...", "recommendations": [...] }` and `{ "job_id": "...", "recommendations": [...] }`.

Example shapes:

```json
{
  "candidate": { "candidate_id": "PRI-0009", "consent": true },
  "jobs": [],
  "top_k": 5,
  "minimum_score": 0,
  "include_ineligible": false
}
```

```json
{
  "job": { "job_id": "JOB-0007", "title": "Bakery Assistant" },
  "candidates": [],
  "top_k": 5,
  "minimum_score": 0
}
```

Use Swagger for complete models; the short objects above rely on list defaults and are only intended to show the wrapper shape.

## Future Express integration

Express should treat this service as an internal REST dependency. It will validate its own request, map application or dataset fields into the stable Candidate and Job JSON contract, call FastAPI, and forward or store the returned recommendation. For example, a future Node.js route can call the score endpoint with the built-in `fetch` API:

```javascript
const recommenderUrl = process.env.RECOMMENDER_URL ?? "http://127.0.0.1:8000";

const response = await fetch(
  `${recommenderUrl}/api/v1/recommendations/score`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ candidate, job }),
  },
);

if (!response.ok) {
  throw new Error(`Recommender returned HTTP ${response.status}`);
}

const recommendation = await response.json();
```

Keep the service URL in environment configuration, set an appropriate timeout, and handle non-2xx responses. Authentication between services is intentionally future work.

## Job workbook and end-to-end recommendations

Validate and canonicalize the supplied job catalog:

```powershell
python -m app.adapters.job_catalog `
  "C:\Users\ThinkPad\Downloads\rihai_setu_synthetic_job_data.xlsx"
```

Run the complete recommender and write privacy-safe ranked results:

```powershell
python -m app.workbook_recommender `
  "C:\Users\ThinkPad\Downloads\prisoner_skill_passport_rehab (1).xlsx" `
  "C:\Users\ThinkPad\Downloads\rihai_setu_synthetic_job_data.xlsx" `
  --top-k 5 `
  --minimum-score 0 `
  --output recommendations.json
```

Unknown job skills fail validation rather than silently mismatching. All source
skill spellings are resolved through the central alias dictionary before exact
coverage and cosine similarity are calculated.

## Dataset integration boundary

```text
Candidate XLSX --> privacy-safe candidate adapter --+
                                                   |
Job XLSX -------> vocabulary-aware job adapter -----+--> stable API models
                                                           |
                                                           v
                                          scoring, cosine and ranking
```

Only the adapters know the workbook column names. They rename fields, split
pipe-delimited values, applies privacy filtering, supplies documented defaults,
and builds CandidateProfile objects. Changing workbook columns affects the
adapter, not the scoring algorithm. New employment vocabulary belongs in
`app/data/skill_dictionary.json`, not in scoring conditionals.

Both supplied synthetic datasets and their adapters are implemented. A future
real job source should keep the same contract with one row/object per vacancy:

| Field | Required meaning |
| --- | --- |
| `job_id` | Unique stable vacancy ID |
| `title` | Human-readable job title |
| `description` | Job description; context only, not silently scored |
| `required_skills` | Canonical skill tags; pipe-delimited or JSON array at the adapter boundary |
| `preferred_skills` | Optional canonical skill tags |
| `required_certificates` | Canonical certificate names/codes used by candidates too |
| `minimum_experience_months` | Non-negative integer |
| `job_category` | Same canonical category taxonomy used by candidates |
| `district` | Same normalized geography vocabulary used by candidates |
| `status` | `active`, `paused`, or `closed` |

Recommended additional operational fields for the Express/NGO system, although
they are not currently scored, include employer/NGO ID, openings, application
deadline, available-from date, wage range, contact channel, and a verification
or last-updated timestamp. Do not include protected or criminal-history criteria.

## Privacy and Phase 1 limits

Only employment-fit data belongs in these requests. Candidate models reject unknown fields, which prevents accidental use of legal or criminal-history attributes. Do not send offence, sentence, case, bail, caste, religion, gender, or recidivism data.

The following are deliberately out of scope:

- frontend screens;
- authentication and authorization;
- SQLAlchemy, SQLite, or a final NGO database;
- LLMs, Ollama, external APIs, embeddings, or model training;
- OCR, scraping, or live prison data;
- deployment and production service-to-service security.

This repository contains the working API contract, both workbook adapters,
canonical vocabulary reconciliation, cosine similarity, deterministic ranking,
and an end-to-end workbook runner. Database, authentication, frontend, and live
job-source integration remain separate Express/application work.
