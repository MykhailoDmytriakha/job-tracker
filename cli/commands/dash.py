import click
from ..output import print_json


@click.command("dash")
@click.pass_context
def dash_cmd(ctx):
    """Show dashboard overview: stats, today, upcoming, recurring.

    \b
    Returns:
      stats      — total_open, waiting, overdue, blocked, recurring, attention
      today      — tasks with due/follow-up today or past (non-recurring)
      upcoming   — tasks with due/follow-up within 7 days
      recurring  — recurring tasks sorted stalest-first

    \b
    Drill-down after dash:
      jt ls --attention        tasks needing attention
      jt ls --overdue          overdue tasks only
      jt why <id>              why a specific task needs attention
    """
    client = ctx.obj["client"]
    data = client.get("/api/dashboard/")
    print_json(data)


@click.command("board")
@click.pass_context
def board_cmd(ctx):
    """Show kanban board (pipeline stages with tasks).

    \b
    Returns columns with stage info and tasks in each stage.
    Stages: FILTERED > READY TO APPLY > APPLIED > OUTREACHED >
            WAITING > PHONE SCREEN > INTERVIEW > OFFER > CLOSED

    \b
    Drill-down:
      jt ls --stage=4          list tasks in APPLIED stage
      jt ls --on-board         all tasks on the board
    """
    client = ctx.obj["client"]
    data = client.get("/api/board/")
    print_json(data)


@click.command("health")
@click.pass_context
def health_cmd(ctx):
    """Check API health. Returns {"status": "ok"} if backend is running.

    \b
    If not running, start with:
      cd /Users/mykhailo/MyProjects/job-tracker && ./run_dev.sh
    """
    client = ctx.obj["client"]
    data = client.get("/api/health")
    print_json(data)


@click.command("stages")
@click.pass_context
def stages_cmd(ctx):
    """List all pipeline stages with IDs.

    \b
    Use stage IDs with:
      jt ls --stage=4          list tasks in a stage
      jt new "Title" stage_id=3   create task in a stage
      jt up <id> stage_id=6       move task to a stage
    """
    client = ctx.obj["client"]
    data = client.get("/api/stages/")
    print_json(data)
