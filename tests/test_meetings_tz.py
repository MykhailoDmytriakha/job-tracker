"""Timezone correctness for meetings.scheduled_at.

Covers the round-trip "wall clock in user's tz <-> naive UTC in DB" contract:
  - input: client may send Z-suffixed UTC ISO, +offset ISO, or naive (assumed UTC)
  - storage: naive UTC
  - output: Z-suffixed ISO (so JS new Date() interprets as UTC and renders in browser local)

Also covers the aggregated /api/meetings filter which is the original bug:
meetings within ~tz_offset hours of "now local" disappeared because the
filter compared naive-UTC `now` with naive-local `scheduled_at`.
"""

from datetime import datetime, timedelta, timezone


def _create_task(client, title="Task with meeting"):
    r = client.post("/api/tasks/", json={"title": title})
    assert r.status_code == 201
    return r.json()


def _create_meeting(client, task_id, scheduled_at=None, **kwargs):
    body = {
        "meeting_type": "phone_screen",
        "status": "scheduled",
        "platform": "teams",
        **kwargs,
    }
    if scheduled_at is not None:
        body["scheduled_at"] = scheduled_at
    r = client.post(f"/api/tasks/{task_id}/meetings", json=body)
    assert r.status_code == 201, r.text
    return r.json()


# ── Round-trip tests ────────────────────────────────────────────────────────


def test_create_with_utc_z_suffix_returns_z_suffix(client):
    task = _create_task(client)
    m = _create_meeting(client, task["id"], scheduled_at="2026-04-08T21:00:00Z")
    assert m["scheduled_at"] == "2026-04-08T21:00:00Z"


def test_create_with_offset_normalizes_to_utc_z(client):
    """14:00 PDT (-07:00) is 21:00 UTC."""
    task = _create_task(client)
    m = _create_meeting(client, task["id"], scheduled_at="2026-04-08T14:00:00-07:00")
    assert m["scheduled_at"] == "2026-04-08T21:00:00Z"


def test_create_with_naive_iso_assumed_utc(client):
    """Naive input is treated as UTC (clients are expected to convert before sending)."""
    task = _create_task(client)
    m = _create_meeting(client, task["id"], scheduled_at="2026-04-08T21:00:00")
    assert m["scheduled_at"] == "2026-04-08T21:00:00Z"


def test_create_with_null_scheduled_at(client):
    task = _create_task(client)
    m = _create_meeting(client, task["id"], scheduled_at=None)
    assert m["scheduled_at"] is None


def test_get_after_create_returns_same_utc(client):
    task = _create_task(client)
    created = _create_meeting(client, task["id"], scheduled_at="2026-04-08T14:00:00-07:00")
    r = client.get(f"/api/tasks/{task['id']}/meetings")
    assert r.status_code == 200
    listed = next(m for m in r.json() if m["id"] == created["id"])
    assert listed["scheduled_at"] == "2026-04-08T21:00:00Z"


def test_update_scheduled_at_normalizes(client):
    task = _create_task(client)
    m = _create_meeting(client, task["id"], scheduled_at="2026-04-08T21:00:00Z")
    r = client.put(
        f"/api/tasks/{task['id']}/meetings/{m['id']}",
        json={"scheduled_at": "2026-04-09T10:00:00+02:00"},
    )
    assert r.status_code == 200
    assert r.json()["scheduled_at"] == "2026-04-09T08:00:00Z"


# ── Aggregated /api/meetings filter (the original bug) ─────────────────────


def test_upcoming_filter_keeps_meetings_within_tz_offset_window(client):
    """Regression: a meeting 2h in the future (UTC) must appear in upcoming.

    Before fix: backend filter compared naive-UTC `now` to naive-local
    `scheduled_at`, so meetings within ~tz_offset hours of local now were
    filtered out as "past". After fix: storage is naive UTC, comparison is
    naive UTC, no offset confusion possible.
    """
    task = _create_task(client)
    soon_utc = datetime.now(timezone.utc) + timedelta(hours=2)
    iso = soon_utc.isoformat().replace("+00:00", "Z")
    _create_meeting(client, task["id"], scheduled_at=iso)

    r = client.get("/api/meetings", params={"days": 7, "project_id": 1})
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["task_id"] == task["id"]


def test_upcoming_filter_excludes_past_meetings(client):
    task = _create_task(client)
    past_utc = datetime.now(timezone.utc) - timedelta(hours=2)
    iso = past_utc.isoformat().replace("+00:00", "Z")
    _create_meeting(client, task["id"], scheduled_at=iso)

    r = client.get("/api/meetings", params={"days": 7, "project_id": 1})
    assert r.status_code == 200
    assert r.json() == []


def test_include_past_returns_old_meetings(client):
    task = _create_task(client)
    past_utc = datetime.now(timezone.utc) - timedelta(hours=2)
    iso = past_utc.isoformat().replace("+00:00", "Z")
    m = _create_meeting(client, task["id"], scheduled_at=iso)

    r = client.get("/api/meetings", params={"include_past": "true", "project_id": 1})
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["id"] == m["id"]


def test_aggregated_endpoint_returns_z_suffix(client):
    task = _create_task(client)
    soon_utc = datetime.now(timezone.utc) + timedelta(hours=3)
    iso = soon_utc.isoformat().replace("+00:00", "Z")
    _create_meeting(client, task["id"], scheduled_at=iso)

    r = client.get("/api/meetings", params={"days": 7, "project_id": 1})
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["scheduled_at"].endswith("Z")
