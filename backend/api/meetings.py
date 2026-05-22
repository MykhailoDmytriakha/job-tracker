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
from typing import Iterable, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, contains_eager, joinedload

from .. import models, schemas
from ..database import get_db
from ..authz import require_project
from .auth import get_current_user

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def _document_id_if_same_project(
    db: Session,
    doc_id: int | None,
    project_id: int | None,
    valid_doc_ids: set[tuple[int, int]] | None = None,
) -> int | None:
    if doc_id is None or project_id is None:
        return None
    if valid_doc_ids is not None:
        return doc_id if (doc_id, project_id) in valid_doc_ids else None
    exists = db.query(models.Document.id).filter(
        models.Document.id == doc_id,
        models.Document.project_id == project_id,
    ).first()
    return doc_id if exists else None


def _valid_doc_ids_for_meetings(
    db: Session,
    meetings: Iterable[models.Meeting],
) -> set[tuple[int, int]]:
    requested_pairs = {
        (doc_id, m.task.project_id)
        for m in meetings
        if m.task is not None and m.task.project_id is not None
        for doc_id in (m.brief_doc_id, m.notes_doc_id)
        if doc_id is not None
    }
    if not requested_pairs:
        return set()
    doc_ids = {doc_id for doc_id, _ in requested_pairs}
    project_ids = {project_id for _, project_id in requested_pairs}
    rows = (
        db.query(models.Document.id, models.Document.project_id)
        .filter(
            models.Document.id.in_(doc_ids),
            models.Document.project_id.in_(project_ids),
        )
        .all()
    )
    existing_pairs = {(doc_id, project_id) for doc_id, project_id in rows}
    return existing_pairs & requested_pairs


def _to_context(
    m: models.Meeting,
    db: Session,
    valid_doc_ids: set[tuple[int, int]] | None = None,
) -> schemas.MeetingWithContext:
    """Project a Meeting + its Task into the denormalized context schema."""
    task = m.task
    project_id = getattr(task, "project_id", None)
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
        brief_doc_id=_document_id_if_same_project(
            db, m.brief_doc_id, project_id, valid_doc_ids
        ),
        notes_doc_id=_document_id_if_same_project(
            db, m.notes_doc_id, project_id, valid_doc_ids
        ),
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
    include_cancelled: bool = Query(False, description="If true, include cancelled/no_show meetings (default: excluded from upcoming view)"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: models.User | None = Depends(get_current_user),
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
            joinedload(models.Meeting.cockpit_sections),
        )
    )

    if project_id is not None:
        require_project(db, project_id, user)

    joined_task = False
    if user is not None:
        q = q.join(
            models.Task,
            models.Meeting.task_id == models.Task.id,
        ).join(
            models.Project,
            models.Task.project_id == models.Project.id,
        ).filter(models.Project.user_id == user.id)
        joined_task = True
    elif project_id is not None:
        q = q.join(models.Task, models.Meeting.task_id == models.Task.id)
        joined_task = True

    q = q.options(
        contains_eager(models.Meeting.task)
        if joined_task
        else joinedload(models.Meeting.task)
    )

    if project_id is not None:
        q = q.filter(models.Task.project_id == project_id)

    if status:
        q = q.filter(models.Meeting.status == status)
    elif not include_cancelled:
        # Default upcoming semantics: cancelled/no_show are not "upcoming" — they never will happen
        q = q.filter(models.Meeting.status.notin_(['cancelled', 'no_show']))
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

    valid_doc_ids = _valid_doc_ids_for_meetings(db, rows)
    return [_to_context(m, db, valid_doc_ids) for m in rows]
