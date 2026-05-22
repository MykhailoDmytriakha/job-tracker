import os
from typing import Iterable

from fastapi import HTTPException
from sqlalchemy.orm import Query, Session

from . import models

ADMIN_USER_ID_ENV = "JOB_TRACKER_ADMIN_USER_ID"


def _configured_admin_user_id() -> int | None:
    raw = os.environ.get(ADMIN_USER_ID_ENV, "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        raise HTTPException(status_code=500, detail=f"{ADMIN_USER_ID_ENV} must be an integer")


def require_admin(user: models.User | None) -> None:
    admin_user_id = _configured_admin_user_id()
    auth_configured = bool(os.environ.get("GOOGLE_CLIENT_ID", "").strip())
    if admin_user_id is None and not auth_configured:
        return
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if admin_user_id is None or user.id != admin_user_id:
        raise HTTPException(status_code=403, detail="Admin access required")


def project_query(db: Session, user: models.User | None) -> Query:
    query = db.query(models.Project)
    if user is not None:
        query = query.filter(models.Project.user_id == user.id)
    return query


def require_project(
    db: Session,
    project_id: int,
    user: models.User | None,
) -> models.Project:
    project = project_query(db, user).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def scope_tasks(query: Query, user: models.User | None) -> Query:
    if user is None:
        return query
    return query.join(
        models.Project,
        models.Task.project_id == models.Project.id,
    ).filter(models.Project.user_id == user.id)


def require_task(
    db: Session,
    task_id: int,
    user: models.User | None,
    options: Iterable | None = None,
) -> models.Task:
    query = db.query(models.Task)
    query = scope_tasks(query, user)
    if options:
        query = query.options(*options)
    task = query.filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def require_document(
    db: Session,
    doc_id: int,
    user: models.User | None,
    options: Iterable | None = None,
) -> models.Document:
    query = db.query(models.Document)
    if options:
        query = query.options(*options)
    if user is not None:
        query = query.join(
            models.Project,
            models.Document.project_id == models.Project.id,
        ).filter(models.Project.user_id == user.id)
    doc = query.filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


def require_contact(
    db: Session,
    contact_id: int,
    user: models.User | None,
    options: Iterable | None = None,
) -> models.Contact:
    query = db.query(models.Contact)
    if options:
        query = query.options(*options)
    if user is not None:
        query = query.join(
            models.Project,
            models.Contact.project_id == models.Project.id,
        ).filter(models.Project.user_id == user.id)
    contact = query.filter(models.Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


def require_company(
    db: Session,
    company_id: int,
    user: models.User | None,
    options: Iterable | None = None,
) -> models.Company:
    query = db.query(models.Company)
    if options:
        query = query.options(*options)
    if user is not None:
        query = query.join(
            models.Project,
            models.Company.project_id == models.Project.id,
        ).filter(models.Project.user_id == user.id)
    company = query.filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def require_category(
    db: Session,
    cat_id: int,
    user: models.User | None,
) -> models.Category:
    query = db.query(models.Category)
    if user is not None:
        query = query.join(
            models.Project,
            models.Category.project_id == models.Project.id,
        ).filter(models.Project.user_id == user.id)
    category = query.filter(models.Category.id == cat_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category
