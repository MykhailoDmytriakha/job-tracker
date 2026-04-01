import click
from ..output import print_json


@click.group("check")
def check_group():
    """Manage checklist items for a task.

    \b
    Examples:
      jt check 180 add "Review JD requirements"
      jt check 180 done 42
      jt check 180 undone 42
      jt check 180 del 42
      jt check 180 ls
    """


@check_group.command("add")
@click.argument("task_id", type=int)
@click.argument("text")
@click.pass_context
def add_cmd(ctx, task_id, text):
    """Add a checklist item."""
    client = ctx.obj["client"]
    data = client.post(f"/api/tasks/{task_id}/checklist", json={"text": text})
    print_json(data)


@check_group.command("done")
@click.argument("task_id", type=int)
@click.argument("item_id", type=int)
@click.pass_context
def done_cmd(ctx, task_id, item_id):
    """Mark checklist item as done."""
    client = ctx.obj["client"]
    data = client.put(f"/api/tasks/{task_id}/checklist/{item_id}", json={"is_done": True})
    print_json(data)


@check_group.command("undone")
@click.argument("task_id", type=int)
@click.argument("item_id", type=int)
@click.pass_context
def undone_cmd(ctx, task_id, item_id):
    """Mark checklist item as not done."""
    client = ctx.obj["client"]
    data = client.put(f"/api/tasks/{task_id}/checklist/{item_id}", json={"is_done": False})
    print_json(data)


@check_group.command("edit")
@click.argument("task_id", type=int)
@click.argument("item_id", type=int)
@click.argument("text")
@click.pass_context
def edit_cmd(ctx, task_id, item_id, text):
    """Edit checklist item text."""
    client = ctx.obj["client"]
    data = client.put(f"/api/tasks/{task_id}/checklist/{item_id}", json={"text": text})
    print_json(data)


@check_group.command("del")
@click.argument("task_id", type=int)
@click.argument("item_id", type=int)
@click.pass_context
def del_cmd(ctx, task_id, item_id):
    """Delete a checklist item."""
    client = ctx.obj["client"]
    data = client.delete(f"/api/tasks/{task_id}/checklist/{item_id}")
    print_json(data)


@check_group.command("ls")
@click.argument("task_id", type=int)
@click.pass_context
def ls_cmd(ctx, task_id):
    """List checklist items for a task (from task detail)."""
    client = ctx.obj["client"]
    task = client.get(f"/api/tasks/{task_id}")
    items = task.get("checklist_items", [])
    print_json(items)


# ---------- Subtask Items ----------

@click.group("sub")
def sub_group():
    """Manage subtask items for a task.

    \b
    Examples:
      jt sub 97 add "Prepare 60-sec pitch"
      jt sub 97 done 15
      jt sub 97 del 15
      jt sub 97 ls
    """


@sub_group.command("add")
@click.argument("task_id", type=int)
@click.argument("title")
@click.option("--desc", "description", default=None, help="Optional description")
@click.pass_context
def sub_add_cmd(ctx, task_id, title, description):
    """Add a subtask item."""
    client = ctx.obj["client"]
    body = {"title": title}
    if description:
        body["description"] = description
    data = client.post(f"/api/tasks/{task_id}/subtask-items", json=body)
    print_json(data)


@sub_group.command("done")
@click.argument("task_id", type=int)
@click.argument("item_id", type=int)
@click.pass_context
def sub_done_cmd(ctx, task_id, item_id):
    """Mark subtask item as done."""
    client = ctx.obj["client"]
    data = client.put(f"/api/tasks/{task_id}/subtask-items/{item_id}", json={"is_done": True})
    print_json(data)


@sub_group.command("undone")
@click.argument("task_id", type=int)
@click.argument("item_id", type=int)
@click.pass_context
def sub_undone_cmd(ctx, task_id, item_id):
    """Mark subtask item as not done."""
    client = ctx.obj["client"]
    data = client.put(f"/api/tasks/{task_id}/subtask-items/{item_id}", json={"is_done": False})
    print_json(data)


@sub_group.command("edit")
@click.argument("task_id", type=int)
@click.argument("item_id", type=int)
@click.argument("title")
@click.pass_context
def sub_edit_cmd(ctx, task_id, item_id, title):
    """Edit subtask item title."""
    client = ctx.obj["client"]
    data = client.put(f"/api/tasks/{task_id}/subtask-items/{item_id}", json={"title": title})
    print_json(data)


@sub_group.command("del")
@click.argument("task_id", type=int)
@click.argument("item_id", type=int)
@click.pass_context
def sub_del_cmd(ctx, task_id, item_id):
    """Delete a subtask item."""
    client = ctx.obj["client"]
    data = client.delete(f"/api/tasks/{task_id}/subtask-items/{item_id}")
    print_json(data)


@sub_group.command("ls")
@click.argument("task_id", type=int)
@click.pass_context
def sub_ls_cmd(ctx, task_id):
    """List subtask items for a task."""
    client = ctx.obj["client"]
    task = client.get(f"/api/tasks/{task_id}")
    items = task.get("subtask_items", [])
    print_json(items)
