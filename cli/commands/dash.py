import click
from ..output import print_json


@click.command("dash")
@click.pass_context
def dash_cmd(ctx):
    """Show dashboard overview: stats, today, upcoming, recurring."""
    client = ctx.obj["client"]
    data = client.get("/api/dashboard/")
    print_json(data)


@click.command("board")
@click.pass_context
def board_cmd(ctx):
    """Show kanban board (pipeline stages with tasks)."""
    client = ctx.obj["client"]
    data = client.get("/api/board/")
    print_json(data)


@click.command("health")
@click.pass_context
def health_cmd(ctx):
    """Check API health."""
    client = ctx.obj["client"]
    data = client.get("/api/health")
    print_json(data)


@click.command("stages")
@click.pass_context
def stages_cmd(ctx):
    """List all pipeline stages."""
    client = ctx.obj["client"]
    data = client.get("/api/stages/")
    print_json(data)
