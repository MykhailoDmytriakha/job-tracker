import json
import sys


def print_json(data) -> None:
    """Print data as JSON to stdout."""
    print(json.dumps(data, indent=2, default=str, ensure_ascii=False))


def print_compact(data) -> None:
    """Print data as compact single-line JSON to stdout."""
    print(json.dumps(data, default=str, ensure_ascii=False))


def print_error(status: int, detail: str, hint: str = "") -> None:
    """Print structured error to stderr."""
    err = {"error": detail, "status": status}
    if hint:
        err["hint"] = hint
    print(json.dumps(err, ensure_ascii=False), file=sys.stderr)


def filter_fields(data, fields: str):
    """Filter a dict or list of dicts to only include specified comma-separated fields."""
    if not fields:
        return data
    keys = [f.strip() for f in fields.split(",") if f.strip()]
    if isinstance(data, list):
        return [{k: item[k] for k in keys if k in item} for item in data]
    if isinstance(data, dict):
        return {k: data[k] for k in keys if k in data}
    return data


def brief_task(t: dict) -> dict:
    """Return a minimal task dict for list views."""
    return {
        "id": t.get("id"),
        "display_id": t.get("display_id"),
        "title": t.get("title"),
        "status": t.get("status"),
        "stage_id": t.get("stage_id"),
        "priority": t.get("priority"),
        "pipeline_heat": t.get("pipeline_heat"),
        "follow_up_date": t.get("follow_up_date"),
        "last_activity_at": t.get("last_activity_at"),
    }
