from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/categories", tags=["categories"])


def _with_count(db: Session, cat: models.Category) -> dict:
    count = db.query(func.count(models.Task.id)).filter(
        models.Task.category == cat.name,
        models.Task.project_id == cat.project_id,
    ).scalar()
    return {
        "id": cat.id,
        "project_id": cat.project_id,
        "name": cat.name,
        "color": cat.color,
        "position": cat.position,
        "task_count": count or 0,
    }


@router.get("/")
def list_categories(project_id: int = Query(...), db: Session = Depends(get_db)):
    cats = (
        db.query(models.Category)
        .filter(models.Category.project_id == project_id)
        .order_by(models.Category.position, models.Category.name)
        .all()
    )
    return [_with_count(db, c) for c in cats]


@router.post("/", status_code=201)
def create_category(
    cat: schemas.CategoryCreate,
    project_id: int = Query(...),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(models.Category)
        .filter(models.Category.project_id == project_id, models.Category.name == cat.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Category '{cat.name}' already exists")

    max_pos = (
        db.query(models.Category.position)
        .filter(models.Category.project_id == project_id)
        .order_by(models.Category.position.desc())
        .first()
    )
    pos = (max_pos[0] + 1) if max_pos else 0

    db_cat = models.Category(
        project_id=project_id, name=cat.name, color=cat.color, position=pos,
    )
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return _with_count(db, db_cat)


@router.put("/{cat_id}")
def rename_category(
    cat_id: int,
    update: schemas.CategoryCreate,
    db: Session = Depends(get_db),
):
    cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    old_name = cat.name
    new_name = update.name.strip()
    if not new_name:
        raise HTTPException(status_code=422, detail="Name cannot be empty")

    # Rename category on all tasks that use it
    db.query(models.Task).filter(
        models.Task.project_id == cat.project_id,
        models.Task.category == old_name,
    ).update({"category": new_name})

    cat.name = new_name
    if update.color is not None:
        cat.color = update.color
    db.commit()
    db.refresh(cat)
    return _with_count(db, cat)


@router.delete("/{cat_id}")
def delete_category(cat_id: int, force: bool = Query(False), db: Session = Depends(get_db)):
    cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    task_count = db.query(func.count(models.Task.id)).filter(
        models.Task.category == cat.name,
        models.Task.project_id == cat.project_id,
    ).scalar() or 0

    if task_count > 0 and not force:
        raise HTTPException(
            status_code=409,
            detail=f"Category '{cat.name}' is used by {task_count} task(s). Confirm to delete.",
        )

    # Clear category from tasks
    if task_count > 0:
        db.query(models.Task).filter(
            models.Task.project_id == cat.project_id,
            models.Task.category == cat.name,
        ).update({"category": None})

    db.delete(cat)
    db.commit()
    return {"ok": True}
