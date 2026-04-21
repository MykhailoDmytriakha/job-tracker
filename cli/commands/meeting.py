import json as json_mod
import click
from ..output import print_json
from .task import parse_kvs
from ..params import TASK_ID


@click.group("meeting")
def meeting_group():
    """Manage meetings. Per-task CRUD + cross-task aggregated views.

    \b
    Cross-task (use these at session start to not miss anything):
      jt meeting upcoming                      # next 14 days across ALL tasks
      jt meeting upcoming --days=3             # next 3 days
      jt meeting upcoming --include-past       # also show past scheduled
      jt meeting next                          # single closest meeting
      jt meeting today                         # today + tomorrow

    \b
    Per-task CRUD (task_id accepts numeric ID or display_id like EJS-225):
      jt meeting add 97 phone_screen scheduled_at=2026-04-06T14:30:00 platform=teams
      jt meeting add EJS-225 technical interviewer="Eldhose" platform=google_meet
      jt meeting ls 97
      jt meeting ls EJS-225
      jt meeting up 97 1 status=completed result=passed
      jt meeting done 97 1 --result=passed
      jt meeting del 97 1

    \b
    Unscheduled meetings (persistent pending safety net):
      scheduled_at is optional at creation and can be cleared back to null later.
      Unscheduled meetings (scheduled_at IS NULL) always surface in
      `jt meeting upcoming` regardless of the --days window; they act as
      persistent pending-meeting alerts until a real time is set or the meeting
      is marked completed/cancelled. Use this to encode "meeting exists, time
      unknown" in a machine-readable way that survives session boundaries.
      jt meeting add 226 other interviewer="Tiger Senior TBD" platform=google_meet
      jt meeting up 226 7 scheduled_at=null status=rescheduled notes="time dropped, waiting"

    \b
    Cockpit (live interview reference screen):
      jt meeting cockpit ls 97 1
      jt meeting cockpit set 97 1 pitch "My 60-sec pitch text..."
      jt meeting cockpit set 97 1 rescue_phrases "That's a great question..."
      jt meeting cockpit bulk 97 1 sections.json
    """


@meeting_group.command("add")
@click.argument("task_id", type=TASK_ID)
@click.argument("meeting_type")
@click.argument("kvs", nargs=-1)
@click.pass_context
def add_cmd(ctx, task_id, meeting_type, kvs):
    """Add a meeting to a task.

    \b
    meeting_type: phone_screen | technical | behavioral | panel | onsite | other
    status:       scheduled | completed | cancelled | rescheduled | no_show
    platform:     teams | zoom | phone | onsite | other
    result:       passed | failed | pending | unknown

    \b
    scheduled_at is OPTIONAL. Omit it to create an unscheduled meeting (time TBD).
    Unscheduled meetings surface in `jt meeting upcoming` by default and stay there
    until you set a real time or mark the meeting completed/cancelled. Use this
    for pending bookings where someone committed to schedule but hasn't yet.

    \b
    Examples:
      jt meeting add 97 phone_screen scheduled_at=2026-04-06T14:30:00 platform=teams
      jt meeting add 97 technical interviewer="Jane Smith" platform=zoom
      jt meeting add 226 other interviewer="Tiger Senior TBD" platform=google_meet
    """
    client = ctx.obj["client"]
    body = parse_kvs(kvs)
    body["meeting_type"] = meeting_type
    data = client.post(f"/api/tasks/{task_id}/meetings", json=body)
    print_json(data)


@meeting_group.command("ls")
@click.argument("task_id", type=TASK_ID)
@click.pass_context
def ls_cmd(ctx, task_id):
    """List meetings for a task."""
    client = ctx.obj["client"]
    data = client.get(f"/api/tasks/{task_id}/meetings")
    print_json(data)


@meeting_group.command("upcoming")
@click.option("--days", type=int, default=14, help="Window in days from now (default: 14)")
@click.option("--include-past", is_flag=True, help="Include past meetings too")
@click.option("--status", default=None, help="Filter by status: scheduled|completed|cancelled|rescheduled|no_show")
@click.option("--limit", type=int, default=50, help="Max rows (default: 50)")
@click.pass_context
def upcoming_cmd(ctx, days, include_past, status, limit):
    """List upcoming meetings across ALL tasks, sorted by scheduled time.

    \b
    Default: scheduled meetings in the next 14 days across every task in the
    project, PLUS any unscheduled meetings (scheduled_at IS NULL) regardless of
    the --days window. Unscheduled meetings act as a persistent safety net for
    pending/TBD bookings; they stay surfaced until a real time is set or the
    meeting is marked completed/cancelled. Sort order: scheduled ASC, then
    unscheduled (NULLs) pushed to the end. Use this at session start to not
    miss anything, including pending meetings without a confirmed slot.

    \b
    Examples:
      jt meeting upcoming                    # next 14 days + all unscheduled
      jt meeting upcoming --days=3           # next 3 days + all unscheduled
      jt meeting upcoming --days=1           # today + tomorrow + all unscheduled
      jt meeting upcoming --include-past     # also show past scheduled
      jt meeting upcoming --status=scheduled # filter by status (unscheduled still included)
    """
    client = ctx.obj["client"]
    params = {"days": days, "limit": limit}
    if include_past:
        params["include_past"] = "true"
    if status:
        params["status"] = status
    data = client.get("/api/meetings", params=params)
    print_json(data)


@meeting_group.command("next")
@click.pass_context
def next_cmd(ctx):
    """Show only the single closest upcoming meeting across all tasks.

    \b
    Example:
      jt meeting next
    """
    client = ctx.obj["client"]
    data = client.get("/api/meetings", params={"days": 90, "limit": 1})
    print_json(data)


@meeting_group.command("today")
@click.pass_context
def today_cmd(ctx):
    """Show meetings scheduled for today and tomorrow.

    \b
    Example:
      jt meeting today
    """
    client = ctx.obj["client"]
    data = client.get("/api/meetings", params={"days": 1, "limit": 50})
    print_json(data)


@meeting_group.command("up")
@click.argument("task_id", type=TASK_ID)
@click.argument("meeting_id", type=int)
@click.argument("kvs", nargs=-1, required=True)
@click.pass_context
def up_cmd(ctx, task_id, meeting_id, kvs):
    """Update a meeting.

    \b
    Examples:
      jt meeting up 97 1 status=completed result=passed
      jt meeting up 97 1 join_url=https://teams.microsoft.com/...
    """
    client = ctx.obj["client"]
    body = parse_kvs(kvs)
    data = client.put(f"/api/tasks/{task_id}/meetings/{meeting_id}", json=body)
    print_json(data)


@meeting_group.command("done")
@click.argument("task_id", type=TASK_ID)
@click.argument("meeting_id", type=int)
@click.option("--result", default="pending", help="Result: passed|failed|pending|unknown")
@click.pass_context
def done_cmd(ctx, task_id, meeting_id, result):
    """Mark a meeting as completed.

    \b
    Examples:
      jt meeting done 97 1
      jt meeting done 97 1 --result=passed
    """
    client = ctx.obj["client"]
    data = client.put(f"/api/tasks/{task_id}/meetings/{meeting_id}",
                      json={"status": "completed", "result": result})
    print_json(data)


@meeting_group.command("del")
@click.argument("task_id", type=TASK_ID)
@click.argument("meeting_id", type=int)
@click.pass_context
def del_cmd(ctx, task_id, meeting_id):
    """Delete a meeting.

    \b
    Example:
      jt meeting del 97 1
    """
    client = ctx.obj["client"]
    data = client.delete(f"/api/tasks/{task_id}/meetings/{meeting_id}")
    print_json(data)


# --- Cockpit ---


@meeting_group.group("cockpit")
def cockpit_group():
    """Manage cockpit sections for a meeting.

    \b
    Section keys: ANY STRING — open set, not an enum.
    Canonical keys (recommended for standard interviews):
      pitch | rescue_phrases | quick_facts | story_cards | questions | closing | post_call
    Custom keys welcome (e.g. trajectory, map_compass, scenarios, bench_protection,
    scenario_1_clean, market_data_gift — any descriptive snake_case string).

    \b
    Cockpit = live reference screen for during-interview use.
    Canonical sections follow interview flow top-to-bottom:
      pitch          60-sec opening speech (first thing you see = first thing you say)
      rescue_phrases buy-time phrases for blank-outs
      quick_facts    comp, auth, start date, location
      story_cards    experience stories with numbers and trigger phrases
      questions      2-3 smart questions for them
      closing        final line
      post_call      debrief notes (filled after call)

    \b
    Examples:
      jt meeting cockpit ls 97 1
      jt meeting cockpit set 97 1 pitch "I'm a Senior Engineer..."
      jt meeting cockpit set 97 1 rescue_phrases "That's a great question..."
      jt meeting cockpit set 97 1 quick_facts $'Comp: $175K\\nAuth: US Citizen'
      jt meeting cockpit bulk 97 1 sections.json
      jt meeting cockpit get 97 1 pitch
      jt meeting cockpit del 97 1
    """


@cockpit_group.command("ls")
@click.argument("task_id", type=TASK_ID)
@click.argument("meeting_id", type=int)
@click.option("--keys", "keys_only", is_flag=True,
              help="Compact view: show section_keys + content size only, not full JSON.")
@click.pass_context
def cockpit_ls(ctx, task_id, meeting_id, keys_only):
    """List all cockpit sections for a meeting.

    \b
    Examples:
      jt meeting cockpit ls 97 1              # full JSON (all sections + content)
      jt meeting cockpit ls 97 1 --keys       # compact: position | key | chars
    """
    client = ctx.obj["client"]
    data = client.get(f"/api/tasks/{task_id}/meetings/{meeting_id}/cockpit")

    if keys_only:
        if not data:
            click.echo("(no cockpit sections)")
            return
        # Sort by position for stable scan order
        ordered = sorted(data, key=lambda s: s.get("position", 0))
        # Header
        click.echo(f"{'pos':>3}  {'section_key':<24}  {'chars':>6}")
        click.echo(f"{'---':>3}  {'-' * 24}  {'-' * 6}")
        for s in ordered:
            pos = s.get("position", 0)
            key = s.get("section_key", "(unknown)")
            chars = len(s.get("content", "") or "")
            click.echo(f"{pos:>3}  {key:<24}  {chars:>6}")
        click.echo(f"\ntotal: {len(ordered)} sections, "
                   f"{sum(len(s.get('content', '') or '') for s in ordered)} chars")
    else:
        print_json(data)


@cockpit_group.command("get")
@click.argument("task_id", type=TASK_ID)
@click.argument("meeting_id", type=int)
@click.argument("section_key")
@click.pass_context
def cockpit_get(ctx, task_id, meeting_id, section_key):
    """Get a single cockpit section content.

    \b
    Example:
      jt meeting cockpit get 97 1 pitch
    """
    client = ctx.obj["client"]
    data = client.get(f"/api/tasks/{task_id}/meetings/{meeting_id}/cockpit")
    for s in data:
        if s["section_key"] == section_key:
            click.echo(s["content"])
            return
    click.echo(f"Section '{section_key}' not found.", err=True)


@cockpit_group.command("set")
@click.argument("task_id", type=TASK_ID)
@click.argument("meeting_id", type=int)
@click.argument("section_key")
@click.argument("content")
@click.option("--position", "-p", type=int, default=None, help="Display order (0=first, 1=second, etc.)")
@click.pass_context
def cockpit_set(ctx, task_id, meeting_id, section_key, content, position):
    """Set (create or update) a cockpit section.

    \b
    Section keys: any string (e.g. pitch, rescue_phrases, quick_facts, battle_card, tier1_tapan)

    \b
    Examples:
      jt meeting cockpit set 97 1 pitch "I'm a Senior Engineer with ~10 years..."
      jt meeting cockpit set 97 1 quick_facts "$(cat facts.md)" --position=2
      jt meeting cockpit set 97 1 battle_card "..." -p 0
    """
    client = ctx.obj["client"]
    payload = {"content": content}
    if position is not None:
        payload["position"] = position
    data = client.put(
        f"/api/tasks/{task_id}/meetings/{meeting_id}/cockpit/{section_key}",
        json=payload,
    )
    print_json(data)


@cockpit_group.command("bulk")
@click.argument("task_id", type=TASK_ID)
@click.argument("meeting_id", type=int)
@click.argument("json_file", type=click.Path(exists=True))
@click.option("--backup", "backup_path", type=click.Path(),
              help="Write current cockpit state (array format) to PATH before replace. "
                   "Use if existing sections matter — bulk REPLACES, does not merge.")
@click.pass_context
def cockpit_bulk(ctx, task_id, meeting_id, json_file, backup_path):
    """Bulk-set all cockpit sections from a JSON file.

    \b
    Accepts two formats (pick whichever is ergonomic to generate):

    \b
    Format A — array (explicit positions):
      [
        {"section_key": "pitch", "content": "...", "position": 0},
        {"section_key": "rescue_phrases", "content": "...", "position": 1},
        ...
      ]

    \b
    Format B — dict (insertion order = position):
      {
        "pitch": "...",
        "rescue_phrases": "...",
        "quick_facts": "..."
      }

    \b
    Format B also accepts nested {content, position} values:
      {
        "pitch": {"content": "...", "position": 0},
        "rescue_phrases": {"content": "...", "position": 1}
      }

    \b
    Example:
      jt meeting cockpit bulk 97 1 cockpit.json
    """
    client = ctx.obj["client"]

    # Optional backup — fetch current state and dump to file BEFORE replace.
    if backup_path:
        current = client.get(
            f"/api/tasks/{task_id}/meetings/{meeting_id}/cockpit"
        )
        backup_array = [
            {
                "section_key": s["section_key"],
                "content": s["content"],
                "position": s.get("position", 0),
            }
            for s in (current or [])
        ]
        with open(backup_path, "w") as f:
            json_mod.dump(backup_array, f, indent=2)
        click.echo(
            f"Backed up {len(backup_array)} current sections to {backup_path}",
            err=True,
        )

    with open(json_file, "r") as f:
        sections = json_mod.load(f)

    # Accept dict {key: content} or {key: {content, position}} — convert to array.
    if isinstance(sections, dict):
        converted = []
        for idx, (key, val) in enumerate(sections.items()):
            if isinstance(val, str):
                converted.append({
                    "section_key": key,
                    "content": val,
                    "position": idx,
                })
            elif isinstance(val, dict) and "content" in val:
                converted.append({
                    "section_key": key,
                    "content": val["content"],
                    "position": val.get("position", idx),
                })
            else:
                raise click.ClickException(
                    f"Invalid value for section '{key}': expected string "
                    f"or object with 'content' field. Got: {type(val).__name__}"
                )
        sections = converted
    elif not isinstance(sections, list):
        raise click.ClickException(
            f"Expected JSON array or dict at top level. Got: {type(sections).__name__}. "
            f"See 'jt meeting cockpit bulk --help' for accepted formats."
        )

    data = client.put(
        f"/api/tasks/{task_id}/meetings/{meeting_id}/cockpit",
        json=sections,
    )
    print_json(data)


@cockpit_group.command("del")
@click.argument("task_id", type=TASK_ID)
@click.argument("meeting_id", type=int)
@click.argument("section_key", required=False, default=None)
@click.pass_context
def cockpit_del(ctx, task_id, meeting_id, section_key):
    """Delete cockpit section(s) for a meeting.

    \b
    Omit section_key to delete ALL sections.
    Provide section_key to delete just one.

    \b
    Examples:
      jt meeting cockpit del 97 1              # delete all
      jt meeting cockpit del 97 1 mindset      # delete only 'mindset'
    """
    client = ctx.obj["client"]
    if section_key:
        current = client.get(
            f"/api/tasks/{task_id}/meetings/{meeting_id}/cockpit"
        )
        filtered = [
            {"section_key": s["section_key"], "content": s["content"], "position": s.get("position", 0)}
            for s in current
            if s["section_key"] != section_key
        ]
        data = client.put(
            f"/api/tasks/{task_id}/meetings/{meeting_id}/cockpit",
            json=filtered,
        )
    else:
        data = client.put(
            f"/api/tasks/{task_id}/meetings/{meeting_id}/cockpit",
            json=[],
        )
    print_json(data)
