from fastapi import FastAPI

from backend.routers import auth, health

app = FastAPI(title="SmartReceipts API")
app.include_router(auth.router)
app.include_router(health.router)
