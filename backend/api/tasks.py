from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone
from typing import Optional

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def log_activity(db: Session, task_id: int, action: str, detail: str = ""):
    activity = models.Activity(task_id=task_id, action=action, detail=detail)
    db.add(activity)


def _get_blocked_ids(db: Session) -> set[int]:
    """Return set of task IDs that have at least one unresolved dependency."""
    rows = db.execute(
        text("""
            SELECT DISTINCT td.task_id
            FROM task_dependencies td
            JOIN tasks t ON t.id = td.depends_on_id
            WHERE t.status NOT IN ('done', 'closed')
        """)
    ).fetchall()
    return {r[0] for r in rows}


def _is_task_blocked(db: Session, task_id: int) -> bool:
    row = db.execute(
        text("""
            SELECT 1
            FROM task_dependencies td
            JOIN tasks t ON t.id = td.depends_on_id
            WHERE td.task_id = :tid AND t.status NOT IN ('done', 'closed')
            LIMIT 1
        """),
        {"tid": task_id},
    ).fetchone()
    return row is not None


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
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Task)
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
        query = query.filter(models.Task.title.ilike(f"%{search}%"))
    if overdue:
        now = datetime.now(timezone.utc)
        query = query.filter(
            models.Task.status.notin_(["done", "closed"]),
            (models.Task.due_date < now) | (models.Task.follow_up_date < now),
        )

    tasks = query.order_by(models.Task.created_at.desc()).all()
    blocked_ids = _get_blocked_ids(db)
    return [_brief(t, t.id in blocked_ids) for t in tasks]


@router.get("/{task_id}", response_model=schemas.TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    # Future: validate task.project.user_id == current_user
    is_blocked = _is_task_blocked(db, task_id)
    return _full(task, is_blocked)


# --- Create / Update / Delete ---


@router.post("/", response_model=schemas.TaskOut, status_code=201)
def create_task(
    task: schemas.TaskCreate,
    project_id: int = Query(..., description="Project to create the task in"),
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
    if db_task.parent_id:
        log_activity(
            db, db_task.parent_id, "subtask_added", f"Subtask added: {db_task.title}"
        )
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

        # Open subtasks
        open_subs = [s for s in db_task.subtasks if s.status not in ("done", "closed")]
        if open_subs:
            names = ", ".join(f"#{s.id} {s.title}" for s in open_subs[:3])
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
        log_activity(db, task_id, "description_updated", "Description updated")

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
    for sub in list(db_task.subtasks):
        sub.blocked_by.clear()
        sub.blocks.clear()
        db.delete(sub)
    db.delete(db_task)
    db.commit()
    return {"ok": True}


# --- Notes ---


@router.post("/{task_id}/note")
def add_note(task_id: int, body: dict, db: Session = Depends(get_db)):
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
        subtask_count=len(t.subtasks),
        subtask_done=sum(1 for s in t.subtasks if s.status == "done"),
        checklist_total=len(t.checklist_items),
        checklist_done=sum(1 for c in t.checklist_items if c.is_done),
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
        created_at=t.created_at,
        updated_at=t.updated_at,
        subtask_count=len(t.subtasks),
        subtask_done=sum(1 for s in t.subtasks if s.status == "done"),
        checklist_total=len(t.checklist_items),
        checklist_done=sum(1 for c in t.checklist_items if c.is_done),
        subtasks=[_brief(s) for s in t.subtasks],
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
