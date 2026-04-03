import click
from datetime import datetime, date
from ..output import print_json


def _group_activities(items: list) -> list:
    """Group activity items by (task_id, timestamp-within-2s) into batched events.

    A single `jt up` call that changes stage, status, heat, and follow_up
    produces 4+ separate activity rows with near-identical timestamps.
    This groups them into one logical event per task per moment.
    """
    if not items:
        return []

    groups = []
    current = None

    for item in items:
        ts = item.get("timestamp", "")
        task_id = item.get("task_id")

        # Parse timestamp for proximity check
        try:
            item_dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            item_dt = None

        # Same group if same task and within 2 seconds
        same_group = False
        if current and current["task_id"] == task_id and item_dt and current.get("_dt"):
            diff = abs((current["_dt"] - item_dt).total_seconds())
            same_group = diff <= 2.0

        if same_group:
            current["changes"].append(_format_change(item))
        else:
            if current:
                groups.append(_finalize_group(current))
            current = {
                "task_id": task_id,
                "display_id": item.get("display_id"),
                "task_title": item.get("task_title"),
                "timestamp": ts,
                "_dt": item_dt,
                "changes": [_format_change(item)],
            }

    if current:
        groups.append(_finalize_group(current))

    return groups


def _format_change(item: dict) -> str:
    """Format a single activity into a compact change string."""
    action = item.get("action", "")
    detail = item.get("detail", "")

    # Description diff - show compact diff as-is (already computed by backend)
    if action == "description_updated":
        if not detail:
            return "description updated"
        # Old-format logs (legacy [old]\n... dumps) - truncate
        if detail.startswith("[old]\n"):
            return "description updated (legacy log)"
        # New diff format - show as-is, truncate if very long
        if len(detail) > 300:
            return f"desc diff:\n{detail[:300]}\n[truncated]"
        return f"desc diff:\n{detail}"

    # Compact format for known action types
    _ACTION_LABELS = {
        "moved": "",
        "status_changed": "status: ",
        "heat_changed": "heat: ",
        "outreach_changed": "outreach: ",
        "priority_changed": "priority: ",
        "category_changed": "category: ",
        "due_date_changed": "due: ",
        "follow_up_date_changed": "follow_up: ",
        "close_reason_set": "",
        "applied": "",
        "title_changed": "title: ",
    }

    if action in _ACTION_LABELS:
        prefix = _ACTION_LABELS[action]
        return f"{prefix}{detail}" if prefix else detail

    if action == "note_added":
        return f"note: {detail}"

    if action == "created":
        return "created"

    # Linking/unlinking
    if action.endswith("_linked"):
        entity = action.replace("_linked", "")
        return f"+{entity}: {detail}"
    if action.endswith("_unlinked"):
        entity = action.replace("_unlinked", "")
        return f"-{entity}: {detail}"

    # Checklist/subtask
    if action == "checklist_added":
        return f"+check: {detail}"
    if action == "checklist_toggled":
        return detail  # "checked: ..." or "unchecked: ..."
    if action == "checklist_removed":
        return f"-check: {detail}"
    if action == "subtask_added":
        return f"+subtask: {detail}"

    # Dependencies
    if action == "dependency_added" or action == "blocks_added":
        return detail
    if action == "dependency_removed" or action == "blocks_removed":
        return detail

    # Meetings
    if action.startswith("meeting_"):
        return f"meeting: {detail}"

    # Fallback
    return f"{action}: {detail}" if detail else action


def _finalize_group(group: dict) -> dict:
    """Convert internal group to output dict."""
    group.pop("_dt", None)
    return group


@click.command("log")
@click.option("--since", default=None, help="From date inclusive (YYYY-MM-DD)")
@click.option("--until", default=None, help="To date inclusive (YYYY-MM-DD)")
@click.option("--task", "task_id", type=int, default=None, help="Filter by task ID")
@click.option("--action", default=None, help="Filter by action type (e.g. moved, note_added)")
@click.option("--limit", type=int, default=200, help="Max results (default 200)")
@click.option("--raw", is_flag=True, help="Raw output without batch grouping")
@click.pass_context
def log_cmd(ctx, since, until, task_id, action, limit, raw):
    """Query activity journal. Defaults to today's activities (or last 20 if today is empty).

    \b
    Output is batch-grouped by default: multiple field changes from one
    `jt up` call appear as a single event. Use --raw for individual entries.

    \b
    Examples:
      jt log                                   today's activities (grouped)
      jt log --raw                             today's activities (raw entries)
      jt log --since=2026-03-01                from March 1st
      jt log --since=2026-03-01 --until=2026-03-31
      jt log --task=180                        specific task history
      jt log --action=moved                    all stage transitions
      jt log --action=note_added --since=2026-04-01
    """
    client = ctx.obj["client"]

    params = {"limit": limit}
    is_default_today = False
    if since:
        params["since"] = since
    elif not until and not task_id and not action:
        # Default: today
        params["since"] = str(date.today())
        params["until"] = str(date.today())
        is_default_today = True
    if until:
        params["until"] = until
    if task_id is not None:
        params["task_id"] = task_id
    if action:
        params["action"] = action

    data = client.get("/api/activities/", params=params)

    # Fallback: if default-today returned empty, show last 20
    if is_default_today and data.get("total", 0) == 0:
        params.pop("since", None)
        params.pop("until", None)
        params["limit"] = 20
        data = client.get("/api/activities/", params=params)

    if raw:
        print_json(data)
        return

    # Batch-grouped output
    items = data.get("items", [])
    grouped = _group_activities(items)
    print_json({"events": grouped, "total_raw": data.get("total", 0), "grouped": len(grouped)})
