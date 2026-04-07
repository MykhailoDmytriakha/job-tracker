import json as json_mod
import click
from ..output import print_json
from .task import parse_kvs


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
    Per-task CRUD:
      jt meeting add 97 phone_screen scheduled_at=2026-04-06T14:30:00 platform=teams
      jt meeting ls 97
      jt meeting up 97 1 status=completed result=passed
      jt meeting done 97 1 --result=passed
      jt meeting del 97 1

    \b
    Cockpit (live interview reference screen):
      jt meeting cockpit ls 97 1
      jt meeting cockpit set 97 1 pitch "My 60-sec pitch text..."
      jt meeting cockpit set 97 1 rescue_phrases "That's a great question..."
      jt meeting cockpit bulk 97 1 sections.json
    """


@meeting_group.command("add")
@click.argument("task_id", type=int)
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
    Examples:
      jt meeting add 97 phone_screen scheduled_at=2026-04-06T14:30:00 platform=teams
      jt meeting add 97 technical interviewer="Jane Smith" platform=zoom
    """
    client = ctx.obj["client"]
    body = parse_kvs(kvs)
    body["meeting_type"] = meeting_type
    data = client.post(f"/api/tasks/{task_id}/meetings", json=body)
    print_json(data)


@meeting_group.command("ls")
@click.argument("task_id", type=int)
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
    Default: scheduled meetings in the next 14 days across every task in the project.
    Use this at session start to not miss anything.

    \b
    Examples:
      jt meeting upcoming                    # next 14 days
      jt meeting upcoming --days=3           # next 3 days
      jt meeting upcoming --days=1           # today + tomorrow
      jt meeting upcoming --include-past     # also show past scheduled
      jt meeting upcoming --status=scheduled
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
@click.argument("task_id", type=int)
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
@click.argument("task_id", type=int)
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
@click.argument("task_id", type=int)
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
    Section keys: pitch | rescue_phrases | quick_facts | story_cards | questions | closing | post_call

    \b
    Cockpit = live reference screen for during-interview use.
    Sections follow interview flow top-to-bottom:
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
@click.argument("task_id", type=int)
@click.argument("meeting_id", type=int)
@click.pass_context
def cockpit_ls(ctx, task_id, meeting_id):
    """List all cockpit sections for a meeting.

    \b
    Example:
      jt meeting cockpit ls 97 1
    """
    client = ctx.obj["client"]
    data = client.get(f"/api/tasks/{task_id}/meetings/{meeting_id}/cockpit")
    print_json(data)


@cockpit_group.command("get")
@click.argument("task_id", type=int)
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
@click.argument("task_id", type=int)
@click.argument("meeting_id", type=int)
@click.argument("section_key")
@click.argument("content")
@click.pass_context
def cockpit_set(ctx, task_id, meeting_id, section_key, content):
    """Set (create or update) a cockpit section.

    \b
    Section keys: pitch | rescue_phrases | quick_facts | story_cards | questions | closing | post_call

    \b
    Examples:
      jt meeting cockpit set 97 1 pitch "I'm a Senior Engineer with ~10 years..."
      jt meeting cockpit set 97 1 quick_facts "$(cat facts.md)"
      jt meeting cockpit set 97 1 story_cards "$(cat stories.md)"
    """
    client = ctx.obj["client"]
    data = client.put(
        f"/api/tasks/{task_id}/meetings/{meeting_id}/cockpit/{section_key}",
        json={"content": content},
    )
    print_json(data)


@cockpit_group.command("bulk")
@click.argument("task_id", type=int)
@click.argument("meeting_id", type=int)
@click.argument("json_file", type=click.Path(exists=True))
@click.pass_context
def cockpit_bulk(ctx, task_id, meeting_id, json_file):
    """Bulk-set all cockpit sections from a JSON file.

    \b
    JSON format (array):
      [
        {"section_key": "pitch", "content": "...", "position": 0},
        {"section_key": "rescue_phrases", "content": "...", "position": 1},
        {"section_key": "quick_facts", "content": "...", "position": 2},
        {"section_key": "story_cards", "content": "...", "position": 3},
        ...
      ]

    \b
    Example:
      jt meeting cockpit bulk 97 1 cockpit.json
    """
    client = ctx.obj["client"]
    with open(json_file, "r") as f:
        sections = json_mod.load(f)
    data = client.put(
        f"/api/tasks/{task_id}/meetings/{meeting_id}/cockpit",
        json=sections,
    )
    print_json(data)


@cockpit_group.command("del")
@click.argument("task_id", type=int)
@click.argument("meeting_id", type=int)
@click.pass_context
def cockpit_del(ctx, task_id, meeting_id):
    """Delete all cockpit sections for a meeting.

    \b
    Example:
      jt meeting cockpit del 97 1
    """
    client = ctx.obj["client"]
    data = client.put(
        f"/api/tasks/{task_id}/meetings/{meeting_id}/cockpit",
        json=[],
    )
    print_json(data)
