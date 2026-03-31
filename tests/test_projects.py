"""Project CRUD and task scoping."""


def test_list_projects(client):
    r = client.get("/api/projects/")
    assert r.status_code == 200
    # Default TST project seeded in conftest
    assert any(p["short_key"] == "TST" for p in r.json())


def test_create_project(client):
    r = client.post("/api/projects/", json={"name": "My Search", "short_key": "MSR"})
    assert r.status_code == 201
    assert r.json()["short_key"] == "MSR"


def test_create_project_invalid_key(client):
    r = client.post("/api/projects/", json={"name": "Bad", "short_key": "X"})
    assert r.status_code == 422

    r = client.post("/api/projects/", json={"name": "Bad", "short_key": "TOOLONG"})
    assert r.status_code == 422


def test_create_project_duplicate_key(client):
    client.post("/api/projects/", json={"name": "First", "short_key": "DUP"})
    r = client.post("/api/projects/", json={"name": "Second", "short_key": "DUP"})
    assert r.status_code == 409


def test_task_display_id(client):
    # TST project is id=1
    t1 = client.post("/api/tasks/", json={"title": "First"}).json()
    t2 = client.post("/api/tasks/", json={"title": "Second"}).json()
    assert t1["display_id"] == "TST-1"
    assert t2["display_id"] == "TST-2"


def test_task_display_id_per_project(client):
    # Create second project
    p = client.post("/api/projects/", json={"name": "Other", "short_key": "OTH"}).json()
    t = client.post("/api/tasks/", json={"title": "Task in OTH"}, params={"project_id": p["id"]}).json()
    assert t["display_id"] == "OTH-1"


def test_list_tasks_scoped_to_project(client):
    p = client.post("/api/projects/", json={"name": "Scoped", "short_key": "SCP"}).json()
    client.post("/api/tasks/", json={"title": "In TST"})  # goes to TST (default)
    client.post("/api/tasks/", json={"title": "In SCP"}, params={"project_id": p["id"]})

    tst = client.get("/api/tasks/", params={"project_id": "1"}).json()
    scp = client.get("/api/tasks/", params={"project_id": str(p["id"])}).json()
    assert any(t["title"] == "In TST" for t in tst)
    assert not any(t["title"] == "In SCP" for t in tst)
    assert any(t["title"] == "In SCP" for t in scp)


def test_delete_empty_project(client):
    p = client.post("/api/projects/", json={"name": "Empty", "short_key": "EMP"}).json()
    r = client.delete(f"/api/projects/{p['id']}")
    assert r.status_code == 200


def test_delete_project_with_tasks_blocked(client):
    client.post("/api/tasks/", json={"title": "Task"})  # in TST
    r = client.delete("/api/projects/1")
    assert r.status_code == 409
