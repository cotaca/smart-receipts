from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from backend.core.db import get_session

router = APIRouter()


@router.get("/health")
def health_check(session: Session = Depends(get_session)):
    session.exec(select(1))
    return {"status": "ok"}
