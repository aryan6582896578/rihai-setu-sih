from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.api.v1.overcrowding import router as overcrowding_router
from backend.app.api.v1.rehabilitation import router as rehabilitation_router

app = FastAPI(
    title="AI-Assisted Section 479 Undertrial Release & Prison Rehabilitation API",
    description="Backend API for prison capacity management, Section 479 legal monitoring, and overcrowding forecasting.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(overcrowding_router, prefix="/api/v1")
app.include_router(rehabilitation_router, prefix="/api/v1")

@app.get("/", tags=["System"])
def root():
    return {
        "system": "AI-Assisted Section 479 Undertrial Release & Prison Rehabilitation Platform",
        "api_version": "v1",
        "documentation": "/docs",
        "status": "operational"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
