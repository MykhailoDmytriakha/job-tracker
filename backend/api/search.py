from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, subqueryload, joinedload
from sqlalchemy import or_

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/search", tags=["search"])


def _matches(text: str | None, q: str) -> bool:
    return bool(text) and q.lower() in text.lower()


def _matched_fields(obj: object, fields: list[str], q: str) -> list[str]:
    return [f for f in fields if _matches(getattr(obj, f, None), q)]


@router.get("/", response_model=schemas.SearchResponse)
def global_search(
    q: str = Query(..., min_length=1),
    project_id: int = Query(...),
    db: Session = Depends(get_db),
):
    if not db.query(models.Project).filter(models.Project.id == project_id).first():
        raise HTTPException(status_code=404, detail="Project not found")

    groups: list[schemas.SearchResultGroup] = []

    q_clean = q.strip()

    # --- Tasks ---
    task_conditions = [
        models.Task.title.ilike(f"%{q_clean}%"),
        models.Task.description.ilike(f"%{q_clean}%"),
        models.Task.compensation.ilike(f"%{q_clean}%"),
        models.Task.close_reason.ilike(f"%{q_clean}%"),
        models.Task.posting_url.ilike(f"%{q_clean}%"),
    ]
    if q_clean.isdigit():
        task_conditions.append(models.Task.id == int(q_clean))
        task_conditions.append(models.Task.sequence_num == int(q_clean))
    else:
        import re
        m = re.match(r'^[A-Za-z0-9]+-(\d+)$', q_clean)
        if m:
            task_conditions.append(models.Task.sequence_num == int(m.group(1)))

    tasks = db.query(models.Task).options(
        joinedload(models.Task.project),
    ).filter(
        models.Task.project_id == project_id,
        or_(*task_conditions),
    ).all()
    task_hits = [
        schemas.SearchHit(
            entity_type="task", id=t.id, title=t.title, subtitle=t.status,
            matched_fields=_matched_fields(t, ["title", "description", "compensation", "close_reason", "posting_url"], q),
            display_id=t.display_id,
        )
        for t in tasks
    ]
    if task_hits:
        groups.append(schemas.SearchResultGroup(entity_type="task", count=len(task_hits), hits=task_hits))

    # --- Contacts ---
    contacts = db.query(models.Contact).options(
        subqueryload(models.Contact.tasks),
    ).filter(
        models.Contact.project_id == project_id,
        (models.Contact.name.ilike(f"%{q}%") | models.Contact.email.ilike(f"%{q}%")
         | models.Contact.role.ilike(f"%{q}%") | models.Contact.company.ilike(f"%{q}%")
         | models.Contact.notes.ilike(f"%{q}%")),
    ).all()
    contact_hits = [
        schemas.SearchHit(
            entity_type="contact", id=c.id, title=c.name,
            subtitle=f"{c.role or ''} @ {c.company or ''}".strip(" @") or None,
            matched_fields=_matched_fields(c, ["name", "email", "role", "company", "notes"], q),
            linked_task_ids=[t.id for t in c.tasks],
        )
        for c in contacts
    ]
    if contact_hits:
        groups.append(schemas.SearchResultGroup(entity_type="contact", count=len(contact_hits), hits=contact_hits))

    # --- Companies ---
    companies = db.query(models.Company).options(
        subqueryload(models.Company.tasks),
    ).filter(
        models.Company.project_id == project_id,
        (models.Company.name.ilike(f"%{q}%") | models.Company.notes.ilike(f"%{q}%")
         | models.Company.domain.ilike(f"%{q}%") | models.Company.strategic_lane.ilike(f"%{q}%")),
    ).all()
    company_hits = [
        schemas.SearchHit(
            entity_type="company", id=co.id, title=co.name,
            subtitle=co.location or co.domain,
            matched_fields=_matched_fields(co, ["name", "notes", "domain", "strategic_lane"], q),
            linked_task_ids=[t.id for t in co.tasks],
        )
        for co in companies
    ]
    if company_hits:
        groups.append(schemas.SearchResultGroup(entity_type="company", count=len(company_hits), hits=company_hits))

    # --- Documents ---
    documents = db.query(models.Document).options(
        subqueryload(models.Document.tasks),
    ).filter(
        models.Document.project_id == project_id,
        (models.Document.title.ilike(f"%{q}%") | models.Document.content.ilike(f"%{q}%")),
    ).all()
    doc_hits = [
        schemas.SearchHit(
            entity_type="document", id=d.id, title=d.title, subtitle=d.doc_type,
            matched_fields=_matched_fields(d, ["title", "content"], q),
            linked_task_ids=[t.id for t in d.tasks],
        )
        for d in documents
    ]
    if doc_hits:
        groups.append(schemas.SearchResultGroup(entity_type="document", count=len(doc_hits), hits=doc_hits))

    # --- Activities ---
    activities = (
        db.query(models.Activity)
        .options(joinedload(models.Activity.task).joinedload(models.Task.project))
        .join(models.Task, models.Activity.task_id == models.Task.id)
        .filter(models.Task.project_id == project_id, models.Activity.detail.ilike(f"%{q}%"))
        .all()
    )
    activity_hits = [
        schemas.SearchHit(
            entity_type="activity", id=a.id,
            title=a.detail[:120] + ("…" if len(a.detail) > 120 else ""),
            subtitle=a.task.title if a.task else None,
            matched_fields=["detail"], task_id=a.task_id,
            display_id=a.task.display_id if a.task else None,
        )
        for a in activities
    ]
    if activity_hits:
        groups.append(schemas.SearchResultGroup(entity_type="activity", count=len(activity_hits), hits=activity_hits))

    # --- Interactions ---
    interactions = (
        db.query(models.Interaction)
        .options(joinedload(models.Interaction.contact))
        .join(models.Contact, models.Interaction.contact_id == models.Contact.id)
        .filter(models.Contact.project_id == project_id, models.Interaction.summary.ilike(f"%{q}%"))
        .all()
    )
    interaction_hits = [
        schemas.SearchHit(
            entity_type="interaction", id=i.id,
            title=i.summary[:120] + ("…" if len(i.summary) > 120 else ""),
            subtitle=i.contact.name if i.contact else None,
            matched_fields=["summary"], contact_id=i.contact_id,
        )
        for i in interactions
    ]
    if interaction_hits:
        groups.append(schemas.SearchResultGroup(entity_type="interaction", count=len(interaction_hits), hits=interaction_hits))

    total = sum(g.count for g in groups)
    return schemas.SearchResponse(query=q, total=total, groups=groups)
