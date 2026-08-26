# RIHAI SETU Scoped RAG Chatbot

This standalone FastAPI service answers scoped questions about RIHAI SETU,
employment, skills, training, rehabilitation and general access to legal-aid
services. It retrieves passages from an approved local knowledge base and asks
Ollama to answer only from those passages. It requires no cloud API key or
database.

The knowledge base contains six official Government of India/NALSA PDFs plus a
curated description of the implemented RIHAI SETU website. A local BM25 text
index provides retrieval. Groq provides fast grounded generation when a key is
configured, while Ollama remains an optional offline fallback. Unrelated
questions are declined. Personal legal, bail, court, medical, emergency and
self-harm questions are safety-routed before retrieval.

## Run locally

```powershell
cd backend-ai\chatbot-service
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$secureGroqKey = Read-Host "Groq API key" -AsSecureString
$env:GROQ_API_KEY = [System.Net.NetworkCredential]::new("", $secureGroqKey).Password
$env:GROQ_MODEL="llama-3.1-8b-instant"
python -m uvicorn app.main:app --reload --port 8001
```

Swagger documentation is at `http://127.0.0.1:8001/docs`.

Run tests with:

```powershell
python -m pytest
```

## API contract for Express

The browser should call Express, and Express should call this service. Do not
expose this service directly to the browser in production.

```text
Browser -> Express /api/v1/chat/ask -> FAQ chatbot /api/v1/chat/ask
```

Set this in the Express environment:

```text
CHATBOT_URL=http://127.0.0.1:8001
```

### List quick-action questions

```text
GET /api/v1/chat/faqs
```

### Ask a question

```text
POST /api/v1/chat/ask
```

Request:

```json
{
  "message": "How do I apply for a recommended job?"
}
```

Response:

```json
{
  "answer": "Open the recommended job...",
  "matched_question": "How do I apply for a recommended job?",
  "category": "Jobs",
  "confidence": 1.0,
  "source": "faq",
  "provider": null,
  "sources": [],
  "escalation_required": false,
  "suggested_questions": []
}
```

Possible `source` values are `rag`, `faq`, `out_of_scope`, `safety` and
`fallback`. RAG responses include document titles, page numbers and official
URLs in the `sources` array.

### Check the knowledge base

```text
GET /api/v1/chat/knowledge
```

It reports whether the index is ready and returns document/chunk counts.

## Add or edit FAQs

Edit `app/data/faqs.json`, then restart the service. Every answer should be
reviewed and approved before being added.

## Rebuild the RAG index

The repository contains a ready index. Rebuild it after adding, replacing or
editing a knowledge document:

```powershell
python -m app.rag_ingest
```

Approved documents are declared in `app/data/documents.json`. Source files live
in `app/data/documents/`, and the generated index is
`app/data/rag_index.json`.

## Fast Groq generation

The service automatically prefers Groq when `GROQ_API_KEY` is present. The
default model is `llama-3.1-8b-instant`; override it with `GROQ_MODEL` when
needed. Never put a real API key in source code, `.env.example`, screenshots or
Git commits.

The question and retrieved public passages are sent to Groq. Do not enter names,
case numbers, prisoner IDs or other personal information in the chatbot.

## Optional local Ollama fallback

To retain Ollama as an offline fallback, also set:

```powershell
$env:CHATBOT_ENABLE_OLLAMA="true"
$env:OLLAMA_BASE_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="llama3.2:latest"
```

Both providers receive only the question and retrieved approved context and
must return `INSUFFICIENT_CONTEXT` when the passages do not support an answer.
If neither provider is available, matching approved FAQs still work.
