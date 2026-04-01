"""Generic CRUD for contacts, companies, and documents.

Factory pattern: make_entity_group() generates a Click command group
with ls / get / new / up / del commands for each entity type.
This avoids writing the same 5 commands × 3 entity types = 15 commands.
"""

import click
from ..output import print_json


def _parse_kvs(kvs: tuple) -> dict:
    """Parse ('name=Dawn', 'role=Recruiter') into a dict."""
    result = {}
    for kv in kvs:
        if "=" not in kv:
            raise click.UsageError(
                f"Invalid argument '{kv}'. Expected key=value format."
            )
        key, _, value = kv.partition("=")
        result[key.strip()] = value.strip() if value.lower() not in ("null", "none") else None
    return result


def make_entity_group(
    name: str,
    api_prefix: str,
    task_link_path: str,
    task_link_body_key: str,
) -> click.Group:
    """
    Generate a Click command group for an entity type.

    Args:
        name: Entity name for help text (e.g. "contact")
        api_prefix: API path prefix (e.g. "/api/contacts")
        task_link_path: Path suffix on tasks for linking (e.g. "contacts")
        task_link_body_key: Body key when linking to task (e.g. "contact_id")
    """

    @click.group(name, help=f"Manage {name}s (ls / get / new / up / del).")
    def group():
        pass

    # -- ls --
    @group.command("ls", help=f"List {name}s.")
    @click.option("--search", "q", default=None, help="Search query")
    @click.pass_context
    def ls_cmd(ctx, q):
        client = ctx.obj["client"]
        params = {}
        if q:
            params["q"] = q
        data = client.get(f"{api_prefix}/", params=params)
        print_json(data)

    # -- get --
    @group.command("get", help=f"Get full {name} detail.")
    @click.argument("entity_id", type=int)
    @click.pass_context
    def get_cmd(ctx, entity_id):
        client = ctx.obj["client"]
        data = client.get(f"{api_prefix}/{entity_id}")
        print_json(data)

    # -- new --
    new_examples = (
        f"Examples:\n"
        f"  jt {name} new name=\"John Smith\" role=\"Recruiter\"\n"
        f"  jt {name} new name=\"HCSC\" domain=\"healthcare\" --link-task=180"
    )

    @group.command("new", help=f"Create a new {name}. Fields via key=value pairs.", epilog=new_examples)
    @click.argument("kvs", nargs=-1, required=True)
    @click.option("--link-task", type=int, default=None, help="Link to task by ID")
    @click.pass_context
    def new_cmd(ctx, kvs, link_task):
        client = ctx.obj["client"]
        body = _parse_kvs(kvs)
        entity = client.post(f"{api_prefix}/", json=body)
        entity_id = entity["id"]

        if link_task:
            client.post(
                f"/api/tasks/{link_task}/{task_link_path}",
                json={task_link_body_key: entity_id},
            )
            entity = client.get(f"{api_prefix}/{entity_id}")

        print_json(entity)

    # -- up --
    up_example = f"Example:\n  jt {name} up 31 email=\"john@example.com\" notes=\"Met at conference\""

    @group.command("up", help=f"Update {name} fields.", epilog=up_example)
    @click.argument("entity_id", type=int)
    @click.argument("kvs", nargs=-1, required=True)
    @click.pass_context
    def up_cmd(ctx, entity_id, kvs):
        client = ctx.obj["client"]
        body = _parse_kvs(kvs)
        data = client.put(f"{api_prefix}/{entity_id}", json=body)
        print_json(data)

    # -- del --
    @group.command("del", help=f"Delete a {name}.")
    @click.argument("entity_id", type=int)
    @click.pass_context
    def del_cmd(ctx, entity_id):
        client = ctx.obj["client"]
        data = client.delete(f"{api_prefix}/{entity_id}")
        print_json(data)

    return group


# Instantiate the three entity groups
contact_group = make_entity_group(
    name="contact",
    api_prefix="/api/contacts",
    task_link_path="contacts",
    task_link_body_key="contact_id",
)

company_group = make_entity_group(
    name="company",
    api_prefix="/api/companies",
    task_link_path="companies",
    task_link_body_key="company_id",
)

doc_group = make_entity_group(
    name="doc",
    api_prefix="/api/documents",
    task_link_path="documents",
    task_link_body_key="document_id",
)
