"""Authenticated data isolation regression tests."""

from contextlib import contextmanager
from datetime import datetime
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.api import (
    activities,
    board,
    categories,
    companies,
    contacts,
    dashboard,
    documents,
    meetings,
    projects,
    search,
    stages,
    tasks,
)
from backend.api.auth import get_current_user
from backend.database import Base, get_db
from backend.models import Document, Meeting, Project, Stage, Task, User, task_dependencies
from backend.models import Company, Contact, task_companies, task_contacts, task_documents


def _make_app() -> FastAPI:
    app = FastAPI(title="Job Tracker Auth Scope Test")
    for router in [
        projects.router,
        stages.router,
        tasks.router,
        board.router,
        dashboard.router,
        documents.router,
        categories.router,
        contacts.router,
        companies.router,
        search.router,
        activities.router,
        meetings.router,
    ]:
        app.include_router(router)
    return app


@contextmanager
def _scoped_client(user_id: int | None = 2, override_user: bool = True):
    app = _make_app()
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _fk(dbapi_connection, _):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine)

    session = TestSession()
    session.add_all([
        User(id=1, email="owner@example.com", name="Owner"),
        User(id=2, email="friend@example.com", name="Friend"),
    ])
    for i, name in enumerate(["INBOX", "TRIAGED", "TO APPLY"], start=1):
        session.add(Stage(id=i, name=name, position=i - 1, is_default=True))
    session.add(Stage(id=4, name="CUSTOM", position=3, is_default=False))
    session.add_all([
        Project(id=1, name="Owner Project", short_key="OWN", user_id=1),
        Project(id=2, name="Friend Project", short_key="FRN", user_id=2),
    ])
    session.add_all([
        Task(id=1, project_id=1, sequence_num=1, title="Owner private task", stage_id=1),
        Task(id=2, project_id=2, sequence_num=1, title="Friend visible task", stage_id=1),
    ])
    session.add_all([
        Document(id=1, project_id=1, title="Owner private doc"),
        Document(id=2, project_id=2, title="Friend visible doc"),
    ])
    session.add_all([
        Company(id=1, project_id=1, name="Owner private company"),
        Company(id=2, project_id=2, name="Friend visible company"),
        Contact(id=1, project_id=1, name="Owner private contact", company_id=2),
        Contact(id=2, project_id=2, name="Friend visible contact"),
    ])
    session.add_all([
        Meeting(
            id=1,
            task_id=1,
            meeting_type="technical",
            scheduled_at=datetime(2030, 1, 1, 12, 0, 0),
            status="scheduled",
        ),
        Meeting(
            id=2,
            task_id=2,
            meeting_type="phone_screen",
            scheduled_at=datetime(2030, 1, 2, 12, 0, 0),
            status="scheduled",
        ),
    ])
    session.flush()
    session.execute(task_dependencies.insert().values(task_id=2, depends_on_id=1))
    session.execute(task_documents.insert().values(task_id=2, document_id=1))
    session.execute(task_documents.insert().values(task_id=1, document_id=2))
    session.execute(task_contacts.insert().values(task_id=2, contact_id=1))
    session.execute(task_companies.insert().values(task_id=2, company_id=1))
    session.execute(task_companies.insert().values(task_id=1, company_id=2))
    session.commit()
    session.close()

    def _override_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    if override_user:
        def _override_current_user():
            if user_id is None:
                return None
            return SimpleNamespace(id=user_id)

        app.dependency_overrides[get_current_user] = _override_current_user

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()
    engine.dispose()


def test_projects_list_is_scoped_to_current_user():
    with _scoped_client(user_id=2) as client:
        response = client.get("/api/projects/")
        assert response.status_code == 200
        assert [p["short_key"] for p in response.json()] == ["FRN"]

        assert client.get("/api/projects/1").status_code == 404
        assert client.get("/api/projects/2").status_code == 200


def test_project_id_and_direct_task_id_cannot_cross_owner():
    with _scoped_client(user_id=2) as client:
        assert client.get("/api/tasks/", params={"project_id": 1}).status_code == 404
        assert client.get("/api/tasks/1").status_code == 404
        assert client.put("/api/tasks/1", json={"title": "takeover"}).status_code == 404
        assert client.post(
            "/api/tasks/",
            params={"project_id": 2},
            json={"title": "Poison parent", "parent_id": 1},
        ).status_code == 404

        own = client.get("/api/tasks/", params={"project_id": 2})
        assert own.status_code == 200
        assert [task["title"] for task in own.json()] == ["Friend visible task"]


def test_meeting_document_refs_cannot_cross_owner():
    with _scoped_client(user_id=2) as client:
        response = client.post(
            "/api/tasks/2/meetings",
            json={
                "meeting_type": "technical",
                "status": "scheduled",
                "brief_doc_id": 1,
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Meeting document belongs to another project"

        response = client.post(
            "/api/tasks/2/meetings",
            json={
                "meeting_type": "technical",
                "status": "scheduled",
                "brief_doc_id": 2,
            },
        )
        assert response.status_code == 201


def test_aggregate_endpoints_do_not_include_other_users_data():
    with _scoped_client(user_id=2) as client:
        dashboard_data = client.get("/api/dashboard/").json()
        assert dashboard_data["stats"]["total_open"] == 1
        dashboard_titles = [task["title"] for task in dashboard_data["today"]]
        assert "Owner private task" not in dashboard_titles

        board_data = client.get("/api/board/").json()
        board_titles = [
            task["title"]
            for column in board_data["columns"]
            for task in column["tasks"]
        ]
        assert board_titles == ["Friend visible task"]

        meetings_data = client.get("/api/meetings").json()
        assert [meeting["task_title"] for meeting in meetings_data] == ["Friend visible task"]


def test_stale_cross_owner_dependencies_are_not_serialized_or_counted():
    with _scoped_client(user_id=2) as client:
        task = client.get("/api/tasks/2").json()
        assert task["is_blocked"] is False
        assert task["blocked_by"] == []

        deps = client.get("/api/tasks/2/dependencies").json()
        assert deps == {"blocked_by": [], "blocks": []}

        chain = client.get("/api/tasks/2/chain").json()
        assert chain == {"nodes": [], "edges": [], "total": 0}

        board_data = client.get("/api/board/").json()
        board_tasks = [
            task
            for column in board_data["columns"]
            for task in column["tasks"]
        ]
        assert board_tasks == [
            task for task in board_tasks if task["title"] == "Friend visible task"
        ]
        assert board_tasks[0]["is_blocked"] is False


def test_stale_cross_project_links_are_not_serialized():
    with _scoped_client(user_id=2) as client:
        task = client.get("/api/tasks/2").json()
        assert task["documents"] == []
        assert task["contacts"] == []
        assert task["companies"] == []

        doc = client.get("/api/documents/2").json()
        assert doc["tasks"] == []

        company = client.get("/api/companies/2").json()
        assert company["contacts"] == []
        assert company["tasks"] == []


def test_non_admin_cannot_mutate_stages(monkeypatch):
    monkeypatch.setenv("JOB_TRACKER_ADMIN_USER_ID", "1")
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)

    with _scoped_client(user_id=2) as client:
        response = client.delete("/api/stages/4")

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required"


def test_admin_can_mutate_stages(monkeypatch):
    monkeypatch.setenv("JOB_TRACKER_ADMIN_USER_ID", "2")
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)

    with _scoped_client(user_id=2) as client:
        response = client.delete("/api/stages/4")

    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_local_dev_no_admin_can_mutate(monkeypatch):
    monkeypatch.delenv("JOB_TRACKER_ADMIN_USER_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)

    with _scoped_client(user_id=None) as client:
        response = client.delete("/api/stages/4")

    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_get_current_user_fails_closed_without_dev_flag(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "")
    monkeypatch.delenv("ALLOW_UNAUTHENTICATED", raising=False)

    with _scoped_client(override_user=False) as client:
        response = client.get("/api/projects")

    assert response.status_code == 503
    assert response.json() == {"detail": "Authentication is not configured"}


def test_get_current_user_passes_through_with_dev_flag(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "")
    monkeypatch.setenv("ALLOW_UNAUTHENTICATED", "1")

    with _scoped_client(override_user=False) as client:
        response = client.get("/api/projects")

    assert response.status_code == 200
    assert {project["short_key"] for project in response.json()} == {"OWN", "FRN"}
