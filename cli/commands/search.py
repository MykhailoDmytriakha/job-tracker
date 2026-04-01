import click
from ..output import print_json


@click.command("find")
@click.argument("query")
@click.pass_context
def find_cmd(ctx, query):
    """Global search across tasks, contacts, companies, documents, activities.

    \b
    Examples:
      jt find "GE HealthCare"
      jt find "HCSC"
      jt find "ARO migration"
    """
    client = ctx.obj["client"]
    data = client.get("/api/search/", params={"q": query})
    print_json(data)
