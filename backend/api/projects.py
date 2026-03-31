import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("/", response_model=list[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).order_by(models.Project.created_at.desc()).all()


@router.post("/", response_model=schemas.ProjectOut, status_code=201)
def create_project(project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    key = project.short_key.upper().strip()
    if not re.match(r"^[A-Z]{2,5}$", key):
        raise HTTPException(status_code=422, detail="Short key must be 2-5 uppercase letters")
    existing = db.query(models.Project).filter(models.Project.short_key == key).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Short key '{key}' already exists")
    db_project = models.Project(name=project.name, short_key=key, description=project.description)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


@router.get("/{project_id}", response_model=schemas.ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}", response_model=schemas.ProjectOut)
def update_project(project_id: int, update: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    changes = update.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    task_count = db.query(models.Task).filter(models.Task.project_id == project_id).count()
    if task_count > 0:
        raise HTTPException(status_code=409, detail=f"Cannot delete: project has {task_count} task(s)")
    db.delete(project)
    db.commit()
    return {"ok": True}
