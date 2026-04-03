"""Meeting cockpit lifecycle and isolation tests."""


STARTER_A = [
    {"section_key": "ready_answers", "content": "A1", "position": 0},
    {"section_key": "questions", "content": "A2", "position": 1},
]

STARTER_B = [
    {"section_key": "ready_answers", "content": "B1", "position": 0},
    {"section_key": "questions", "content": "B2", "position": 1},
]


def _create_task(client, title: str = "Task with meetings") -> dict:
    r = client.post("/api/tasks/", json={"title": title})
    assert r.status_code == 201
    return r.json()


def _create_meeting(client, task_id: int, meeting_type: str = "phone_screen") -> dict:
    r = client.post(
        f"/api/tasks/{task_id}/meetings",
        json={
            "meeting_type": meeting_type,
            "status": "scheduled",
            "platform": "teams",
            "interviewer": f"{meeting_type} interviewer",
        },
    )
    assert r.status_code == 201
    return r.json()


def test_cockpit_is_scoped_to_each_meeting(client):
    task = _create_task(client, "Scoped cockpit")
    meeting_one = _create_meeting(client, task["id"], "phone_screen")
    meeting_two = _create_meeting(client, task["id"], "technical")

    r = client.put(f"/api/tasks/{task['id']}/meetings/{meeting_one['id']}/cockpit", json=STARTER_A)
    assert r.status_code == 200
    r = client.put(f"/api/tasks/{task['id']}/meetings/{meeting_two['id']}/cockpit", json=STARTER_B)
    assert r.status_code == 200

    cockpit_one = client.get(f"/api/tasks/{task['id']}/meetings/{meeting_one['id']}/cockpit")
    cockpit_two = client.get(f"/api/tasks/{task['id']}/meetings/{meeting_two['id']}/cockpit")
    assert cockpit_one.status_code == 200
    assert cockpit_two.status_code == 200
    assert [s["content"] for s in cockpit_one.json()] == ["A1", "A2"]
    assert [s["content"] for s in cockpit_two.json()] == ["B1", "B2"]

    task_detail = client.get(f"/api/tasks/{task['id']}")
    assert task_detail.status_code == 200
    meetings = {m["id"]: m for m in task_detail.json()["meetings"]}
    assert [s["content"] for s in meetings[meeting_one["id"]]["cockpit_sections"]] == ["A1", "A2"]
    assert [s["content"] for s in meetings[meeting_two["id"]]["cockpit_sections"]] == ["B1", "B2"]


def test_create_cockpit_is_idempotent_for_existing_meeting(client):
    task = _create_task(client, "Idempotent cockpit")
    meeting = _create_meeting(client, task["id"])

    first = client.put(f"/api/tasks/{task['id']}/meetings/{meeting['id']}/cockpit", json=STARTER_A)
    assert first.status_code == 200

    second = client.put(f"/api/tasks/{task['id']}/meetings/{meeting['id']}/cockpit", json=STARTER_B)
    assert second.status_code == 200
    assert [s["content"] for s in second.json()] == ["A1", "A2"]

    cockpit = client.get(f"/api/tasks/{task['id']}/meetings/{meeting['id']}/cockpit")
    assert cockpit.status_code == 200
    assert [s["content"] for s in cockpit.json()] == ["A1", "A2"]


def test_delete_meeting_removes_its_cockpit_only(client):
    task = _create_task(client, "Delete meeting cascade")
    meeting_one = _create_meeting(client, task["id"], "phone_screen")
    meeting_two = _create_meeting(client, task["id"], "technical")

    client.put(f"/api/tasks/{task['id']}/meetings/{meeting_one['id']}/cockpit", json=STARTER_A)
    client.put(f"/api/tasks/{task['id']}/meetings/{meeting_two['id']}/cockpit", json=STARTER_B)

    deleted = client.delete(f"/api/tasks/{task['id']}/meetings/{meeting_one['id']}")
    assert deleted.status_code == 200

    missing_cockpit = client.get(f"/api/tasks/{task['id']}/meetings/{meeting_one['id']}/cockpit")
    assert missing_cockpit.status_code == 404

    surviving_cockpit = client.get(f"/api/tasks/{task['id']}/meetings/{meeting_two['id']}/cockpit")
    assert surviving_cockpit.status_code == 200
    assert [s["content"] for s in surviving_cockpit.json()] == ["B1", "B2"]

    task_detail = client.get(f"/api/tasks/{task['id']}")
    assert task_detail.status_code == 200
    meetings = task_detail.json()["meetings"]
    assert [m["id"] for m in meetings] == [meeting_two["id"]]
    assert [s["content"] for s in meetings[0]["cockpit_sections"]] == ["B1", "B2"]
