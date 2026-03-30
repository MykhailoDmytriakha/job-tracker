from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/stages", tags=["stages"])


@router.get("/", response_model=list[schemas.StageOut])
def list_stages(db: Session = Depends(get_db)):
    return (
        db.query(models.Stage)
        .filter(models.Stage.parent_id.is_(None))
        .order_by(models.Stage.position)
        .all()
    )


@router.post("/", response_model=schemas.StageOut, status_code=201)
def create_stage(stage: schemas.StageCreate, db: Session = Depends(get_db)):
    db_stage = models.Stage(**stage.model_dump())
    db.add(db_stage)
    db.commit()
    db.refresh(db_stage)
    return db_stage


@router.put("/{stage_id}", response_model=schemas.StageOut)
def update_stage(stage_id: int, stage: schemas.StageUpdate, db: Session = Depends(get_db)):
    db_stage = db.query(models.Stage).filter(models.Stage.id == stage_id).first()
    if not db_stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    for key, value in stage.model_dump(exclude_unset=True).items():
        setattr(db_stage, key, value)
    db.commit()
    db.refresh(db_stage)
    return db_stage


@router.delete("/{stage_id}")
def delete_stage(stage_id: int, db: Session = Depends(get_db)):
    db_stage = db.query(models.Stage).filter(models.Stage.id == stage_id).first()
    if not db_stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    if db_stage.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete default stage")
    # Move tasks to parent stage or unset
    for task in db_stage.tasks:
        task.stage_id = db_stage.parent_id
    db.delete(db_stage)
    db.commit()
    return {"ok": True}


@router.post("/reorder")
def reorder_stages(order: list[dict], db: Session = Depends(get_db)):
    for item in order:
        stage = db.query(models.Stage).filter(models.Stage.id == item["id"]).first()
        if stage:
            stage.position = item["position"]
    db.commit()
    return {"ok": True}
