import click
from ..output import print_json
from .task import parse_kvs


@click.group("meeting")
def meeting_group():
    """Manage meetings for a task.

    \b
    Examples:
      jt meeting add 97 phone_screen scheduled_at=2026-04-06T14:30:00 platform=teams
      jt meeting ls 97
      jt meeting up 97 1 status=completed result=passed
      jt meeting done 97 1 --result=passed
      jt meeting del 97 1
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
