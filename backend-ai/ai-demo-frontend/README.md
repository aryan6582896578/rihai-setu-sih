# RIHAI SETU local AI demo

This frontend is deliberately outside the GitHub clone. It is a local demo for
the recommender and chatbot services only; it contains no Express backend,
database, login, or deployment configuration.

## Start the AI services

In one terminal, start the recommender from its own folder on port 8000.

```powershell
cd C:\Users\ThinkPad\Desktop\SIH\rihai-setu-sih-local\backend-ai\recommender-service
python -m uvicorn app.main:app --reload --port 8000
```

In a second terminal, start the chatbot with Ollama enabled on port 8001.

```powershell
cd C:\Users\ThinkPad\Desktop\SIH\rihai-setu-sih-local\backend-ai\chatbot-service
$env:CHATBOT_ENABLE_OLLAMA="true"
$env:OLLAMA_MODEL="llama3.2:latest"
python -m uvicorn app.main:app --reload --port 8001
```

## Start the frontend

```powershell
cd C:\Users\ThinkPad\Desktop\SIH\ai-demo-frontend
npm install
npm run dev
```

Open the address Vite prints, normally `http://localhost:5173`.

The Vite development proxy routes browser requests to the two Python services,
so no CORS changes are required for this local demo.
