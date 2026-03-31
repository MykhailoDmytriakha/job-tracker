"""Contact CRUD, interactions, and task linking."""


def test_create_contact(client):
    r = client.post("/api/contacts/", json={"name": "Dawn DeGroot", "company": "HCSC", "contact_type": "manager"}, params={"project_id": 1})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Dawn DeGroot"
    assert data["company"] == "HCSC"
    assert data["contact_type"] == "manager"


def test_list_contacts(client):
    client.post("/api/contacts/", json={"name": "Alice", "company": "A"}, params={"project_id": 1})
    client.post("/api/contacts/", json={"name": "Bob", "company": "B"}, params={"project_id": 1})
    r = client.get("/api/contacts/", params={"project_id": 1})
    assert len(r.json()) == 2


def test_search_contacts(client):
    client.post("/api/contacts/", json={"name": "Kelly Finn", "company": "HealthEdge"}, params={"project_id": 1})
    client.post("/api/contacts/", json={"name": "Max West", "company": "GE"}, params={"project_id": 1})
    r = client.get("/api/contacts/", params={"project_id": "1", "q": "Kelly"})
    assert len(r.json()) == 1
    assert r.json()[0]["name"] == "Kelly Finn"


def test_filter_by_type(client):
    client.post("/api/contacts/", json={"name": "A", "contact_type": "recruiter"}, params={"project_id": 1})
    client.post("/api/contacts/", json={"name": "B", "contact_type": "colleague"}, params={"project_id": 1})
    r = client.get("/api/contacts/", params={"project_id": "1", "contact_type": "recruiter"})
    assert len(r.json()) == 1


def test_get_contact(client):
    c = client.post("/api/contacts/", json={"name": "Test", "email": "t@test.com", "linkedin": "https://linkedin.com/in/test"}, params={"project_id": 1}).json()
    r = client.get(f"/api/contacts/{c['id']}")
    assert r.status_code == 200
    assert r.json()["email"] == "t@test.com"
    assert r.json()["interactions"] == []


def test_update_contact(client):
    c = client.post("/api/contacts/", json={"name": "Old"}, params={"project_id": 1}).json()
    r = client.put(f"/api/contacts/{c['id']}", json={"name": "New", "phone": "+1234"})
    assert r.json()["name"] == "New"
    assert r.json()["phone"] == "+1234"


def test_delete_contact(client):
    c = client.post("/api/contacts/", json={"name": "Del"}, params={"project_id": 1}).json()
    r = client.delete(f"/api/contacts/{c['id']}")
    assert r.status_code == 200
    assert client.get(f"/api/contacts/{c['id']}").status_code == 404


def test_add_interaction(client):
    c = client.post("/api/contacts/", json={"name": "P"}, params={"project_id": 1}).json()
    r = client.post(f"/api/contacts/{c['id']}/interactions", json={
        "summary": "Sent LinkedIn message", "channel": "linkedin", "direction": "outbound",
    })
    assert r.status_code == 201
    assert r.json()["channel"] == "linkedin"
    # Verify in contact detail
    detail = client.get(f"/api/contacts/{c['id']}").json()
    assert len(detail["interactions"]) == 1


def test_delete_interaction(client):
    c = client.post("/api/contacts/", json={"name": "P"}, params={"project_id": 1}).json()
    i = client.post(f"/api/contacts/{c['id']}/interactions", json={"summary": "Hi"}).json()
    r = client.delete(f"/api/contacts/{c['id']}/interactions/{i['id']}")
    assert r.status_code == 200


def test_link_contact_to_task(client):
    c = client.post("/api/contacts/", json={"name": "Linked"}, params={"project_id": 1}).json()
    t = client.post("/api/tasks/", json={"title": "Task"}).json()
    r = client.post(f"/api/tasks/{t['id']}/contacts", json={"contact_id": c["id"]})
    assert r.status_code == 200
    # Verify in task
    task = client.get(f"/api/tasks/{t['id']}").json()
    assert any(ct["id"] == c["id"] for ct in task["contacts"])
    # Verify in contact
    contact = client.get(f"/api/contacts/{c['id']}").json()
    assert any(tk["id"] == t["id"] for tk in contact["tasks"])


def test_unlink_contact(client):
    c = client.post("/api/contacts/", json={"name": "Unlink"}, params={"project_id": 1}).json()
    t = client.post("/api/tasks/", json={"title": "Task"}).json()
    client.post(f"/api/tasks/{t['id']}/contacts", json={"contact_id": c["id"]})
    r = client.delete(f"/api/tasks/{t['id']}/contacts/{c['id']}")
    assert r.status_code == 200
    task = client.get(f"/api/tasks/{t['id']}").json()
    assert len(task["contacts"]) == 0
