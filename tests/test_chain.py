"""Dependency chain endpoint."""


def test_chain_linear(client):
    """A -> B -> C -> D, view from B."""
    a = client.post("/api/tasks/", json={"title": "Step 1"}).json()
    b = client.post("/api/tasks/", json={"title": "Step 2"}).json()
    c = client.post("/api/tasks/", json={"title": "Step 3"}).json()
    d = client.post("/api/tasks/", json={"title": "Step 4"}).json()
    client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})
    client.post(f"/api/tasks/{c['id']}/dependencies", json={"depends_on_id": b["id"]})
    client.post(f"/api/tasks/{d['id']}/dependencies", json={"depends_on_id": c["id"]})

    r = client.get(f"/api/tasks/{b['id']}/chain")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 4
    assert len(data["nodes"]) == 4
    assert len(data["edges"]) == 3
    current = [n for n in data["nodes"] if n["is_current"]]
    assert len(current) == 1
    assert current[0]["id"] == b["id"]


def test_chain_from_root(client):
    a = client.post("/api/tasks/", json={"title": "Root"}).json()
    b = client.post("/api/tasks/", json={"title": "Leaf"}).json()
    client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})

    data = client.get(f"/api/tasks/{a['id']}/chain").json()
    assert data["total"] == 2
    root = next(n for n in data["nodes"] if n["id"] == a["id"])
    assert root["layer"] == 0


def test_chain_from_leaf(client):
    a = client.post("/api/tasks/", json={"title": "Root"}).json()
    b = client.post("/api/tasks/", json={"title": "Leaf"}).json()
    client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})

    data = client.get(f"/api/tasks/{b['id']}/chain").json()
    assert data["total"] == 2
    leaf = next(n for n in data["nodes"] if n["id"] == b["id"])
    assert leaf["layer"] == 1


def test_chain_solo_task(client):
    t = client.post("/api/tasks/", json={"title": "Solo"}).json()
    data = client.get(f"/api/tasks/{t['id']}/chain").json()
    assert data["nodes"] == []


def test_chain_done_tasks_included(client):
    a = client.post("/api/tasks/", json={"title": "Done"}).json()
    b = client.post("/api/tasks/", json={"title": "Open"}).json()
    client.post(f"/api/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]})
    client.put(f"/api/tasks/{a['id']}", json={"status": "done"})

    data = client.get(f"/api/tasks/{b['id']}/chain").json()
    assert data["total"] == 2
    done_node = next(n for n in data["nodes"] if n["id"] == a["id"])
    assert done_node["status"] == "done"


def test_chain_fan_in(client):
    """A and B both block C (parallel dependencies)."""
    a = client.post("/api/tasks/", json={"title": "A"}).json()
    b = client.post("/api/tasks/", json={"title": "B"}).json()
    c = client.post("/api/tasks/", json={"title": "C"}).json()
    client.post(f"/api/tasks/{c['id']}/dependencies", json={"depends_on_id": a["id"]})
    client.post(f"/api/tasks/{c['id']}/dependencies", json={"depends_on_id": b["id"]})

    data = client.get(f"/api/tasks/{c['id']}/chain").json()
    assert data["total"] == 3
    assert len(data["edges"]) == 2
    # A and B at layer 0, C at layer 1
    c_node = next(n for n in data["nodes"] if n["id"] == c["id"])
    assert c_node["layer"] == 1
    a_node = next(n for n in data["nodes"] if n["id"] == a["id"])
    b_node = next(n for n in data["nodes"] if n["id"] == b["id"])
    assert a_node["layer"] == 0
    assert b_node["layer"] == 0
