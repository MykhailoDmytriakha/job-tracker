from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone, timedelta, date as date_type

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

CADENCE_DAYS: dict[str, int] = {
    "daily": 1,
    "weekly": 7,
    "biweekly": 14,
    "monthly": 30,
}


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
    today = date_type.today()
    week_end_date = today + timedelta(days=7)

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
        due_d = t.due_date if t.due_date else None
        follow_d = t.follow_up_date if t.follow_up_date else None
        earliest_d = due_d or follow_d

        # Recurring: separate column, sorted by last activity (stale first)
        if t.is_recurring:
            recurring_tasks.append(t)
            continue

        # Today: overdue OR due/follow-up today
        if earliest_d and earliest_d <= today:
            today_tasks.append(t)
        # Upcoming: within 7 days
        elif earliest_d and earliest_d <= week_end_date:
            upcoming_tasks.append(t)

    _far = date_type(9999, 12, 31)
    today_tasks.sort(key=lambda t: t.due_date or t.follow_up_date or _far)
    upcoming_tasks.sort(key=lambda t: t.due_date or t.follow_up_date or _far)
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
            (t.due_date and t.due_date < today)
            or (t.follow_up_date and t.follow_up_date < today)
        )
    )
    waiting_count = sum(1 for t in active if t.status == "waiting")

    # ── Attention: unified health-check function ──────────────────────────────
    # Each task is counted ONCE even if it matches multiple conditions.
    def _needs_attention(t: models.Task) -> bool:
        la = _last_activity(t)
        la_aware = _aware(la) if la else None
        days_inactive = (now - la_aware).days if la_aware else 9999

        # 1. Non-recurring with no dates at all
        if not t.is_recurring and not t.due_date and not t.follow_up_date:
            return True

        # 2. Recurring that missed 3+ full cycles (no activity)
        if t.is_recurring:
            cadence_days = CADENCE_DAYS.get(t.cadence or "", 1)
            ref = la_aware or (_aware(t.created_at) if hasattr(t, "created_at") and t.created_at else None)
            if ref and (now - ref).days >= cadence_days * 3:
                return True

        # 3. Waiting but follow-up date already passed (missed check-in)
        if t.status == "waiting" and t.follow_up_date and t.follow_up_date < today:
            return True

        # 4. In-progress frozen for 14+ days
        if t.status == "in_progress" and days_inactive >= 14:
            return True

        # 5. High priority with no due date (important but unscheduled)
        if t.priority == "high" and not t.due_date:
            return True

        # 6. Blocked with no movement for 7+ days
        if t.id in blocked_ids and days_inactive >= 7:
            return True

        # 7. Open, never touched (only "created" activity), 10+ days old
        if t.status == "open" and hasattr(t, "created_at") and t.created_at:
            age_days = (now - _aware(t.created_at)).days
            if age_days >= 10:
                has_real_activity = any(a.action != "created" for a in t.activities)
                if not has_real_activity:
                    return True

        return False

    attention_count = sum(1 for t in active if _needs_attention(t))


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
            subtask_count=len(t.subtask_items),
            subtask_done=sum(1 for s in t.subtask_items if s.is_done),
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
            attention=attention_count,
        ),
        today=[brief(t) for t in today_tasks],
        upcoming=[brief(t) for t in upcoming_tasks],
        recurring=[brief(t) for t in recurring_tasks],
    )
