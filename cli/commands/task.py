import click
from datetime import datetime, date, timezone, timedelta
from ..output import print_json, print_error, filter_fields, brief_task


# ---------- key=value parser ----------

_INT_FIELDS = {
    "stage_id", "parent_id", "project_id",
}
_BOOL_FIELDS = {
    "is_recurring", "is_blocked",
}


def parse_kvs(kvs: tuple) -> dict:
    """Parse ('status=done', 'stage_id=3', ...) into a dict with type coercion."""
    result = {}
    for kv in kvs:
        if "=" not in kv:
            raise click.UsageError(
                f"Invalid argument '{kv}'. Expected key=value format."
            )
        key, _, value = kv.partition("=")
        key = key.strip()
        value = value.strip()
        # Type coercion
        if key in _INT_FIELDS or key.endswith("_id"):
            try:
                result[key] = int(value)
            except ValueError:
                result[key] = value
        elif key in _BOOL_FIELDS or key.startswith("is_"):
            result[key] = value.lower() in ("true", "1", "yes")
        elif value == "null" or value == "none":
            result[key] = None
        else:
            result[key] = value
    return result


# ---------- commands ----------

@click.command("get")
@click.argument("task_id", type=int)
@click.option("--fields", default=None, help="Comma-separated fields to include")
@click.pass_context
def get_cmd(ctx, task_id, fields):
    """Get full task detail."""
    client = ctx.obj["client"]
    data = client.get(f"/api/tasks/{task_id}")
    if fields:
        data = filter_fields(data, fields)
    print_json(data)


@click.command("ls")
@click.option("--status", default=None, help="Filter by status")
@click.option("--stage", "stage_id", type=int, default=None, help="Filter by stage_id")
@click.option("--priority", default=None, help="Filter by priority")
@click.option("--category", default=None, help="Filter by category")
@click.option("--search", default=None, help="Text search across title/description/activities")
@click.option("--overdue", is_flag=True, help="Only overdue tasks")
@click.option("--attention", is_flag=True, help="Only tasks needing attention")
@click.option("--recurring", is_flag=True, help="Only recurring tasks")
@click.option("--on-board", is_flag=True, help="Only tasks on kanban board")
@click.option("--brief", is_flag=True, help="Minimal fields only")
@click.option("--fields", default=None, help="Comma-separated fields to include")
@click.pass_context
def ls_cmd(ctx, status, stage_id, priority, category, search, overdue, attention, recurring, on_board, brief, fields):
    """List tasks with optional filters."""
    client = ctx.obj["client"]
    params = {}
    if status:
        params["status"] = status
    if stage_id is not None:
        params["stage_id"] = stage_id
    if priority:
        params["priority"] = priority
    if category:
        params["category"] = category
    if search:
        params["search"] = search
    if overdue:
        params["overdue"] = "true"
    if attention:
        params["attention"] = "true"
    if recurring:
        params["is_recurring"] = "true"
    if on_board:
        params["on_board"] = "true"

    data = client.get("/api/tasks/", params=params)

    if brief:
        data = [brief_task(t) for t in data]
    elif fields:
        data = filter_fields(data, fields)
    print_json(data)


@click.command("new")
@click.argument("title")
@click.argument("kvs", nargs=-1)
@click.option("--link-contact", type=int, multiple=True, help="Link contact by ID")
@click.option("--link-company", type=int, multiple=True, help="Link company by ID")
@click.option("--link-doc", type=int, multiple=True, help="Link document by ID")
@click.option("--force", is_flag=True, help="Skip duplicate title check")
@click.pass_context
def new_cmd(ctx, title, kvs, link_contact, link_company, link_doc, force):
    """Create a new task. Extra fields via key=value pairs.

    \b
    Examples:
      jt new "Call recruiter"
      jt new "Apply to WAHBE" priority=high stage_id=3 follow_up_date=2026-04-15
      jt new "Research Boeing" --link-company=5
    """
    client = ctx.obj["client"]
    body = parse_kvs(kvs)
    body["title"] = title

    params = {}
    if force:
        params["force"] = "true"

    task = client.post("/api/tasks/", json=body, params=params)
    task_id = task["id"]

    # Link entities if requested
    for cid in link_contact:
        client.post(f"/api/tasks/{task_id}/contacts", json={"contact_id": cid})
    for cid in link_company:
        client.post(f"/api/tasks/{task_id}/companies", json={"company_id": cid})
    for did in link_doc:
        client.post(f"/api/tasks/{task_id}/documents", json={"document_id": did})

    # Re-fetch if links were added so response reflects them
    if link_contact or link_company or link_doc:
        task = client.get(f"/api/tasks/{task_id}")

    print_json(task)


@click.command("up")
@click.argument("task_id", type=int)
@click.argument("kvs", nargs=-1, required=True)
@click.pass_context
def up_cmd(ctx, task_id, kvs):
    """Update task fields using key=value pairs.

    \b
    Examples:
      jt up 180 status=done
      jt up 180 stage_id=4 pipeline_heat=hot
      jt up 180 follow_up_date=2026-04-15 status=waiting
    """
    client = ctx.obj["client"]
    body = parse_kvs(kvs)
    data = client.put(f"/api/tasks/{task_id}", json=body)
    print_json(data)


@click.command("note")
@click.argument("task_id", type=int)
@click.argument("text")
@click.pass_context
def note_cmd(ctx, task_id, text):
    """Add a note/log entry to a task."""
    client = ctx.obj["client"]
    data = client.post(f"/api/tasks/{task_id}/log", json={"text": text})
    print_json({"ok": True, "task_id": task_id})


@click.command("del")
@click.argument("task_id", type=int)
@click.option("--force", is_flag=True, help="Force delete even if task has dependents")
@click.pass_context
def del_cmd(ctx, task_id, force):
    """Delete a task."""
    client = ctx.obj["client"]
    params = {"force": "true"} if force else {}
    data = client.delete(f"/api/tasks/{task_id}", params=params)
    print_json(data)


@click.command("link")
@click.argument("task_id", type=int)
@click.argument("entity_type", type=click.Choice(["contact", "company", "doc"]))
@click.argument("entity_id", type=int)
@click.pass_context
def link_cmd(ctx, task_id, entity_type, entity_id):
    """Link a contact, company, or document to a task.

    \b
    Examples:
      jt link 180 contact 31
      jt link 180 company 23
      jt link 180 doc 51
    """
    client = ctx.obj["client"]
    path_map = {"contact": "contacts", "company": "companies", "doc": "documents"}
    body_key_map = {"contact": "contact_id", "company": "company_id", "doc": "document_id"}
    path = f"/api/tasks/{task_id}/{path_map[entity_type]}"
    body = {body_key_map[entity_type]: entity_id}
    data = client.post(path, json=body)
    print_json({"ok": True, "task_id": task_id, "linked": entity_type, "id": entity_id})


@click.command("unlink")
@click.argument("task_id", type=int)
@click.argument("entity_type", type=click.Choice(["contact", "company", "doc"]))
@click.argument("entity_id", type=int)
@click.pass_context
def unlink_cmd(ctx, task_id, entity_type, entity_id):
    """Unlink a contact, company, or document from a task."""
    client = ctx.obj["client"]
    path_map = {"contact": "contacts", "company": "companies", "doc": "documents"}
    path = f"/api/tasks/{task_id}/{path_map[entity_type]}/{entity_id}"
    client.delete(path)
    print_json({"ok": True, "task_id": task_id, "unlinked": entity_type, "id": entity_id})


@click.command("deps")
@click.argument("task_id", type=int)
@click.pass_context
def deps_cmd(ctx, task_id):
    """Show dependencies (blockers and what this task blocks)."""
    client = ctx.obj["client"]
    data = client.get(f"/api/tasks/{task_id}/dependencies")
    print_json(data)


@click.command("chain")
@click.argument("task_id", type=int)
@click.pass_context
def chain_cmd(ctx, task_id):
    """Show full dependency chain as a graph."""
    client = ctx.obj["client"]
    data = client.get(f"/api/tasks/{task_id}/chain")
    print_json(data)


@click.command("block")
@click.argument("task_id", type=int)
@click.argument("blocker_id", type=int)
@click.pass_context
def block_cmd(ctx, task_id, blocker_id):
    """Mark task_id as blocked by blocker_id."""
    client = ctx.obj["client"]
    client.post(f"/api/tasks/{task_id}/dependencies", json={"depends_on_id": blocker_id})
    print_json({"ok": True, "task_id": task_id, "blocked_by": blocker_id})


@click.command("unblock")
@click.argument("task_id", type=int)
@click.argument("blocker_id", type=int)
@click.pass_context
def unblock_cmd(ctx, task_id, blocker_id):
    """Remove blocker relationship."""
    client = ctx.obj["client"]
    client.delete(f"/api/tasks/{task_id}/dependencies/{blocker_id}")
    print_json({"ok": True, "task_id": task_id, "removed_blocker": blocker_id})


# ---------- attention check ----------

_CADENCE_DAYS = {
    "daily": 1, "weekly": 7, "biweekly": 14,
    "monthly": 30, "quarterly": 90,
}


def _aware(dt_str):
    if not dt_str:
        return None
    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def evaluate_attention(task: dict) -> dict:
    """Evaluate all 7 attention criteria. Returns {attention, reasons, days_inactive}."""
    now = datetime.now(timezone.utc)
    today = date.today()
    reasons = []

    activities = task.get("activities") or []
    last_ts = activities[0]["timestamp"] if activities else None
    last_aware = _aware(last_ts) if last_ts else None
    days_inactive = int((now - last_aware).days) if last_aware else 9999

    status = task.get("status", "")
    priority = task.get("priority", "")
    is_recurring = task.get("is_recurring", False)
    cadence = task.get("cadence") or ""
    due_date_str = task.get("due_date")
    follow_up_str = task.get("follow_up_date")
    is_blocked = task.get("is_blocked", False)
    blocked_by = task.get("blocked_by") or []
    created_at_str = task.get("created_at")

    due_date = date.fromisoformat(due_date_str[:10]) if due_date_str else None
    follow_up = date.fromisoformat(follow_up_str[:10]) if follow_up_str else None

    # 1. Non-recurring with no dates at all
    if not is_recurring and not due_date and not follow_up:
        reasons.append({
            "criterion": 1,
            "label": "Drifting",
            "detail": "No due_date and no follow_up_date — will be forgotten",
        })

    # 2. Recurring missed 3+ cycles
    if is_recurring:
        cadence_days = _CADENCE_DAYS.get(cadence, 1)
        ref = last_aware or _aware(created_at_str)
        if ref and (now - ref).days >= cadence_days * 3:
            missed = (now - ref).days // cadence_days
            reasons.append({
                "criterion": 2,
                "label": "Recurring stale",
                "detail": f"Cadence={cadence} ({cadence_days}d), last activity {days_inactive}d ago — ~{missed} missed cycles",
            })

    # 3. Waiting with overdue follow-up
    if status == "waiting" and follow_up and follow_up < today:
        overdue_days = (today - follow_up).days
        reasons.append({
            "criterion": 3,
            "label": "Missed follow-up",
            "detail": f"Status=waiting, follow_up_date={follow_up_str[:10]} was {overdue_days}d ago",
        })

    # 4. In-progress frozen 14+ days
    if status == "in_progress" and days_inactive >= 14:
        reasons.append({
            "criterion": 4,
            "label": "Frozen in-progress",
            "detail": f"status=in_progress, no activity for {days_inactive} days",
        })

    # 5. High priority no due date
    if priority == "high" and not due_date:
        reasons.append({
            "criterion": 5,
            "label": "High priority unscheduled",
            "detail": "priority=high but no due_date set",
        })

    # 6. Blocked and stale 7+ days
    if (is_blocked or blocked_by) and days_inactive >= 7:
        blockers = [b.get("display_id") or str(b.get("id")) for b in blocked_by]
        reasons.append({
            "criterion": 6,
            "label": "Blocked stale",
            "detail": f"Blocked by {blockers}, no activity for {days_inactive} days",
        })

    # 7. Open never touched 10+ days
    if status == "open" and created_at_str:
        age = (now - _aware(created_at_str)).days
        has_real = any(a["action"] != "created" for a in activities)
        if age >= 10 and not has_real:
            reasons.append({
                "criterion": 7,
                "label": "Untouched open",
                "detail": f"status=open, only 'created' activity, {age} days old",
            })

    return {
        "attention": len(reasons) > 0,
        "reason_count": len(reasons),
        "days_inactive": days_inactive if days_inactive < 9999 else None,
        "reasons": reasons,
    }


@click.command("why")
@click.argument("task_id", type=int)
@click.pass_context
def why_cmd(ctx, task_id):
    """Check if a task needs attention and why (evaluates all 7 criteria).

    \b
    Examples:
      jt why 180
      jt why 42
    """
    client = ctx.obj["client"]
    task = client.get(f"/api/tasks/{task_id}")
    result = evaluate_attention(task)
    result["task_id"] = task_id
    result["display_id"] = task.get("display_id")
    result["title"] = task.get("title")
    print_json(result)
