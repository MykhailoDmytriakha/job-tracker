import click
from ..output import print_json


@click.command("log")
@click.option("--since", default=None, help="From date inclusive (YYYY-MM-DD)")
@click.option("--until", default=None, help="To date inclusive (YYYY-MM-DD)")
@click.option("--task", "task_id", type=int, default=None, help="Filter by task ID")
@click.option("--action", default=None, help="Filter by action type (e.g. moved, note_added)")
@click.option("--limit", type=int, default=200, help="Max results (default 200)")
@click.pass_context
def log_cmd(ctx, since, until, task_id, action, limit):
    """Query activity journal. Defaults to today's activities.

    \b
    Examples:
      jt log                                   # today's activities
      jt log --since=2026-03-01                # from March 1st
      jt log --since=2026-03-01 --until=2026-03-31
      jt log --task=180                        # specific task history
      jt log --action=moved                    # all stage transitions
      jt log --action=note_added --since=2026-04-01
    """
    from datetime import date
    client = ctx.obj["client"]

    params = {"limit": limit}
    if since:
        params["since"] = since
    elif not until and not task_id and not action:
        # Default: today
        params["since"] = str(date.today())
        params["until"] = str(date.today())
    if until:
        params["until"] = until
    if task_id is not None:
        params["task_id"] = task_id
    if action:
        params["action"] = action

    data = client.get("/api/activities/", params=params)
    print_json(data)
