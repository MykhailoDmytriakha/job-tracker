"""Business rule enforcement: dependencies, waiting, subtask/checklist close."""


# --- Waiting enforcement ---

def test_waiting_requires_follow_up_date(client):
    t = client.post("/api/tasks/", json={"title": "W"}).json()
    r = client.put(f"/api/tasks/{t['id']}", json={"status": "waiting"})
    assert r.status_code == 422
    assert "follow_up_date" in r.json()["detail"]


def test_waiting_with_date_succeeds(client):
    t = client.post("/api/tasks/", json={"title": "W"}).json()
    r = client.put(f"/api/tasks/{t['id']}", json={
        "status": "waiting",
        "follow_up_date": "2026-05-01T00:00:00Z",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "waiting"


def test_create_waiting_without_date_fails(client):
    r = client.post("/api/tasks/", json={"title": "W", "status": "waiting"})
    assert r.status_code == 422


def test_create_waiting_with_date_succeeds(client):
    r = client.post("/api/tasks/", json={
        "title": "W",
        "status": "waiting",
        "follow_up_date": "2026-05-01T00:00:00Z",
    })
    assert r.status_code == 201


# --- Dependency enforcement ---

def test_cannot_close_with_unresolved_dependency(client):
    a = client.post("/api/tasks/", json={"title": "Blocker"}).json()
    b = client.post("/api/tasks/", json={"title": "Blocked"}).json()
    client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})
    r = client.put(f"/api/tasks/{b['id']}", json={"status": "done"})
    assert r.status_code == 409
    assert "first" in r.json()["detail"].lower()


def test_can_close_after_dependency_resolved(client):
    a = client.post("/api/tasks/", json={"title": "Blocker"}).json()
    b = client.post("/api/tasks/", json={"title": "Blocked"}).json()
    client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})
    client.put(f"/api/tasks/{a['id']}", json={"status": "done"})
    r = client.put(f"/api/tasks/{b['id']}", json={"status": "done"})
    assert r.status_code == 200


def test_self_dependency_rejected(client):
    t = client.post("/api/tasks/", json={"title": "Self"}).json()
    r = client.post(f"/api/tasks/{t['id']}/dependencies", json={"depends_on_id": t["id"]})
    assert r.status_code == 400


def test_circular_dependency_rejected(client):
    a = client.post("/api/tasks/", json={"title": "A"}).json()
    b = client.post("/api/tasks/", json={"title": "B"}).json()
    client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})
    r = client.post(f"/api/tasks/{a['id']}/dependencies", json={"depends_on_id": b["id"]})
    assert r.status_code == 400
    assert "cycle" in r.json()["detail"].lower()


def test_circular_dependency_three_nodes(client):
    a = client.post("/api/tasks/", json={"title": "A"}).json()
    b = client.post("/api/tasks/", json={"title": "B"}).json()
    c = client.post("/api/tasks/", json={"title": "C"}).json()
    client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})
    client.post(f"/api/tasks/{c['id']}/dependencies", json={"depends_on_id": b["id"]})
    r = client.post(f"/api/tasks/{a['id']}/dependencies", json={"depends_on_id": c["id"]})
    assert r.status_code == 400


def test_duplicate_dependency_rejected(client):
    a = client.post("/api/tasks/", json={"title": "A"}).json()
    b = client.post("/api/tasks/", json={"title": "B"}).json()
    client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})
    r = client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})
    assert r.status_code == 400


def test_remove_dependency(client):
    a = client.post("/api/tasks/", json={"title": "A"}).json()
    b = client.post("/api/tasks/", json={"title": "B"}).json()
    client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})
    r = client.delete(f"/api/tasks/{b['id']}/dependencies/{a['id']}")
    assert r.status_code == 200
    # Now can close
    r = client.put(f"/api/tasks/{b['id']}", json={"status": "done"})
    assert r.status_code == 200


def test_is_blocked_flag(client):
    a = client.post("/api/tasks/", json={"title": "Blocker"}).json()
    b = client.post("/api/tasks/", json={"title": "Blocked"}).json()
    client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})
    full = client.get(f"/api/tasks/{b['id']}").json()
    assert full["is_blocked"] is True


# --- Subtask close enforcement ---

def test_cannot_close_with_open_subtasks(client):
    p = client.post("/api/tasks/", json={"title": "Parent"}).json()
    client.post("/api/tasks/", json={"title": "Child", "parent_id": p["id"]})
    r = client.put(f"/api/tasks/{p['id']}", json={"status": "done"})
    assert r.status_code == 409
    assert "subtask" in r.json()["detail"].lower()


def test_can_close_after_subtasks_done(client):
    p = client.post("/api/tasks/", json={"title": "Parent"}).json()
    c = client.post("/api/tasks/", json={"title": "Child", "parent_id": p["id"]}).json()
    client.put(f"/api/tasks/{c['id']}", json={"status": "done"})
    r = client.put(f"/api/tasks/{p['id']}", json={"status": "done"})
    assert r.status_code == 200


# --- Checklist close enforcement ---

def test_cannot_close_with_unchecked_checklist(client):
    t = client.post("/api/tasks/", json={"title": "CL"}).json()
    client.post(f"/api/tasks/{t['id']}/checklist", json={"text": "Step 1"})
    r = client.put(f"/api/tasks/{t['id']}", json={"status": "done"})
    assert r.status_code == 409
    assert "checklist" in r.json()["detail"].lower()


def test_can_close_after_checklist_checked(client):
    t = client.post("/api/tasks/", json={"title": "CL"}).json()
    item = client.post(f"/api/tasks/{t['id']}/checklist", json={"text": "Step 1"}).json()
    client.put(f"/api/tasks/{t['id']}/checklist/{item['id']}", json={"is_done": True})
    r = client.put(f"/api/tasks/{t['id']}", json={"status": "done"})
    assert r.status_code == 200


# --- Combined enforcement ---

def test_all_three_blockers(client):
    """Task with dependency + open subtask + unchecked checklist."""
    blocker = client.post("/api/tasks/", json={"title": "Dep"}).json()
    t = client.post("/api/tasks/", json={"title": "Main"}).json()
    client.post("/api/tasks/", json={"title": "Sub", "parent_id": t["id"]})
    client.post(f"/api/tasks/{t['id']}/checklist", json={"text": "CL item"})
    client.post(f"/api/tasks/{t['id']}/dependencies", json={"depends_on_id": blocker["id"]})

    r = client.put(f"/api/tasks/{t['id']}", json={"status": "done"})
    assert r.status_code == 409
    assert "first" in r.json()["detail"].lower()
