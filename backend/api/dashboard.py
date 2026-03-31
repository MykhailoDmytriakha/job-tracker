from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone, timedelta

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _aware(dt):
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _last_activity(t: models.Task):
    if t.activities:
        return t.activities[0].timestamp
    return None


@router.get("/", response_model=schemas.DashboardView)
def get_dashboard(project_id: int = None, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    today_end = now.replace(hour=23, minute=59, second=59)
    week_end = today_end + timedelta(days=7)

    # Blocked task IDs
    blocked_rows = db.execute(
        text("""
            SELECT DISTINCT td.task_id
            FROM task_dependencies td
            JOIN tasks t ON t.id = td.depends_on_id
            WHERE t.status NOT IN ('done', 'closed')
        """)
    ).fetchall()
    blocked_ids = {r[0] for r in blocked_rows}

    # All active root tasks (scoped to project if given)
    q = (
        db.query(models.Task)
        .filter(models.Task.status.notin_(["done", "closed"]))
        .filter(models.Task.parent_id.is_(None))
    )
    if project_id is not None:
        q = q.filter(models.Task.project_id == project_id)
    active = q.all()

    today_tasks = []
    upcoming_tasks = []
    recurring_tasks = []

    for t in active:
        due = _aware(t.due_date)
        follow = _aware(t.follow_up_date)
        earliest = due or follow

        # Recurring: separate column, sorted by last activity (stale first)
        if t.is_recurring:
            recurring_tasks.append(t)
            continue

        # Today: overdue OR due today OR follow-up today
        if earliest and earliest <= today_end:
            today_tasks.append(t)
        # Upcoming: due within 7 days
        elif earliest and earliest <= week_end:
            upcoming_tasks.append(t)
        # Waiting tasks with follow-up in next 7 days
        elif t.status == "waiting" and follow and follow <= week_end:
            upcoming_tasks.append(t)

    # Sort: today by urgency (most overdue first)
    today_tasks.sort(key=lambda t: _aware(t.due_date) or _aware(t.follow_up_date) or now)
    # Upcoming by date ascending
    upcoming_tasks.sort(key=lambda t: _aware(t.due_date) or _aware(t.follow_up_date) or week_end)
    # Recurring by last activity (stale first = no activity or oldest activity)
    def _staleness(t):
        la = _last_activity(t)
        if la is None:
            return datetime.min.replace(tzinfo=timezone.utc)
        return _aware(la)
    recurring_tasks.sort(key=_staleness)

    # Stats
    overdue_count = sum(
        1 for t in active if not t.is_recurring and (
            (_aware(t.due_date) and _aware(t.due_date) < now)
            or (_aware(t.follow_up_date) and _aware(t.follow_up_date) < now)
        )
    )
    waiting_count = sum(1 for t in active if t.status == "waiting")

    def brief(t):
        return schemas.TaskBrief(
            id=t.id,
            display_id=t.display_id,
            project_id=t.project_id,
            title=t.title,
            status=t.status,
            priority=t.priority,
            category=t.category,
            stage_id=t.stage_id,
            parent_id=t.parent_id,
            follow_up_date=t.follow_up_date,
            due_date=t.due_date,
            is_recurring=t.is_recurring,
            cadence=t.cadence,
            next_checkpoint=t.next_checkpoint,
            pipeline_heat=t.pipeline_heat,
            lead_source=t.lead_source,
            posting_url=t.posting_url,
            applied_at=t.applied_at,
            compensation=t.compensation,
            outreach_status=t.outreach_status,
            close_reason=t.close_reason,
            is_blocked=t.id in blocked_ids,
            subtask_count=len(t.subtasks),
            subtask_done=sum(1 for s in t.subtasks if s.status == "done"),
            checklist_total=len(t.checklist_items),
            checklist_done=sum(1 for c in t.checklist_items if c.is_done),
            last_activity_at=_last_activity(t),
        )

    return schemas.DashboardView(
        stats=schemas.DashboardStats(
            total_open=len(active),
            waiting=waiting_count,
            overdue=overdue_count,
            blocked=sum(1 for t in active if t.id in blocked_ids),
            recurring=len(recurring_tasks),
        ),
        today=[brief(t) for t in today_tasks],
        upcoming=[brief(t) for t in upcoming_tasks],
        recurring=[brief(t) for t in recurring_tasks],
    )
