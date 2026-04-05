"""Board and Dashboard endpoints."""

from contextlib import contextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.api import stages, tasks, board, dashboard, projects, documents, categories, contacts, companies, search
from backend.database import Base, get_db
from backend.models import Project, Stage, Task


def test_board_returns_columns(client):
    r = client.get("/api/board/")
    assert r.status_code == 200
    data = r.json()
    assert len(data["columns"]) == 9
    assert data["columns"][0]["stage"]["name"] == "INBOX"


def test_board_tasks_in_correct_column(client):
    t = client.post("/api/tasks/", json={"title": "Inbox task", "stage_id": 1}).json()
    data = client.get("/api/board/").json()
    inbox_tasks = data["columns"][0]["tasks"]
    assert any(task["id"] == t["id"] for task in inbox_tasks)


def test_board_blocked_flag(client):
    a = client.post("/api/tasks/", json={"title": "Blocker", "stage_id": 1}).json()
    b = client.post("/api/tasks/", json={"title": "Blocked", "stage_id": 2}).json()
    client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})

    data = client.get("/api/board/").json()
    triaged_tasks = data["columns"][1]["tasks"]
    blocked_task = next(t for t in triaged_tasks if t["id"] == b["id"])
    assert blocked_task["is_blocked"] is True


@contextmanager
def _legacy_client_without_dependency_table():
    app = FastAPI(title="Job Tracker Legacy Schema Test")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    app.include_router(projects.router)
    app.include_router(stages.router)
    app.include_router(tasks.router)
    app.include_router(board.router)
    app.include_router(dashboard.router)
    app.include_router(documents.router)
    app.include_router(categories.router)
    app.include_router(contacts.router)
    app.include_router(companies.router)
    app.include_router(search.router)

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
    s = TestSession()
    for i, name in enumerate(["INBOX", "TRIAGED", "TO APPLY", "SUBMITTED", "HUMAN LANE",
                               "WAITING", "RESPONSE", "OFFER", "CLOSED"]):
        s.add(Stage(name=name, position=i, is_default=True))
    s.add(Project(name="Legacy Project", short_key="LEG"))
    s.commit()
    s.add(Task(project_id=1, sequence_num=1, title="Legacy inbox task", stage_id=1))
    s.commit()
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE task_dependencies"))
    s.close()

    def _override():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
    engine.dispose()


def test_legacy_schema_missing_dependency_table_does_not_break_reads():
    with _legacy_client_without_dependency_table() as client:
        board_response = client.get("/api/board/")
        assert board_response.status_code == 200
        board_data = board_response.json()
        assert any(task["title"] == "Legacy inbox task" for task in board_data["columns"][0]["tasks"])

        dashboard_response = client.get("/api/dashboard/")
        assert dashboard_response.status_code == 200
        assert "stats" in dashboard_response.json()


def test_dashboard_stats(client):
    r = client.get("/api/dashboard/")
    assert r.status_code == 200
    data = r.json()
    assert "stats" in data
    assert "today" in data
    assert "upcoming" in data
    assert "recurring" in data


def test_dashboard_today_overdue(client):
    client.post("/api/tasks/", json={
        "title": "Overdue task",
        "due_date": "2020-01-01T00:00:00Z",
    })
    data = client.get("/api/dashboard/").json()
    assert data["stats"]["overdue"] >= 1
    assert any(t["title"] == "Overdue task" for t in data["today"])


def test_dashboard_recurring_tasks(client):
    client.post("/api/tasks/", json={
        "title": "Daily check",
        "is_recurring": True,
        "cadence": "daily",
    })
    data = client.get("/api/dashboard/").json()
    assert data["stats"]["recurring"] >= 1
    assert any(t["title"] == "Daily check" for t in data["recurring"])


def test_dashboard_recurring_has_last_activity(client):
    t = client.post("/api/tasks/", json={
        "title": "Track me",
        "is_recurring": True,
    }).json()
    data = client.get("/api/dashboard/").json()
    rec = next(r for r in data["recurring"] if r["title"] == "Track me")
    # Has last_activity_at from "created" activity
    assert rec["last_activity_at"] is not None


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_stages_list(client):
    r = client.get("/api/stages/")
    assert r.status_code == 200
    assert len(r.json()) == 9
