# RIHAI SETU FAQ Chatbot

This is a standalone FastAPI service with an approved FAQ catalog and an
optional local Ollama responder. When enabled, Ollama answers ordinary
questions first; the FAQ catalog is the offline fallback. It does not require
a cloud API key, RAG documents or a database. Legal, medical and emergency
questions always receive a safe caseworker or authorized-service escalation
message.

## Run locally

```powershell
cd backend-ai\chatbot-service
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
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
  "escalation_required": false,
  "suggested_questions": []
}
```

## Add or edit FAQs

Edit `app/data/faqs.json`, then restart the service. Every answer should be
reviewed and approved before being added.

## Enable local Ollama

To make the locally installed Ollama model answer normal questions, set these
PowerShell values before starting the service:

```powershell
$env:CHATBOT_ENABLE_OLLAMA="true"
$env:OLLAMA_BASE_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="llama3.2:latest"
```

The local model is never used for legal, medical, emergency, self-harm or
criminal-case questions. When Ollama is off or unavailable, matching approved
FAQ answers are still returned; unmatched questions receive the approved
caseworker message. The existing Express codebase has an optional
`gpt-4o-mini` integration for another feature, but this chatbot does not use a
cloud LLM or any external API key.
