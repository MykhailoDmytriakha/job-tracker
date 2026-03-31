"""Board and Dashboard endpoints."""


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
