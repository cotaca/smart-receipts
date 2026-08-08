from fastapi import FastAPI

from backend.routers import health

app = FastAPI(title="SmartReceipts API")
app.include_router(health.router)
