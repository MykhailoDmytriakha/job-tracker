"""Custom Click parameter types for the JT CLI."""

import re
import click


class TaskIdParam(click.ParamType):
    """Accepts either internal numeric ID (226) or display_id format (EJS-225).

    When display_id format is provided, resolves to internal ID via API search.
    """

    name = "task_id"

    def convert(self, value, param, ctx):
        if value is None:
            return None

        value_str = str(value).strip()

        try:
            return int(value_str)
        except (ValueError, TypeError):
            pass

        m = re.match(r'^[A-Za-z]+-(\d+)$', value_str)
        if not m:
            self.fail(
                f"'{value_str}' is not a valid task ID. "
                "Use a number (internal ID) or display_id format (e.g., EJS-225).",
                param, ctx
            )

        if not (ctx and hasattr(ctx, 'obj') and ctx.obj and "client" in ctx.obj):
            self.fail(
                f"Cannot resolve '{value_str}' — API client not available. Use numeric ID instead.",
                param, ctx
            )

        client = ctx.obj["client"]
        data = client.get("/api/tasks/", params={"search": value_str, "brief": "true"})
        items = data if isinstance(data, list) else data.get("items", [])
        seq_num = int(m.group(1))

        for task in items:
            if task.get("sequence_num") == seq_num or task.get("display_id") == value_str:
                return task["id"]

        self.fail(f"Task '{value_str}' not found.", param, ctx)


TASK_ID = TaskIdParam()
