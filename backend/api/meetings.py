"""Aggregated meetings endpoint.

Cross-task meeting listing so meetings become a first-class surface rather than
a per-task property. Powers:
  - GET /api/meetings           → full aggregated list with filters
  - jt meeting upcoming / next / today CLI commands
  - Dashboard meetings_next column
  - /meetings frontend page

Meeting records stay child-of-task in the DB (task_id NOT NULL). This module
only adds a read-side aggregation view over the existing table.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def _to_context(m: models.Meeting) -> schemas.MeetingWithContext:
    """Project a Meeting + its Task into the denormalized context schema."""
    task = m.task
    return schemas.MeetingWithContext(
        id=m.id,
        task_id=m.task_id,
        task_display_id=getattr(task, "display_id", "") or "",
        task_title=getattr(task, "title", "") or "",
        task_status=getattr(task, "status", "") or "",
        task_stage_id=getattr(task, "stage_id", None),
        task_pipeline_heat=getattr(task, "pipeline_heat", None),
        meeting_type=m.meeting_type,
        scheduled_at=m.scheduled_at,
        interviewer=m.interviewer,
        platform=m.platform,
        join_url=m.join_url,
        status=m.status,
        result=m.result,
        brief_doc_id=m.brief_doc_id,
        notes_doc_id=m.notes_doc_id,
        notes=m.notes,
        position=m.position,
        cockpit_section_count=len(m.cockpit_sections or []),
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    """Accept ISO-8601 with or without tz; return naive UTC for SQLite comparison.

    SQLite stores meeting.scheduled_at as naive (see models.Meeting.scheduled_at),
    so for direct column comparisons we strip tzinfo after converting to UTC.
    """
    if not value:
        return None
    s = value.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


@router.get("", response_model=list[schemas.MeetingWithContext])
@router.get("/", response_model=list[schemas.MeetingWithContext])
def list_meetings_aggregated(
    project_id: Optional[int] = Query(None, description="Filter by project (default: all)"),
    status: Optional[str] = Query(None, description="scheduled|completed|cancelled|rescheduled|no_show"),
    meeting_type: Optional[str] = Query(None, description="phone_screen|technical|behavioral|panel|onsite|other"),
    since: Optional[str] = Query(None, description="ISO-8601: earliest scheduled_at"),
    until: Optional[str] = Query(None, description="ISO-8601: latest scheduled_at"),
    days: Optional[int] = Query(None, ge=0, le=365, description="Convenience: scheduled_at within next N days from now (ignored if since/until set)"),
    include_past: bool = Query(False, description="If true, include meetings with scheduled_at < now"),
    include_unscheduled: bool = Query(True, description="If true, include meetings with scheduled_at IS NULL"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List meetings across tasks, sorted by scheduled_at ascending (NULLs last).

    Default behavior (no filters): returns all upcoming scheduled meetings from
    now onwards, plus any unscheduled ones, across all projects, capped at 100.

    Typical calls:
      GET /api/meetings?days=7                   → next 7 days upcoming
      GET /api/meetings?days=1                   → today + tomorrow
      GET /api/meetings?include_past=true&limit=5 → recent history too
      GET /api/meetings?status=scheduled&project_id=1
    """
    q = (
        db.query(models.Meeting)
        .options(
            joinedload(models.Meeting.task),
            joinedload(models.Meeting.cockpit_sections),
        )
    )

    if project_id is not None:
        q = q.join(models.Task, models.Meeting.task_id == models.Task.id).filter(
            models.Task.project_id == project_id
        )

    if status:
        q = q.filter(models.Meeting.status == status)
    if meeting_type:
        q = q.filter(models.Meeting.meeting_type == meeting_type)

    # Naive UTC for direct comparison with meeting.scheduled_at (stored naive in SQLite)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    since_dt = _parse_dt(since)
    until_dt = _parse_dt(until)

    if since_dt is None and until_dt is None and days is not None:
        since_dt = now
        until_dt = now + timedelta(days=days)

    # Default window: upcoming only, unless include_past is set or explicit since is given
    if since_dt is None and not include_past:
        since_dt = now

    # Build date-window filter; keep unscheduled meetings if include_unscheduled
    scheduled_filters = []
    if since_dt is not None:
        scheduled_filters.append(models.Meeting.scheduled_at >= since_dt)
    if until_dt is not None:
        scheduled_filters.append(models.Meeting.scheduled_at <= until_dt)

    if scheduled_filters:
        window_clause = and_(*scheduled_filters)
        if include_unscheduled:
            q = q.filter(or_(models.Meeting.scheduled_at.is_(None), window_clause))
        else:
            q = q.filter(window_clause)
    elif not include_unscheduled:
        q = q.filter(models.Meeting.scheduled_at.isnot(None))

    # Sort: scheduled ASC with NULLs pushed to end, then by id for stable order
    rows = q.all()
    rows.sort(
        key=lambda m: (
            m.scheduled_at is None,
            m.scheduled_at or datetime.max,
            m.id,
        )
    )
    rows = rows[:limit]

    return [_to_context(m) for m in rows]
