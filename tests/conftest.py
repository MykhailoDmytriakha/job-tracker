"""Shared fixtures: in-memory SQLite DB + test client."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.models import Stage, Project
from backend.api import stages, tasks, board, dashboard, projects, documents, categories


def _make_test_app():
    test_app = FastAPI(title="Job Tracker Test")
    test_app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    test_app.include_router(projects.router)
    test_app.include_router(stages.router)
    test_app.include_router(tasks.router)
    test_app.include_router(board.router)
    test_app.include_router(dashboard.router)
    test_app.include_router(documents.router)
    test_app.include_router(categories.router)

    @test_app.get("/api/health")
    def health():
        return {"status": "ok"}

    return test_app


test_app = _make_test_app()


@pytest.fixture(scope="function")
def client():
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

    # Seed stages + default project
    s = TestSession()
    for i, name in enumerate(["INBOX", "TRIAGED", "TO APPLY", "SUBMITTED", "HUMAN LANE",
                               "WAITING", "RESPONSE", "OFFER", "CLOSED"]):
        s.add(Stage(name=name, position=i, is_default=True))
    s.add(Project(name="Test Project", short_key="TST"))
    s.commit()
    s.close()

    def _override():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    test_app.dependency_overrides[get_db] = _override
    with TestClient(test_app) as c:
        # Monkey-patch: add helper that auto-adds project_id=1
        _orig_post = c.post
        def _patched_post(url, **kwargs):
            if url == "/api/tasks/" and "params" not in kwargs:
                kwargs["params"] = {"project_id": 1}
            elif url == "/api/tasks/" and "project_id" not in (kwargs.get("params") or {}):
                kwargs.setdefault("params", {})["project_id"] = 1
            return _orig_post(url, **kwargs)
        c.post = _patched_post
        yield c
    test_app.dependency_overrides.clear()
    engine.dispose()
