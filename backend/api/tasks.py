import difflib

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session, joinedload, subqueryload
from sqlalchemy import text
from datetime import datetime, timezone, date
from typing import Optional

from ..database import get_db
from .. import models, schemas
from ..dependencies import get_unresolved_blocked_ids, is_task_blocked
from ..usertime import user_today

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def log_activity(db: Session, task_id: int, action: str, detail: str = ""):
    activity = models.Activity(task_id=task_id, action=action, detail=detail)
    db.add(activity)


def _description_diff(old: str, new: str) -> str:
    """Compute a compact line-level diff between old and new description.

    Returns standard -/+ format with 1 line of context.
    For a 500-line description with 1 changed line, stores ~3 lines instead of 500.
    """
    if not old and new:
        # All lines are additions
        return "\n".join(f"+{line}" for line in new.splitlines())
    if old and not new:
        return "[cleared]"
    if old == new:
        return ""

    old_lines = old.splitlines(keepends=True)
    new_lines = new.splitlines(keepends=True)

    diff = list(difflib.unified_diff(old_lines, new_lines, n=1))
    if not diff:
        return ""

    # Strip --- / +++ headers and @@ markers, keep only content
    result_lines = []
    for line in diff:
        if line.startswith("---") or line.startswith("+++"):
            continue
        if line.startswith("@@"):
            if result_lines:
                result_lines.append("...")
            continue
        result_lines.append(line.rstrip("\n"))

    return "\n".join(result_lines)


def _get_blocked_ids(db: Session) -> set[int]:
    return get_unresolved_blocked_ids(db)


def _is_task_blocked(db: Session, task_id: int) -> bool:
    return is_task_blocked(db, task_id)


def _check_circular(db: Session, task_id: int, depends_on_id: int) -> bool:
    """BFS: would adding depends_on_id as a dependency of task_id create a cycle?"""
    visited = set()
    queue = [task_id]
    while queue:
        current = queue.pop(0)
        if current == depends_on_id:
            return True
        if current in visited:
            continue
        visited.add(current)
        rows = db.execute(
            text("SELECT task_id FROM task_dependencies WHERE depends_on_id = :cid"),
            {"cid": current},
        ).fetchall()
        queue.extend(r[0] for r in rows)
    return False


# --- List / Get ---


@router.get("/", response_model=list[schemas.TaskBrief])
def list_tasks(
    project_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    stage_id: Optional[int] = None,
    parent_id: Optional[int] = None,
    root_only: bool = Query(False),
    on_board: Optional[bool] = None,
    is_recurring: Optional[bool] = None,
    overdue: Optional[bool] = None,
    attention: Optional[bool] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    x_timezone: str | None = Header(None),
):
    query = db.query(models.Task).options(
        subqueryload(models.Task.activities),
        subqueryload(models.Task.subtask_items),
        subqueryload(models.Task.checklist_items),
        subqueryload(models.Task.meetings),
        joinedload(models.Task.project),
    )
    if project_id is not None:
        query = query.filter(models.Task.project_id == project_id)
    if status:
        query = query.filter(models.Task.status == status)
    if priority:
        query = query.filter(models.Task.priority == priority)
    if category:
        query = query.filter(models.Task.category == category)
    if stage_id is not None:
        query = query.filter(models.Task.stage_id == stage_id)
    if parent_id is not None:
        query = query.filter(models.Task.parent_id == parent_id)
    if root_only:
        query = query.filter(models.Task.parent_id.is_(None))
    if on_board is True:
        query = query.filter(models.Task.stage_id.isnot(None))
    elif on_board is False:
        query = query.filter(models.Task.stage_id.is_(None))
    if is_recurring is not None:
        query = query.filter(models.Task.is_recurring == is_recurring)
    if search:
        search_clean = search.strip()
        pattern = f"%{search_clean}%"
        from sqlalchemy import or_

        filter_conditions = [
            models.Task.title.ilike(pattern),
            models.Task.description.ilike(pattern),
            models.Task.compensation.ilike(pattern),
            models.Contact.name.ilike(pattern),
            models.Company.name.ilike(pattern),
            models.Activity.detail.ilike(pattern),
        ]

        if search_clean.isdigit():
            filter_conditions.append(models.Task.id == int(search_clean))
            filter_conditions.append(models.Task.sequence_num == int(search_clean))
        else:
            import re
            m = re.match(r'^[A-Za-z0-9]+-(\d+)$', search_clean)
            if m:
                filter_conditions.append(models.Task.sequence_num == int(m.group(1)))

        query = (
            query
            .outerjoin(models.task_contacts, models.Task.id == models.task_contacts.c.task_id)
            .outerjoin(models.Contact, models.Contact.id == models.task_contacts.c.contact_id)
            .outerjoin(models.task_companies, models.Task.id == models.task_companies.c.task_id)
            .outerjoin(models.Company, models.Company.id == models.task_companies.c.company_id)
            .outerjoin(models.Activity, models.Activity.task_id == models.Task.id)
            .filter(or_(*filter_conditions))
            .distinct()
        )
    if overdue:
        today = user_today(x_timezone)
        query = query.filter(
            models.Task.status.notin_(["done", "closed"]),
            (models.Task.due_date < today) | (models.Task.follow_up_date < today),
        )
    if attention:
        now_a = datetime.now(timezone.utc)
        today = user_today(x_timezone)
        tasks_raw = query.filter(
            models.Task.status.notin_(["done", "closed"])
        ).order_by(models.Task.created_at.desc()).all()
        blocked_ids = _get_blocked_ids(db)

        cadence_days_map = {"daily": 1, "weekly": 7, "biweekly": 14, "monthly": 30}

        def _aware(dt):
            if dt is None:
                return None
            return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt

        def _is_attention(t: models.Task) -> bool:
            la = t.activities[0].timestamp if t.activities else None
            la_aware = _aware(la) if la else None
            days_inactive = (now_a - la_aware).days if la_aware else 9999

            # 1. Non-recurring with no dates at all
            if not t.is_recurring and not t.due_date and not t.follow_up_date:
                return True

            # 2. Recurring that missed 3+ full cycles
            if t.is_recurring:
                cadence_days = cadence_days_map.get(t.cadence or "", 1)
                ref = la_aware or (_aware(t.created_at) if hasattr(t, "created_at") and t.created_at else None)
                if ref and (now_a - ref).days >= cadence_days * 3:
                    return True

            # 3. Waiting but follow-up date is today or already passed (missed check-in)
            if t.status == "waiting" and t.follow_up_date and t.follow_up_date <= today:
                return True

            # 4. In-progress frozen for 14+ days
            if t.status == "in_progress" and days_inactive >= 14:
                return True

            # 5. High priority with no due date
            if t.priority == "high" and not t.due_date:
                return True

            # 6. Blocked with no movement for 7+ days
            if t.id in blocked_ids and days_inactive >= 7:
                return True

            # 7. Open, never touched (only "created" activity), 10+ days old
            if t.status == "open" and hasattr(t, "created_at") and t.created_at:
                age_days = (now_a - _aware(t.created_at)).days
                if age_days >= 10:
                    has_real_activity = any(a.action != "created" for a in t.activities)
                    if not has_real_activity:
                        return True

            return False

        return [_brief(t, t.id in blocked_ids) for t in tasks_raw if _is_attention(t)]

    tasks = query.order_by(models.Task.created_at.desc()).all()
    blocked_ids = _get_blocked_ids(db)
    return [_brief(t, t.id in blocked_ids) for t in tasks]


@router.get("/{task_id}", response_model=schemas.TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = (
        db.query(models.Task)
        .options(
            subqueryload(models.Task.activities),
            subqueryload(models.Task.subtask_items),
            subqueryload(models.Task.checklist_items),
            subqueryload(models.Task.meetings),
            subqueryload(models.Task.documents),
            subqueryload(models.Task.contacts),
            subqueryload(models.Task.companies),
            subqueryload(models.Task.blocked_by),
            subqueryload(models.Task.blocks),
            joinedload(models.Task.project),
        )
        .filter(models.Task.id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    is_blocked = _is_task_blocked(db, task_id)
    return _full(task, is_blocked)


# --- Create / Update / Delete ---


@router.post("/", response_model=schemas.TaskOut, status_code=201)
def create_task(
    task: schemas.TaskCreate,
    project_id: int = Query(..., description="Project to create the task in"),
    force: bool = Query(False, description="Skip duplicate title check"),
    db: Session = Depends(get_db),
):
    # Validate project exists
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    data = task.model_dump()
    if data.get("status") == "waiting" and not data.get("follow_up_date"):
        raise HTTPException(
            status_code=422, detail="Waiting tasks must have a follow_up_date"
        )

    # Duplicate title check (case-insensitive, same project)
    if not force:
        existing = db.query(models.Task).filter(
            models.Task.project_id == project_id,
            models.Task.title.ilike(data["title"].strip()),
        ).first()
        if existing:
            display = getattr(existing, "display_id", None) or f"#{existing.id}"
            raise HTTPException(
                status_code=409,
                detail=f"Duplicate title: task '{existing.title}' already exists as {display} (status={existing.status}). Use ?force=true to create anyway.",
            )

    # Auto-increment sequence within project
    from sqlalchemy import func
    max_seq = db.query(func.max(models.Task.sequence_num)).filter(
        models.Task.project_id == project_id
    ).scalar() or 0

    db_task = models.Task(**data, project_id=project_id, sequence_num=max_seq + 1)
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    log_activity(db, db_task.id, "created", f"Task created: {db_task.title}")
    db.commit()
    db.refresh(db_task)
    return _full(db_task, False)


@router.put("/{task_id}", response_model=schemas.TaskOut)
def update_task(
    task_id: int, task: schemas.TaskUpdate, db: Session = Depends(get_db)
):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    changes = task.model_dump(exclude_unset=True)

    # Waiting enforcement
    new_status = changes.get("status")
    if new_status == "waiting":
        new_follow_up = changes.get("follow_up_date", db_task.follow_up_date)
        if not new_follow_up:
            raise HTTPException(
                status_code=422, detail="Waiting tasks must have a follow_up_date"
            )

    # Enforcement: cannot close if blockers, open subtasks, or unchecked checklist
    if new_status in ("done", "closed"):
        # Dependencies
        unresolved = [
            dep for dep in db_task.blocked_by
            if dep.status not in ("done", "closed")
        ]
        if unresolved:
            names = ", ".join(f"#{d.id} {d.title}" for d in unresolved)
            raise HTTPException(
                status_code=409,
                detail=f"Complete {names} first, then you can close this task",
            )

        # Open child tasks (via parent_id)
        open_children = db.query(models.Task).filter(
            models.Task.parent_id == db_task.id,
            models.Task.status.notin_(["done", "closed"]),
        ).all()
        if open_children:
            names = ", ".join(f"#{c.id} {c.title}" for c in open_children[:3])
            remaining = f" and {len(open_children) - 3} more" if len(open_children) > 3 else ""
            raise HTTPException(
                status_code=409,
                detail=f"Complete {len(open_children)} subtask(s) first: {names}{remaining}",
            )

        # Open subtask items
        open_subs = [s for s in db_task.subtask_items if not s.is_done]
        if open_subs:
            names = ", ".join(s.title for s in open_subs[:3])
            remaining = f" and {len(open_subs) - 3} more" if len(open_subs) > 3 else ""
            raise HTTPException(
                status_code=409,
                detail=f"Complete {len(open_subs)} subtask(s) first: {names}{remaining}",
            )

        # Unchecked checklist items
        unchecked = [c for c in db_task.checklist_items if not c.is_done]
        if unchecked:
            raise HTTPException(
                status_code=409,
                detail=f"Check off {len(unchecked)} checklist item(s) first",
            )

    # Activity logging
    if "stage_id" in changes and changes["stage_id"] != db_task.stage_id:
        old = (
            db.query(models.Stage).filter(models.Stage.id == db_task.stage_id).first()
            if db_task.stage_id
            else None
        )
        new = (
            db.query(models.Stage).filter(models.Stage.id == changes["stage_id"]).first()
            if changes["stage_id"]
            else None
        )
        log_activity(
            db, task_id, "moved",
            f"{old.name if old else '-'} -> {new.name if new else '-'}",
        )

    if "status" in changes and changes["status"] != db_task.status:
        log_activity(
            db, task_id, "status_changed",
            f"{db_task.status} -> {changes['status']}",
        )

    if "description" in changes and changes["description"] != db_task.description:
        diff = _description_diff(db_task.description or "", changes["description"] or "")
        if diff:
            log_activity(db, task_id, "description_updated", diff)

    if "category" in changes and changes["category"] != db_task.category:
        log_activity(
            db, task_id, "category_changed",
            f"{db_task.category or '-'} -> {changes['category'] or '-'}",
        )

    if "priority" in changes and changes["priority"] != db_task.priority:
        log_activity(
            db, task_id, "priority_changed",
            f"{db_task.priority} -> {changes['priority']}",
        )

    if "title" in changes and changes["title"] != db_task.title:
        log_activity(db, task_id, "title_changed", f'"{db_task.title}" -> "{changes["title"]}"')

    def _fmt_date(d):
        return d.strftime("%Y-%m-%d") if d else "none"

    if "due_date" in changes and changes["due_date"] != db_task.due_date:
        log_activity(db, task_id, "due_date_changed",
                     f"{_fmt_date(db_task.due_date)} -> {_fmt_date(changes['due_date'])}")

    if "follow_up_date" in changes and changes["follow_up_date"] != db_task.follow_up_date:
        log_activity(db, task_id, "follow_up_date_changed",
                     f"{_fmt_date(db_task.follow_up_date)} -> {_fmt_date(changes['follow_up_date'])}")

    if "pipeline_heat" in changes and changes["pipeline_heat"] != db_task.pipeline_heat:
        log_activity(db, task_id, "heat_changed",
                     f"{db_task.pipeline_heat or '-'} -> {changes['pipeline_heat'] or '-'}")

    if "outreach_status" in changes and changes["outreach_status"] != db_task.outreach_status:
        log_activity(db, task_id, "outreach_changed",
                     f"{db_task.outreach_status or '-'} -> {changes['outreach_status'] or '-'}")

    if "close_reason" in changes and changes["close_reason"] != db_task.close_reason:
        log_activity(db, task_id, "close_reason_set", f"Reason: {changes['close_reason']}")

    if "applied_at" in changes and changes["applied_at"] != db_task.applied_at:
        if changes["applied_at"]:
            log_activity(db, task_id, "applied", f"Applied: {_fmt_date(changes['applied_at'])}")

    db_task.updated_at = datetime.now(timezone.utc)
    for key, value in changes.items():
        setattr(db_task, key, value)

    db.commit()
    db.refresh(db_task)
    is_blocked = _is_task_blocked(db, task_id)
    return _full(db_task, is_blocked)


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    force: bool = Query(False),
    db: Session = Depends(get_db),
):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    has_blockers = len(db_task.blocked_by) > 0
    has_dependents = len(db_task.blocks) > 0

    # Middle of chain: both blockers and dependents - would break the chain
    if has_blockers and has_dependents:
        blocker_names = ", ".join(f"#{d.id} {d.title}" for d in db_task.blocked_by[:3])
        dependent_names = ", ".join(f"#{d.id} {d.title}" for d in db_task.blocks[:3])
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete: this task is in the middle of a dependency chain. "
                f"Blocked by: {blocker_names}. "
                f"Blocks: {dependent_names}. "
                f"Remove dependencies first."
            ),
        )

    # Leaf with dependents only (others depend on this) - warn, require force
    if has_dependents and not force:
        dependent_names = ", ".join(f"#{d.id} {d.title}" for d in db_task.blocks)
        raise HTTPException(
            status_code=409,
            detail=(
                f"This task blocks {len(db_task.blocks)} other task(s): {dependent_names}. "
                f"Deleting will unblock them. Confirm to proceed."
            ),
        )

    # Leaf with blockers only (this depends on others) - warn, require force
    if has_blockers and not force:
        blocker_names = ", ".join(f"#{d.id} {d.title}" for d in db_task.blocked_by)
        raise HTTPException(
            status_code=409,
            detail=(
                f"This task is blocked by {len(db_task.blocked_by)} task(s): {blocker_names}. "
                f"Confirm to proceed."
            ),
        )

    # Clear and delete
    db_task.blocked_by.clear()
    db_task.blocks.clear()
    # Detach child tasks (via parent_id)
    db.query(models.Task).filter(models.Task.parent_id == db_task.id).update(
        {"parent_id": None}, synchronize_session="fetch"
    )
    for sub in list(db_task.subtask_items):
        db.delete(sub)
    db.delete(db_task)
    db.commit()
    return {"ok": True}


# --- Notes ---


@router.post("/{task_id}/log")
def add_log(task_id: int, body: dict, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    log_activity(db, task_id, "note_added", body.get("text", ""))
    task.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


# --- Dependencies ---


@router.get("/{task_id}/dependencies")
def get_dependencies(task_id: int, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {
        "blocked_by": [
            schemas.TaskDependencyBrief(id=d.id, title=d.title, status=d.status, display_id=d.display_id)
            for d in task.blocked_by
        ],
        "blocks": [
            schemas.TaskDependencyBrief(id=d.id, title=d.title, status=d.status, display_id=d.display_id)
            for d in task.blocks
        ],
    }


@router.get("/{task_id}/chain")
def get_dependency_chain(task_id: int, db: Session = Depends(get_db)):
    """Walk the full dependency chain through this task.

    Returns an ordered list of chain nodes from roots (no blockers)
    to leaves (blocks nothing). Each node has id, title, status,
    and a flag `is_current` for the requested task.
    """
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Collect all tasks connected to this one via dependencies
    visited: dict[int, models.Task] = {}
    queue = [task]
    while queue:
        t = queue.pop(0)
        if t.id in visited:
            continue
        visited[t.id] = t
        for dep in t.blocked_by:
            if dep.id not in visited:
                queue.append(dep)
        for dep in t.blocks:
            if dep.id not in visited:
                queue.append(dep)

    if len(visited) <= 1:
        return {"nodes": [], "edges": [], "total": 0}

    # Build adjacency: blocker -> blocked (upstream to downstream)
    edges: dict[int, list[int]] = {tid: [] for tid in visited}
    in_degree: dict[int, int] = {tid: 0 for tid in visited}
    for tid, t in visited.items():
        for dep in t.blocked_by:
            if dep.id in visited:
                edges[dep.id].append(tid)
                in_degree[tid] += 1

    # Topological sort (Kahn's)
    sorted_ids: list[int] = []
    q = [tid for tid, deg in in_degree.items() if deg == 0]
    while q:
        q.sort()  # deterministic order
        n = q.pop(0)
        sorted_ids.append(n)
        for child in edges[n]:
            in_degree[child] -= 1
            if in_degree[child] == 0:
                q.append(child)

    # Build nodes
    nodes = []
    for tid in sorted_ids:
        t = visited[tid]
        nodes.append({
            "id": t.id,
            "title": t.title,
            "status": t.status,
            "is_current": tid == task_id,
        })

    # Build edge list: [from_id, to_id] (blocker -> blocked)
    edge_list = []
    for tid, t in visited.items():
        for dep in t.blocked_by:
            if dep.id in visited:
                edge_list.append([dep.id, tid])

    # Compute layers (longest path from roots) for DAG layout
    layers: dict[int, int] = {}
    def _layer(tid: int) -> int:
        if tid in layers:
            return layers[tid]
        t = visited[tid]
        parents_in_graph = [d.id for d in t.blocked_by if d.id in visited]
        if not parents_in_graph:
            layers[tid] = 0
        else:
            layers[tid] = max(_layer(p) for p in parents_in_graph) + 1
        return layers[tid]
    for tid in visited:
        _layer(tid)

    for node in nodes:
        node["layer"] = layers[node["id"]]

    return {
        "nodes": nodes,
        "edges": edge_list,
        "total": len(nodes),
    }


@router.post("/{task_id}/dependencies")
def add_dependency(
    task_id: int, body: schemas.DependencyCreate, db: Session = Depends(get_db)
):
    if task_id == body.depends_on_id:
        raise HTTPException(status_code=400, detail="Task cannot depend on itself")

    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    dep = db.query(models.Task).filter(models.Task.id == body.depends_on_id).first()
    if not task or not dep:
        raise HTTPException(status_code=404, detail="Task not found")

    if dep in task.blocked_by:
        raise HTTPException(status_code=400, detail="Dependency already exists")

    if _check_circular(db, task_id, body.depends_on_id):
        raise HTTPException(
            status_code=400, detail="Adding this dependency would create a cycle"
        )

    task.blocked_by.append(dep)
    log_activity(db, task_id, "dependency_added", f"Now blocked by #{dep.id} {dep.title}")
    log_activity(db, dep.id, "blocks_added", f"Now blocks #{task.id} {task.title}")
    db.commit()
    return {"ok": True}


@router.delete("/{task_id}/dependencies/{dep_id}")
def remove_dependency(task_id: int, dep_id: int, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    dep = db.query(models.Task).filter(models.Task.id == dep_id).first()
    if not task or not dep:
        raise HTTPException(status_code=404, detail="Task not found")

    if dep not in task.blocked_by:
        raise HTTPException(status_code=404, detail="Dependency not found")

    task.blocked_by.remove(dep)
    log_activity(db, task_id, "dependency_removed", f"No longer blocked by #{dep.id} {dep.title}")
    log_activity(db, dep.id, "blocks_removed", f"No longer blocks #{task.id} {task.title}")
    db.commit()
    return {"ok": True}


# --- Checklist ---


@router.post("/{task_id}/checklist", response_model=schemas.ChecklistItemOut, status_code=201)
def add_checklist_item(
    task_id: int, item: schemas.ChecklistItemCreate, db: Session = Depends(get_db)
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    db_item = models.ChecklistItem(task_id=task_id, text=item.text, position=item.position)
    db.add(db_item)
    log_activity(db, task_id, "checklist_added", f"Checklist item added: {item.text}")
    task.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.put("/{task_id}/checklist/{item_id}", response_model=schemas.ChecklistItemOut)
def update_checklist_item(
    task_id: int,
    item_id: int,
    update: schemas.ChecklistItemUpdate,
    db: Session = Depends(get_db),
):
    db_item = (
        db.query(models.ChecklistItem)
        .filter(models.ChecklistItem.id == item_id, models.ChecklistItem.task_id == task_id)
        .first()
    )
    if not db_item:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    changes = update.model_dump(exclude_unset=True)
    if "is_done" in changes and changes["is_done"] != db_item.is_done:
        state = "checked" if changes["is_done"] else "unchecked"
        log_activity(db, task_id, "checklist_toggled", f"{state}: {db_item.text}")

    for key, value in changes.items():
        setattr(db_item, key, value)

    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if task:
        task.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/{task_id}/checklist/{item_id}")
def delete_checklist_item(task_id: int, item_id: int, db: Session = Depends(get_db)):
    db_item = (
        db.query(models.ChecklistItem)
        .filter(models.ChecklistItem.id == item_id, models.ChecklistItem.task_id == task_id)
        .first()
    )
    if not db_item:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    log_activity(db, task_id, "checklist_removed", f"Removed: {db_item.text}")
    db.delete(db_item)
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if task:
        task.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/{task_id}/checklist/reorder")
def reorder_checklist(task_id: int, order: list[dict], db: Session = Depends(get_db)):
    for item in order:
        db.query(models.ChecklistItem).filter(
            models.ChecklistItem.id == item["id"],
            models.ChecklistItem.task_id == task_id,
        ).update({"position": item["position"]})
    db.commit()
    return {"ok": True}


# --- Task Documents ---


@router.get("/{task_id}/documents", response_model=list[schemas.DocumentBrief])
def get_task_documents(task_id: int, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task.documents


@router.post("/{task_id}/documents")
def link_document(task_id: int, body: schemas.DocumentLinkRequest, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    doc = db.query(models.Document).filter(models.Document.id == body.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc in task.documents:
        raise HTTPException(status_code=400, detail="Already linked")
    task.documents.append(doc)
    log_activity(db, task_id, "document_linked", doc.title)
    db.commit()
    return {"ok": True}


@router.delete("/{task_id}/documents/{doc_id}")
def unlink_document(task_id: int, doc_id: int, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc in task.documents:
        task.documents.remove(doc)
        log_activity(db, task_id, "document_unlinked", doc.title)
    db.commit()
    return {"ok": True}


# --- Task Contacts ---


@router.get("/{task_id}/contacts", response_model=list[schemas.ContactBrief])
def get_task_contacts(task_id: int, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task.contacts


@router.post("/{task_id}/contacts")
def link_contact(task_id: int, body: schemas.ContactLinkRequest, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    contact = db.query(models.Contact).filter(models.Contact.id == body.contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    if contact in task.contacts:
        raise HTTPException(status_code=400, detail="Already linked")
    task.contacts.append(contact)
    log_activity(db, task_id, "contact_linked", contact.name)
    db.commit()
    return {"ok": True}


@router.delete("/{task_id}/contacts/{contact_id}")
def unlink_contact(task_id: int, contact_id: int, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if contact and contact in task.contacts:
        task.contacts.remove(contact)
        log_activity(db, task_id, "contact_unlinked", contact.name)
    db.commit()
    return {"ok": True}


# --- Task Companies ---


@router.post("/{task_id}/companies")
def link_company(task_id: int, body: schemas.CompanyLinkRequest, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    company = db.query(models.Company).filter(models.Company.id == body.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if company in task.companies:
        raise HTTPException(status_code=400, detail="Already linked")
    task.companies.append(company)
    log_activity(db, task_id, "company_linked", company.name)
    db.commit()
    return {"ok": True}


@router.delete("/{task_id}/companies/{company_id}")
def unlink_company(task_id: int, company_id: int, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if company and company in task.companies:
        task.companies.remove(company)
        log_activity(db, task_id, "company_unlinked", company.name)
    db.commit()
    return {"ok": True}


# --- Helpers ---


def _last_activity(t: models.Task):
    """Most recent activity timestamp, or None."""
    if t.activities:
        return t.activities[0].timestamp  # ordered desc
    return None


def _brief(t: models.Task, is_blocked: bool = False) -> schemas.TaskBrief:
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
        is_blocked=is_blocked,
        subtask_count=len(t.subtask_items),
        subtask_done=sum(1 for s in t.subtask_items if s.is_done),
        checklist_total=len(t.checklist_items),
        checklist_done=sum(1 for c in t.checklist_items if c.is_done),
        meetings_total=len(t.meetings),
        meetings_upcoming=sum(1 for m in t.meetings if m.status == "scheduled"),
        last_activity_at=_last_activity(t),
    )


def _full(t: models.Task, is_blocked: bool = False) -> schemas.TaskOut:
    return schemas.TaskOut(
        id=t.id,
        display_id=t.display_id,
        project_id=t.project_id,
        title=t.title,
        description=t.description,
        status=t.status,
        priority=t.priority,
        category=t.category,
        stage_id=t.stage_id,
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
        is_blocked=is_blocked,
        created_at=t.created_at,
        updated_at=t.updated_at,
        subtask_count=len(t.subtask_items),
        subtask_done=sum(1 for s in t.subtask_items if s.is_done),
        checklist_total=len(t.checklist_items),
        checklist_done=sum(1 for c in t.checklist_items if c.is_done),
        meetings_total=len(t.meetings),
        meetings_upcoming=sum(1 for m in t.meetings if m.status == "scheduled"),
        last_activity_at=_last_activity(t),
        meetings=[
            schemas.MeetingOut(
                id=m.id, task_id=m.task_id, meeting_type=m.meeting_type,
                scheduled_at=m.scheduled_at, interviewer=m.interviewer,
                platform=m.platform, join_url=m.join_url, status=m.status,
                result=m.result, brief_doc_id=m.brief_doc_id,
                notes_doc_id=m.notes_doc_id, notes=m.notes,
                position=m.position,
                cockpit_sections=[
                    schemas.CockpitSectionOut(
                        id=s.id,
                        meeting_id=s.meeting_id,
                        section_key=s.section_key,
                        content=s.content,
                        position=s.position,
                        created_at=s.created_at,
                        updated_at=s.updated_at,
                    )
                    for s in m.cockpit_sections
                ],
                created_at=m.created_at,
                updated_at=m.updated_at,
            )
            for m in t.meetings
        ],
        subtask_items=[
            schemas.SubtaskItemOut(
                id=s.id, task_id=s.task_id, title=s.title,
                description=s.description, is_done=s.is_done, position=s.position,
            )
            for s in t.subtask_items
        ],
        activities=[
            schemas.ActivityOut(
                id=a.id, task_id=a.task_id, action=a.action,
                detail=a.detail, timestamp=a.timestamp,
            )
            for a in t.activities
        ],
        checklist_items=[
            schemas.ChecklistItemOut(
                id=c.id, task_id=c.task_id, text=c.text,
                is_done=c.is_done, position=c.position,
            )
            for c in t.checklist_items
        ],
        blocked_by=[
            schemas.TaskDependencyBrief(id=d.id, title=d.title, status=d.status, display_id=d.display_id)
            for d in t.blocked_by
        ],
        blocks=[
            schemas.TaskDependencyBrief(id=d.id, title=d.title, status=d.status, display_id=d.display_id)
            for d in t.blocks
        ],
        documents=[
            schemas.DocumentBrief(
                id=d.id, project_id=d.project_id, title=d.title,
                doc_type=d.doc_type, updated_at=d.updated_at,
            )
            for d in t.documents
        ],
        contacts=[
            schemas.ContactBrief(
                id=c.id, project_id=c.project_id, name=c.name,
                company=c.company, role=c.role,
                contact_type=c.contact_type, email=c.email,
                updated_at=c.updated_at,
            )
            for c in t.contacts
        ],
        companies=[
            schemas.CompanyBrief(
                id=co.id, project_id=co.project_id, name=co.name,
                short_name=co.short_name, company_type=co.company_type,
                domain=co.domain, strategic_lane=co.strategic_lane,
                updated_at=co.updated_at,
            )
            for co in t.companies
        ],
    )


# --- Subtask Items ---


@router.post("/{task_id}/subtask-items", response_model=schemas.SubtaskItemOut, status_code=201)
def add_subtask_item(task_id: int, item: schemas.SubtaskItemCreate, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    max_pos = max((s.position for s in task.subtask_items), default=-1)
    db_item = models.SubtaskItem(
        task_id=task_id,
        title=item.title,
        description=item.description,
        position=max_pos + 1,
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.put("/{task_id}/subtask-items/{item_id}", response_model=schemas.SubtaskItemOut)
def update_subtask_item(task_id: int, item_id: int, item: schemas.SubtaskItemUpdate, db: Session = Depends(get_db)):
    db_item = db.query(models.SubtaskItem).filter(
        models.SubtaskItem.id == item_id, models.SubtaskItem.task_id == task_id
    ).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Subtask item not found")
    for field, value in item.model_dump(exclude_unset=True).items():
        setattr(db_item, field, value)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/{task_id}/subtask-items/{item_id}")
def delete_subtask_item(task_id: int, item_id: int, db: Session = Depends(get_db)):
    db_item = db.query(models.SubtaskItem).filter(
        models.SubtaskItem.id == item_id, models.SubtaskItem.task_id == task_id
    ).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Subtask item not found")
    db.delete(db_item)
    db.commit()
    return {"ok": True}


# --- Meetings ---


@router.post("/{task_id}/meetings", response_model=schemas.MeetingOut, status_code=201)
def add_meeting(task_id: int, meeting: schemas.MeetingCreate, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    max_pos = max((m.position for m in task.meetings), default=-1)
    db_meeting = models.Meeting(
        task_id=task_id,
        meeting_type=meeting.meeting_type,
        scheduled_at=meeting.scheduled_at,
        interviewer=meeting.interviewer,
        platform=meeting.platform,
        join_url=meeting.join_url,
        status=meeting.status,
        result=meeting.result,
        brief_doc_id=meeting.brief_doc_id,
        notes_doc_id=meeting.notes_doc_id,
        notes=meeting.notes,
        position=max_pos + 1,
    )
    db.add(db_meeting)
    db.commit()
    db.refresh(db_meeting)
    log_activity(db, task_id, "meeting_added", f"type={meeting.meeting_type} status={meeting.status}")
    return db_meeting


@router.get("/{task_id}/meetings", response_model=list[schemas.MeetingOut])
def list_meetings(task_id: int, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task.meetings


@router.put("/{task_id}/meetings/{meeting_id}", response_model=schemas.MeetingOut)
def update_meeting(task_id: int, meeting_id: int, meeting: schemas.MeetingUpdate, db: Session = Depends(get_db)):
    db_meeting = db.query(models.Meeting).filter(
        models.Meeting.id == meeting_id, models.Meeting.task_id == task_id
    ).first()
    if not db_meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    for field, value in meeting.model_dump(exclude_unset=True).items():
        setattr(db_meeting, field, value)
    db.commit()
    db.refresh(db_meeting)
    log_activity(db, task_id, "meeting_updated", f"meeting_id={meeting_id}")
    return db_meeting


@router.delete("/{task_id}/meetings/{meeting_id}")
def delete_meeting(task_id: int, meeting_id: int, db: Session = Depends(get_db)):
    db_meeting = db.query(models.Meeting).filter(
        models.Meeting.id == meeting_id, models.Meeting.task_id == task_id
    ).first()
    if not db_meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    mtype = db_meeting.meeting_type
    db.delete(db_meeting)
    db.commit()
    log_activity(db, task_id, "meeting_deleted", f"meeting_id={meeting_id} type={mtype}")
    return {"ok": True}


# --- Cockpit Sections ---


@router.get("/{task_id}/meetings/{meeting_id}/cockpit", response_model=list[schemas.CockpitSectionOut])
def list_cockpit_sections(task_id: int, meeting_id: int, db: Session = Depends(get_db)):
    meeting = db.query(models.Meeting).filter(
        models.Meeting.id == meeting_id, models.Meeting.task_id == task_id
    ).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting.cockpit_sections


@router.put("/{task_id}/meetings/{meeting_id}/cockpit", response_model=list[schemas.CockpitSectionOut])
def upsert_cockpit_sections(
    task_id: int,
    meeting_id: int,
    sections: list[schemas.CockpitSectionCreate],
    db: Session = Depends(get_db),
):
    meeting = db.query(models.Meeting).filter(
        models.Meeting.id == meeting_id, models.Meeting.task_id == task_id
    ).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    db.query(models.CockpitSection).filter(
        models.CockpitSection.meeting_id == meeting_id
    ).delete()
    for s in sections:
        db.add(models.CockpitSection(
            meeting_id=meeting_id,
            section_key=s.section_key,
            content=s.content,
            position=s.position,
        ))
    db.commit()
    db.refresh(meeting)
    return meeting.cockpit_sections


@router.put(
    "/{task_id}/meetings/{meeting_id}/cockpit/{section_key}",
    response_model=schemas.CockpitSectionOut,
)
def upsert_cockpit_section(
    task_id: int,
    meeting_id: int,
    section_key: str,
    section: schemas.CockpitSectionUpdate,
    db: Session = Depends(get_db),
):
    meeting = db.query(models.Meeting).filter(
        models.Meeting.id == meeting_id, models.Meeting.task_id == task_id
    ).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    db_section = db.query(models.CockpitSection).filter(
        models.CockpitSection.meeting_id == meeting_id,
        models.CockpitSection.section_key == section_key,
    ).first()
    if db_section:
        for field, value in section.model_dump(exclude_unset=True).items():
            setattr(db_section, field, value)
    else:
        db_section = models.CockpitSection(
            meeting_id=meeting_id,
            section_key=section_key,
            content=section.content or "",
            position=section.position or 0,
        )
        db.add(db_section)
    db.commit()
    db.refresh(db_section)
    return db_section
