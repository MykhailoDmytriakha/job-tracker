import click
from .. import config as cfg


@click.group("config")
def config_group():
    """Manage CLI configuration.

    \b
    Config stored in ~/.config/jt/config.json
    Environment variables (JT_BASE_URL, JT_PROJECT_ID, JT_TOKEN) override file.

    \b
    Examples:
      jt config ls
      jt config set token jt_abc123...
      jt config set url https://job-search-pipeline.vercel.app
      jt config get url
    """


@config_group.command("ls")
def config_ls():
    """Show all configuration values."""
    for key, val in cfg.get_all().items():
        click.echo(f"  {key:12s}  {val}")


@config_group.command("set")
@click.argument("key")
@click.argument("value")
def config_set(key, value):
    """Set a configuration value.

    \b
    Keys: url, project_id, token
    """
    valid_keys = {"url", "project_id", "token"}
    if key not in valid_keys:
        click.echo(f"Unknown key '{key}'. Valid: {', '.join(sorted(valid_keys))}", err=True)
        raise SystemExit(1)
    cfg.set_value(key, value)
    display = value
    if key == "token":
        display = value[:10] + "..." if len(value) > 10 else value
    click.echo(f"  {key} = {display}")


@config_group.command("get")
@click.argument("key")
def config_get(key):
    """Get a configuration value."""
    val = cfg.get(key)
    if val is None:
        click.echo(f"Unknown key '{key}'", err=True)
        raise SystemExit(1)
    if key == "token" and val:
        val = val[:10] + "..." + val[-4:] if len(val) > 14 else "***"
    click.echo(val)
