from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, subqueryload
from datetime import datetime, timezone
from typing import Optional

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


@router.get("/", response_model=list[schemas.ContactBrief])
def list_contacts(
    project_id: int = Query(...),
    q: Optional[str] = None,
    contact_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Contact).filter(models.Contact.project_id == project_id)
    if q:
        query = query.filter(
            models.Contact.name.ilike(f"%{q}%")
            | models.Contact.company.ilike(f"%{q}%")
            | models.Contact.email.ilike(f"%{q}%")
            | models.Contact.role.ilike(f"%{q}%")
        )
    if contact_type:
        query = query.filter(models.Contact.contact_type == contact_type)
    return query.order_by(models.Contact.updated_at.desc()).all()


@router.post("/", response_model=schemas.ContactOut, status_code=201)
def create_contact(
    contact: schemas.ContactCreate,
    project_id: int = Query(...),
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db_contact = models.Contact(project_id=project_id, **contact.model_dump())
    db.add(db_contact)
    db.commit()
    db.refresh(db_contact)
    return _contact_out(db_contact)


@router.get("/{contact_id}", response_model=schemas.ContactOut)
def get_contact(contact_id: int, db: Session = Depends(get_db)):
    contact = db.query(models.Contact).options(subqueryload(models.Contact.tasks), subqueryload(models.Contact.interactions)).filter(models.Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return _contact_out(contact)


@router.put("/{contact_id}", response_model=schemas.ContactOut)
def update_contact(contact_id: int, update: schemas.ContactUpdate, db: Session = Depends(get_db)):
    contact = db.query(models.Contact).options(subqueryload(models.Contact.tasks), subqueryload(models.Contact.interactions)).filter(models.Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    for key, value in update.model_dump(exclude_unset=True).items():
        setattr(contact, key, value)
    contact.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(contact)
    return _contact_out(contact)


@router.delete("/{contact_id}")
def delete_contact(contact_id: int, db: Session = Depends(get_db)):
    contact = db.query(models.Contact).options(subqueryload(models.Contact.tasks), subqueryload(models.Contact.interactions)).filter(models.Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    contact.tasks.clear()
    db.delete(contact)
    db.commit()
    return {"ok": True}


# --- Interactions ---


@router.post("/{contact_id}/interactions", response_model=schemas.InteractionOut, status_code=201)
def add_interaction(
    contact_id: int,
    interaction: schemas.InteractionCreate,
    db: Session = Depends(get_db),
):
    contact = db.query(models.Contact).options(subqueryload(models.Contact.tasks), subqueryload(models.Contact.interactions)).filter(models.Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db_item = models.Interaction(
        contact_id=contact_id,
        date=interaction.date or datetime.now(timezone.utc),
        channel=interaction.channel,
        direction=interaction.direction,
        summary=interaction.summary,
    )
    db.add(db_item)
    contact.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/{contact_id}/interactions/{interaction_id}")
def delete_interaction(contact_id: int, interaction_id: int, db: Session = Depends(get_db)):
    item = (
        db.query(models.Interaction)
        .filter(models.Interaction.id == interaction_id, models.Interaction.contact_id == contact_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Interaction not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


def _contact_out(contact: models.Contact) -> schemas.ContactOut:
    return schemas.ContactOut(
        id=contact.id,
        project_id=contact.project_id,
        name=contact.name,
        email=contact.email,
        phone=contact.phone,
        linkedin=contact.linkedin,
        company=contact.company,
        role=contact.role,
        department=contact.department,
        location=contact.location,
        contact_type=contact.contact_type,
        notes=contact.notes,
        created_at=contact.created_at,
        updated_at=contact.updated_at,
        tasks=[
            schemas.TaskBrief(
                id=t.id, display_id=t.display_id, project_id=t.project_id,
                title=t.title, status=t.status, priority=t.priority,
                category=t.category, stage_id=t.stage_id, parent_id=t.parent_id,
            )
            for t in contact.tasks
        ],
        interactions=[
            schemas.InteractionOut(
                id=i.id, contact_id=i.contact_id, date=i.date,
                channel=i.channel, direction=i.direction, summary=i.summary,
            )
            for i in contact.interactions
        ],
    )
