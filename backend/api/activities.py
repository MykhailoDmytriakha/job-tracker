from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("/", response_model=schemas.ActivityJournalPage)
def list_activities(
    project_id: int = Query(...),
    since: Optional[date] = Query(None, description="From date inclusive (YYYY-MM-DD)"),
    until: Optional[date] = Query(None, description="To date inclusive (YYYY-MM-DD)"),
    task_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None, description="Filter by action type, e.g. 'moved', 'note_added'"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = (
        db.query(models.Activity)
        .join(models.Task, models.Activity.task_id == models.Task.id)
        .filter(models.Task.project_id == project_id)
    )

    if since:
        since_dt = datetime(since.year, since.month, since.day, 0, 0, 0)
        query = query.filter(models.Activity.timestamp >= since_dt)

    if until:
        until_dt = datetime(until.year, until.month, until.day, 0, 0, 0) + timedelta(days=1)
        query = query.filter(models.Activity.timestamp < until_dt)

    if task_id is not None:
        query = query.filter(models.Activity.task_id == task_id)

    if action:
        query = query.filter(models.Activity.action == action)

    total = query.count()

    rows = (
        query.order_by(models.Activity.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = [
        schemas.ActivityJournalItem(
            id=row.id,
            task_id=row.task_id,
            task_title=row.task.title,
            action=row.action,
            detail=row.detail,
            timestamp=row.timestamp,
        )
        for row in rows
    ]

    return schemas.ActivityJournalPage(items=items, total=total)
