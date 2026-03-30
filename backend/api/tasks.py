from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def log_activity(db: Session, task_id: int, action: str, detail: str = ""):
    activity = models.Activity(task_id=task_id, action=action, detail=detail)
    db.add(activity)


@router.get("/", response_model=list[schemas.TaskBrief])
def list_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    stage_id: Optional[int] = None,
    parent_id: Optional[int] = None,
    root_only: bool = Query(False),
    on_board: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Task)
    if status:
        query = query.filter(models.Task.status == status)
    if priority:
        query = query.filter(models.Task.priority == priority)
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

    tasks = query.order_by(models.Task.created_at.desc()).all()
    return [_brief(t) for t in tasks]


@router.get("/{task_id}", response_model=schemas.TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _full(task)


@router.post("/", response_model=schemas.TaskOut, status_code=201)
def create_task(task: schemas.TaskCreate, db: Session = Depends(get_db)):
    db_task = models.Task(**task.model_dump())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    log_activity(db, db_task.id, "created", f"Task created: {db_task.title}")
    if db_task.parent_id:
        log_activity(db, db_task.parent_id, "subtask_added", f"Subtask added: {db_task.title}")
    db.commit()
    db.refresh(db_task)
    return _full(db_task)


@router.put("/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: int, task: schemas.TaskUpdate, db: Session = Depends(get_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    changes = task.model_dump(exclude_unset=True)

    if "stage_id" in changes and changes["stage_id"] != db_task.stage_id:
        old = db.query(models.Stage).filter(models.Stage.id == db_task.stage_id).first() if db_task.stage_id else None
        new = db.query(models.Stage).filter(models.Stage.id == changes["stage_id"]).first() if changes["stage_id"] else None
        log_activity(db, task_id, "moved", f"{old.name if old else '—'} → {new.name if new else '—'}")

    if "status" in changes and changes["status"] != db_task.status:
        log_activity(db, task_id, "status_changed", f"{db_task.status} → {changes['status']}")

    if "description" in changes and changes["description"] != db_task.description:
        log_activity(db, task_id, "description_updated", "Description updated")

    db_task.updated_at = datetime.now(timezone.utc)
    for key, value in changes.items():
        setattr(db_task, key, value)

    db.commit()
    db.refresh(db_task)
    return _full(db_task)


@router.delete("/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(db_task)
    db.commit()
    return {"ok": True}


@router.post("/{task_id}/note")
def add_note(task_id: int, body: dict, db: Session = Depends(get_db)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    log_activity(db, task_id, "note_added", body.get("text", ""))
    task.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


# --- helpers ---

def _brief(t: models.Task) -> schemas.TaskBrief:
    return schemas.TaskBrief(
        id=t.id,
        title=t.title,
        status=t.status,
        priority=t.priority,
        stage_id=t.stage_id,
        parent_id=t.parent_id,
        follow_up_date=t.follow_up_date,
        subtask_count=len(t.subtasks),
        subtask_done=sum(1 for s in t.subtasks if s.status == "done"),
    )


def _full(t: models.Task) -> schemas.TaskOut:
    return schemas.TaskOut(
        id=t.id,
        title=t.title,
        description=t.description,
        status=t.status,
        priority=t.priority,
        stage_id=t.stage_id,
        parent_id=t.parent_id,
        follow_up_date=t.follow_up_date,
        created_at=t.created_at,
        updated_at=t.updated_at,
        subtasks=[_brief(s) for s in t.subtasks],
        activities=[
            schemas.ActivityOut(
                id=a.id, task_id=a.task_id, action=a.action,
                detail=a.detail, timestamp=a.timestamp,
            )
            for a in t.activities
        ],
    )
