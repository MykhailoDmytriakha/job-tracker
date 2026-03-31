"""Company CRUD, contact linking, task linking."""


def test_create_company(client):
    r = client.post("/api/companies/", json={
        "name": "Premera Blue Cross", "domain": "payer healthcare",
        "strategic_lane": "Healthcare IT",
    }, params={"project_id": 1})
    assert r.status_code == 201
    assert r.json()["name"] == "Premera Blue Cross"
    assert r.json()["domain"] == "payer healthcare"


def test_list_companies(client):
    client.post("/api/companies/", json={"name": "A"}, params={"project_id": 1})
    client.post("/api/companies/", json={"name": "B"}, params={"project_id": 1})
    r = client.get("/api/companies/", params={"project_id": 1})
    assert len(r.json()) == 2


def test_search_companies(client):
    client.post("/api/companies/", json={"name": "HCSC"}, params={"project_id": 1})
    client.post("/api/companies/", json={"name": "Premera"}, params={"project_id": 1})
    r = client.get("/api/companies/", params={"project_id": "1", "q": "HCSC"})
    assert len(r.json()) == 1


def test_update_company(client):
    co = client.post("/api/companies/", json={"name": "Old"}, params={"project_id": 1}).json()
    r = client.put(f"/api/companies/{co['id']}", json={"name": "New", "website": "https://new.com"})
    assert r.json()["name"] == "New"
    assert r.json()["website"] == "https://new.com"


def test_delete_company(client):
    co = client.post("/api/companies/", json={"name": "Del"}, params={"project_id": 1}).json()
    r = client.delete(f"/api/companies/{co['id']}")
    assert r.status_code == 200


def test_auto_link_contacts(client):
    # Create contact with company string "HCSC"
    ct = client.post("/api/contacts/", json={"name": "Dawn", "company": "HCSC"}, params={"project_id": 1}).json()
    # Create company "HCSC" → should auto-link contact
    co = client.post("/api/companies/", json={"name": "HCSC"}, params={"project_id": 1}).json()
    assert len(co["contacts"]) == 1
    assert co["contacts"][0]["name"] == "Dawn"


def test_link_company_to_task(client):
    co = client.post("/api/companies/", json={"name": "Test Co"}, params={"project_id": 1}).json()
    t = client.post("/api/tasks/", json={"title": "Apply"}).json()
    r = client.post(f"/api/tasks/{t['id']}/companies", json={"company_id": co["id"]})
    assert r.status_code == 200
    task = client.get(f"/api/tasks/{t['id']}").json()
    assert any(c["id"] == co["id"] for c in task["companies"])


def test_unlink_company(client):
    co = client.post("/api/companies/", json={"name": "Unlink"}, params={"project_id": 1}).json()
    t = client.post("/api/tasks/", json={"title": "Task"}).json()
    client.post(f"/api/tasks/{t['id']}/companies", json={"company_id": co["id"]})
    client.delete(f"/api/tasks/{t['id']}/companies/{co['id']}")
    task = client.get(f"/api/tasks/{t['id']}").json()
    assert len(task["companies"]) == 0


def test_company_shows_linked_tasks(client):
    co = client.post("/api/companies/", json={"name": "Co"}, params={"project_id": 1}).json()
    t = client.post("/api/tasks/", json={"title": "Role"}).json()
    client.post(f"/api/tasks/{t['id']}/companies", json={"company_id": co["id"]})
    company = client.get(f"/api/companies/{co['id']}").json()
    assert any(tk["id"] == t["id"] for tk in company["tasks"])
