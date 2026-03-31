"""Checklist CRUD and behavior."""


def test_add_checklist_item(client):
    t = client.post("/api/tasks/", json={"title": "CL test"}).json()
    r = client.post(f"/api/tasks/{t['id']}/checklist", json={"text": "Step 1", "position": 0})
    assert r.status_code == 201
    assert r.json()["text"] == "Step 1"
    assert r.json()["is_done"] is False


def test_toggle_checklist_item(client):
    t = client.post("/api/tasks/", json={"title": "CL"}).json()
    item = client.post(f"/api/tasks/{t['id']}/checklist", json={"text": "S1"}).json()
    r = client.put(f"/api/tasks/{t['id']}/checklist/{item['id']}", json={"is_done": True})
    assert r.status_code == 200
    assert r.json()["is_done"] is True

    # Toggle back
    r = client.put(f"/api/tasks/{t['id']}/checklist/{item['id']}", json={"is_done": False})
    assert r.json()["is_done"] is False


def test_delete_checklist_item(client):
    t = client.post("/api/tasks/", json={"title": "CL"}).json()
    item = client.post(f"/api/tasks/{t['id']}/checklist", json={"text": "S1"}).json()
    r = client.delete(f"/api/tasks/{t['id']}/checklist/{item['id']}")
    assert r.status_code == 200
    full = client.get(f"/api/tasks/{t['id']}").json()
    assert len(full["checklist_items"]) == 0


def test_checklist_progress_in_brief(client):
    t = client.post("/api/tasks/", json={"title": "CL"}).json()
    i1 = client.post(f"/api/tasks/{t['id']}/checklist", json={"text": "S1"}).json()
    client.post(f"/api/tasks/{t['id']}/checklist", json={"text": "S2"})
    client.put(f"/api/tasks/{t['id']}/checklist/{i1['id']}", json={"is_done": True})

    full = client.get(f"/api/tasks/{t['id']}").json()
    assert full["checklist_total"] == 2
    assert full["checklist_done"] == 1


def test_checklist_not_found(client):
    t = client.post("/api/tasks/", json={"title": "CL"}).json()
    r = client.put(f"/api/tasks/{t['id']}/checklist/9999", json={"is_done": True})
    assert r.status_code == 404


def test_checklist_activity_logged(client):
    t = client.post("/api/tasks/", json={"title": "CL"}).json()
    item = client.post(f"/api/tasks/{t['id']}/checklist", json={"text": "S1"}).json()
    client.put(f"/api/tasks/{t['id']}/checklist/{item['id']}", json={"is_done": True})

    full = client.get(f"/api/tasks/{t['id']}").json()
    actions = [a["action"] for a in full["activities"]]
    assert "checklist_added" in actions
    assert "checklist_toggled" in actions
