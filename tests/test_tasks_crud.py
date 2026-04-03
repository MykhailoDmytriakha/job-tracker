"""Task CRUD: create, read, update, delete, list, filters."""


def test_create_task(client):
    r = client.post("/api/tasks/", json={"title": "Buy milk"})
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Buy milk"
    assert data["status"] == "open"
    assert data["priority"] == "medium"
    assert data["id"] > 0


def test_create_task_with_all_fields(client):
    r = client.post("/api/tasks/", json={
        "title": "Full task",
        "description": "Detailed description",
        "status": "open",
        "priority": "high",
        "category": "Financial",
        "due_date": "2026-05-01T00:00:00Z",
        "is_recurring": True,
        "cadence": "weekly",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["category"] == "Financial"
    assert data["is_recurring"] is True
    assert data["cadence"] == "weekly"
    assert data["due_date"] is not None


def test_get_task(client):
    created = client.post("/api/tasks/", json={"title": "T1"}).json()
    r = client.get(f"/api/tasks/{created['id']}")
    assert r.status_code == 200
    assert r.json()["title"] == "T1"


def test_get_task_not_found(client):
    r = client.get("/api/tasks/99999")
    assert r.status_code == 404


def test_update_task(client):
    t = client.post("/api/tasks/", json={"title": "Original"}).json()
    r = client.put(f"/api/tasks/{t['id']}", json={"title": "Updated", "priority": "high"})
    assert r.status_code == 200
    assert r.json()["title"] == "Updated"
    assert r.json()["priority"] == "high"


def test_delete_task(client):
    t = client.post("/api/tasks/", json={"title": "To delete"}).json()
    r = client.delete(f"/api/tasks/{t['id']}")
    assert r.status_code == 200
    assert client.get(f"/api/tasks/{t['id']}").status_code == 404


def test_delete_task_with_subtasks(client):
    p = client.post("/api/tasks/", json={"title": "Parent"}).json()
    client.post("/api/tasks/", json={"title": "Child", "parent_id": p["id"]})
    r = client.delete(f"/api/tasks/{p['id']}")
    assert r.status_code == 200


def test_delete_task_with_checklist(client):
    t = client.post("/api/tasks/", json={"title": "With CL"}).json()
    client.post(f"/api/tasks/{t['id']}/checklist", json={"text": "item"})
    r = client.delete(f"/api/tasks/{t['id']}")
    assert r.status_code == 200


def test_delete_task_with_dependencies_requires_force(client):
    a = client.post("/api/tasks/", json={"title": "A"}).json()
    b = client.post("/api/tasks/", json={"title": "B"}).json()
    client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})
    # Without force: 409
    r = client.delete(f"/api/tasks/{b['id']}")
    assert r.status_code == 409
    # With force: 200
    r = client.delete(f"/api/tasks/{b['id']}", params={"force": "true"})
    assert r.status_code == 200


def test_delete_task_middle_of_chain_blocked(client):
    a = client.post("/api/tasks/", json={"title": "A"}).json()
    b = client.post("/api/tasks/", json={"title": "B"}).json()
    c = client.post("/api/tasks/", json={"title": "C"}).json()
    client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})
    client.post(f"/api/tasks/{c['id']}/dependencies", json={"depends_on_id": b["id"]})
    # B is in the middle: cannot delete even with force
    r = client.delete(f"/api/tasks/{b['id']}", params={"force": "true"})
    assert r.status_code == 409
    assert "middle" in r.json()["detail"].lower()


def test_list_tasks_root_only(client):
    p = client.post("/api/tasks/", json={"title": "Parent"}).json()
    client.post("/api/tasks/", json={"title": "Child", "parent_id": p["id"]})
    r = client.get("/api/tasks/", params={"root_only": "true"})
    titles = [t["title"] for t in r.json()]
    assert "Parent" in titles
    assert "Child" not in titles


def test_list_tasks_filter_status(client):
    client.post("/api/tasks/", json={"title": "Open one"})
    t = client.post("/api/tasks/", json={"title": "Done one"}).json()
    client.put(f"/api/tasks/{t['id']}", json={"status": "done"})
    r = client.get("/api/tasks/", params={"status": "done"})
    assert all(t["status"] == "done" for t in r.json())


def test_list_tasks_filter_category(client):
    client.post("/api/tasks/", json={"title": "Financial", "category": "Financial"})
    client.post("/api/tasks/", json={"title": "Legal", "category": "Legal"})
    r = client.get("/api/tasks/", params={"category": "Financial"})
    assert all(t["category"] == "Financial" for t in r.json())


def test_list_tasks_search(client):
    client.post("/api/tasks/", json={"title": "Alpha task"})
    client.post("/api/tasks/", json={"title": "Beta task"})
    r = client.get("/api/tasks/", params={"search": "Alpha"})
    assert len(r.json()) >= 1
    assert all("Alpha" in t["title"] for t in r.json())


def test_list_tasks_on_board(client):
    client.post("/api/tasks/", json={"title": "On board", "stage_id": 1})
    client.post("/api/tasks/", json={"title": "Off board"})
    on = client.get("/api/tasks/", params={"on_board": "true"}).json()
    off = client.get("/api/tasks/", params={"on_board": "false"}).json()
    assert all(t["stage_id"] is not None for t in on)
    assert all(t["stage_id"] is None for t in off)


def test_add_note(client):
    t = client.post("/api/tasks/", json={"title": "Note test"}).json()
    r = client.post(f"/api/tasks/{t['id']}/log", json={"text": "Important note"})
    assert r.status_code == 200
    full = client.get(f"/api/tasks/{t['id']}").json()
    assert any(a["action"] == "note_added" and "Important note" in a["detail"] for a in full["activities"])


def test_activity_logging(client):
    t = client.post("/api/tasks/", json={"title": "Activity test"}).json()
    client.put(f"/api/tasks/{t['id']}", json={"status": "in_progress"})
    client.put(f"/api/tasks/{t['id']}", json={"priority": "high"})
    client.put(f"/api/tasks/{t['id']}", json={"category": "Career"})
    full = client.get(f"/api/tasks/{t['id']}").json()
    actions = [a["action"] for a in full["activities"]]
    assert "created" in actions
    assert "status_changed" in actions
    assert "priority_changed" in actions
    assert "category_changed" in actions
