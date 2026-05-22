from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, subqueryload
from datetime import datetime, timezone
from typing import Optional

from ..database import get_db
from .. import models, schemas
from ..authz import require_document, require_project
from .auth import get_current_user

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("/", response_model=list[schemas.DocumentBrief])
def list_documents(
    project_id: int = Query(...),
    q: Optional[str] = None,
    doc_type: Optional[str] = None,
    db: Session = Depends(get_db),
    user: models.User | None = Depends(get_current_user),
):
    require_project(db, project_id, user)
    query = db.query(models.Document).filter(models.Document.project_id == project_id)
    if q:
        query = query.filter(
            models.Document.title.ilike(f"%{q}%")
            | models.Document.content.ilike(f"%{q}%")
        )
    if doc_type:
        query = query.filter(models.Document.doc_type == doc_type)
    docs = query.order_by(models.Document.updated_at.desc()).all()
    return docs


@router.post("/", response_model=schemas.DocumentOut, status_code=201)
def create_document(
    doc: schemas.DocumentCreate,
    project_id: int = Query(...),
    db: Session = Depends(get_db),
    user: models.User | None = Depends(get_current_user),
):
    require_project(db, project_id, user)
    db_doc = models.Document(
        project_id=project_id,
        title=doc.title,
        content=doc.content,
        doc_type=doc.doc_type,
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return _doc_out(db_doc)


@router.get("/{doc_id}", response_model=schemas.DocumentOut)
def get_document(
    doc_id: int,
    db: Session = Depends(get_db),
    user: models.User | None = Depends(get_current_user),
):
    doc = require_document(db, doc_id, user, options=[subqueryload(models.Document.tasks)])
    return _doc_out(doc)


@router.put("/{doc_id}", response_model=schemas.DocumentOut)
def update_document(
    doc_id: int,
    update: schemas.DocumentUpdate,
    db: Session = Depends(get_db),
    user: models.User | None = Depends(get_current_user),
):
    doc = require_document(db, doc_id, user, options=[subqueryload(models.Document.tasks)])
    changes = update.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(doc, key, value)
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    return _doc_out(doc)


@router.delete("/{doc_id}")
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    user: models.User | None = Depends(get_current_user),
):
    doc = require_document(db, doc_id, user, options=[subqueryload(models.Document.tasks)])
    doc.tasks.clear()
    db.delete(doc)
    db.commit()
    return {"ok": True}


def _doc_out(doc: models.Document) -> schemas.DocumentOut:
    tasks = [t for t in doc.tasks if t.project_id == doc.project_id]
    return schemas.DocumentOut(
        id=doc.id,
        project_id=doc.project_id,
        title=doc.title,
        content=doc.content,
        doc_type=doc.doc_type,
        source_path=doc.source_path,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        tasks=[
            schemas.TaskBrief(
                id=t.id, display_id=t.display_id, project_id=t.project_id,
                title=t.title, status=t.status, priority=t.priority,
                category=t.category, stage_id=t.stage_id, parent_id=t.parent_id,
            )
            for t in tasks
        ],
    )
