from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, subqueryload
from datetime import datetime, timezone
from typing import Optional

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/companies", tags=["companies"])


@router.get("/", response_model=list[schemas.CompanyBrief])
def list_companies(
    project_id: int = Query(...),
    q: Optional[str] = None,
    domain: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Company).filter(models.Company.project_id == project_id)
    if q:
        query = query.filter(
            models.Company.name.ilike(f"%{q}%")
            | models.Company.domain.ilike(f"%{q}%")
            | models.Company.strategic_lane.ilike(f"%{q}%")
        )
    if domain:
        query = query.filter(models.Company.domain.ilike(f"%{domain}%"))
    return query.order_by(models.Company.name).all()


@router.post("/", response_model=schemas.CompanyOut, status_code=201)
def create_company(
    company: schemas.CompanyCreate,
    project_id: int = Query(...),
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db_company = models.Company(project_id=project_id, **company.model_dump())
    db.add(db_company)
    db.commit()
    db.refresh(db_company)

    # Auto-link existing contacts with matching company name
    matching = db.query(models.Contact).filter(
        models.Contact.project_id == project_id,
        models.Contact.company.ilike(f"%{company.name}%"),
        models.Contact.company_id.is_(None),
    ).all()
    for c in matching:
        c.company_id = db_company.id
    if matching:
        db.commit()

    return _company_out(db_company)


@router.get("/{company_id}", response_model=schemas.CompanyOut)
def get_company(company_id: int, db: Session = Depends(get_db)):
    company = db.query(models.Company).options(subqueryload(models.Company.tasks), subqueryload(models.Company.contacts)).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return _company_out(company)


@router.put("/{company_id}", response_model=schemas.CompanyOut)
def update_company(company_id: int, update: schemas.CompanyUpdate, db: Session = Depends(get_db)):
    company = db.query(models.Company).options(subqueryload(models.Company.tasks), subqueryload(models.Company.contacts)).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    for key, value in update.model_dump(exclude_unset=True).items():
        setattr(company, key, value)
    company.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(company)
    return _company_out(company)


@router.delete("/{company_id}")
def delete_company(company_id: int, db: Session = Depends(get_db)):
    company = db.query(models.Company).options(subqueryload(models.Company.tasks), subqueryload(models.Company.contacts)).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    # Clear contact links
    for c in company.contacts:
        c.company_id = None
    company.tasks.clear()
    db.delete(company)
    db.commit()
    return {"ok": True}


def _company_out(company: models.Company) -> schemas.CompanyOut:
    return schemas.CompanyOut(
        id=company.id,
        project_id=company.project_id,
        name=company.name,
        short_name=company.short_name,
        company_type=company.company_type,
        domain=company.domain,
        website=company.website,
        location=company.location,
        strategic_lane=company.strategic_lane,
        notes=company.notes,
        created_at=company.created_at,
        updated_at=company.updated_at,
        contacts=[
            schemas.ContactBrief(
                id=c.id, project_id=c.project_id, name=c.name,
                company=c.company, role=c.role,
                contact_type=c.contact_type, email=c.email,
                updated_at=c.updated_at,
            )
            for c in company.contacts
        ],
        tasks=[
            schemas.TaskBrief(
                id=t.id, display_id=t.display_id, project_id=t.project_id,
                title=t.title, status=t.status, priority=t.priority,
                category=t.category, stage_id=t.stage_id, parent_id=t.parent_id,
            )
            for t in company.tasks
        ],
    )
