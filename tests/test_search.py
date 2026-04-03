"""Tests for global search endpoint and enhanced task search."""


# ── Global Search ──────────────────────────────────────────────────────────────

def test_search_requires_query(client):
    r = client.get("/api/search/", params={"project_id": 1})
    assert r.status_code == 422


def test_search_requires_project(client):
    r = client.get("/api/search/", params={"q": "test"})
    assert r.status_code == 422


def test_search_empty_returns_empty(client):
    r = client.get("/api/search/", params={"project_id": 1, "q": "zzznoresults"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
    assert data["groups"] == []


def test_search_task_by_title(client):
    client.post("/api/tasks/", json={"title": "Boeing Application"})
    r = client.get("/api/search/", params={"project_id": 1, "q": "Boeing"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    task_group = next((g for g in data["groups"] if g["entity_type"] == "task"), None)
    assert task_group is not None
    assert task_group["count"] >= 1
    assert "title" in task_group["hits"][0]["matched_fields"]


def test_search_task_by_description(client):
    client.post("/api/tasks/", json={"title": "Some Task", "description": "Meet with Springfield team"})
    r = client.get("/api/search/", params={"project_id": 1, "q": "Springfield"})
    data = r.json()
    task_group = next((g for g in data["groups"] if g["entity_type"] == "task"), None)
    assert task_group is not None
    assert "description" in task_group["hits"][0]["matched_fields"]


def test_search_contact_by_name(client):
    client.post("/api/contacts/", json={"name": "Chris Helvajian", "role": "Senior Recruiter"}, params={"project_id": 1})
    r = client.get("/api/search/", params={"project_id": 1, "q": "Helvajian"})
    data = r.json()
    contact_group = next((g for g in data["groups"] if g["entity_type"] == "contact"), None)
    assert contact_group is not None
    assert contact_group["count"] >= 1
    hit = contact_group["hits"][0]
    assert "name" in hit["matched_fields"]
    assert hit["title"] == "Chris Helvajian"


def test_search_contact_by_email(client):
    client.post("/api/contacts/", json={"name": "Jane Doe", "email": "jane@acme.com"}, params={"project_id": 1})
    r = client.get("/api/search/", params={"project_id": 1, "q": "jane@acme"})
    data = r.json()
    contact_group = next((g for g in data["groups"] if g["entity_type"] == "contact"), None)
    assert contact_group is not None
    assert "email" in contact_group["hits"][0]["matched_fields"]


def test_search_contact_returns_linked_task_ids(client):
    t = client.post("/api/tasks/", json={"title": "ACME Role"}).json()
    c = client.post("/api/contacts/", json={"name": "Jane Recruiter"}, params={"project_id": 1}).json()
    client.post(f"/api/tasks/{t['id']}/contacts", json={"contact_id": c["id"]})
    r = client.get("/api/search/", params={"project_id": 1, "q": "Jane"})
    data = r.json()
    contact_group = next(g for g in data["groups"] if g["entity_type"] == "contact")
    assert t["id"] in contact_group["hits"][0]["linked_task_ids"]


def test_search_company_by_name(client):
    client.post("/api/companies/", json={"name": "HealthEdge Corp"}, params={"project_id": 1})
    r = client.get("/api/search/", params={"project_id": 1, "q": "HealthEdge"})
    data = r.json()
    co_group = next((g for g in data["groups"] if g["entity_type"] == "company"), None)
    assert co_group is not None
    assert co_group["hits"][0]["title"] == "HealthEdge Corp"


def test_search_document_by_content(client):
    doc = client.post("/api/documents/", json={"title": "Research doc", "content": "Quarterly earnings report Q4"}, params={"project_id": 1}).json()
    r = client.get("/api/search/", params={"project_id": 1, "q": "earnings"})
    data = r.json()
    doc_group = next((g for g in data["groups"] if g["entity_type"] == "document"), None)
    assert doc_group is not None
    assert "content" in doc_group["hits"][0]["matched_fields"]


def test_search_activity_by_detail(client):
    t = client.post("/api/tasks/", json={"title": "Task X"}).json()
    client.post(f"/api/tasks/{t['id']}/log", json={"text": "Discussed the pricing structure in detail"})
    r = client.get("/api/search/", params={"project_id": 1, "q": "pricing"})
    data = r.json()
    act_group = next((g for g in data["groups"] if g["entity_type"] == "activity"), None)
    assert act_group is not None
    assert act_group["hits"][0]["task_id"] == t["id"]


def test_search_returns_display_id(client):
    t = client.post("/api/tasks/", json={"title": "Unique Task XYZ"}).json()
    r = client.get("/api/search/", params={"project_id": 1, "q": "XYZ"})
    data = r.json()
    task_group = next(g for g in data["groups"] if g["entity_type"] == "task")
    assert task_group["hits"][0]["display_id"] is not None


# ── Enhanced Task List Search ──────────────────────────────────────────────────

def test_task_search_by_description(client):
    client.post("/api/tasks/", json={"title": "Unrelated", "description": "Contact Springfield office"})
    r = client.get("/api/tasks/", params={"search": "Springfield"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_task_search_by_linked_contact_name(client):
    t = client.post("/api/tasks/", json={"title": "ACME job"}).json()
    c = client.post("/api/contacts/", json={"name": "Chris Helvajian"}, params={"project_id": 1}).json()
    client.post(f"/api/tasks/{t['id']}/contacts", json={"contact_id": c["id"]})
    r = client.get("/api/tasks/", params={"search": "Helvajian"})
    assert any(task["id"] == t["id"] for task in r.json())


def test_task_search_by_linked_company_name(client):
    t = client.post("/api/tasks/", json={"title": "Some opportunity"}).json()
    co = client.post("/api/companies/", json={"name": "HealthEdge"}, params={"project_id": 1}).json()
    client.post(f"/api/tasks/{t['id']}/companies", json={"company_id": co["id"]})
    r = client.get("/api/tasks/", params={"search": "HealthEdge"})
    assert any(task["id"] == t["id"] for task in r.json())


def test_task_search_no_duplicates(client):
    """Task linked to 2 matching contacts must appear exactly once."""
    t = client.post("/api/tasks/", json={"title": "Role"}).json()
    c1 = client.post("/api/contacts/", json={"name": "John Smith"}, params={"project_id": 1}).json()
    c2 = client.post("/api/contacts/", json={"name": "John Doe"}, params={"project_id": 1}).json()
    client.post(f"/api/tasks/{t['id']}/contacts", json={"contact_id": c1["id"]})
    client.post(f"/api/tasks/{t['id']}/contacts", json={"contact_id": c2["id"]})
    r = client.get("/api/tasks/", params={"search": "John"})
    task_ids = [task["id"] for task in r.json()]
    assert task_ids.count(t["id"]) == 1
