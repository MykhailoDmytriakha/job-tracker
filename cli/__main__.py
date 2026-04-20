"""Entry point: python -m cli <command> [args]"""

import click
from . import __version__
from . import config as cfg
from .client import JTClient
from .commands.task import (
    get_cmd, ls_cmd, new_cmd, up_cmd, note_cmd, del_cmd,
    link_cmd, unlink_cmd, deps_cmd, chain_cmd, block_cmd, unblock_cmd,
    why_cmd, mv_cmd,
)
from .commands.dash import dash_cmd, board_cmd, health_cmd, stages_cmd
from .commands.search import find_cmd
from .commands.journal import log_cmd
from .commands.entity import contact_group, company_group, doc_group
from .commands.checklist import check_group, sub_group
from .commands.meeting import meeting_group
from .commands.config_cmd import config_group


@click.group()
@click.version_option(__version__, "--version", "-V")
@click.option("--project", "project_id", type=int, default=None,
              help="Project ID (default: from config)")
@click.option("--url", default=None,
              help="API base URL (default: from config)")
@click.pass_context
def cli(ctx, project_id, url):
    """jt — Job Tracker CLI for AI agents.

    \b
    Quick reference:
      jt health                    check API
      jt dash                      dashboard overview
      jt board                     kanban board
      jt ls                        list tasks
      jt ls --attention            tasks needing attention
      jt get <id>                  task detail
      jt new "Title" key=value...  create task
      jt up <id> key=value...      update task
      jt note <id> "text"          add note
      jt link <id> contact <cid>   link entity
      jt log                       today's activity journal
      jt find "query"              global search
      jt contact/company/doc ls    entity lists

    \b
    Task ID formats (any command that takes <id>):
      226                          internal numeric ID
      EJS-225                      display_id (project short_key + sequence_num)
      Both resolve to the same task. Use whichever is handy.

    \b
    Task fields (key=value):
      status          open | in_progress | waiting | done | closed
      priority        high | medium | low
      stage_id        1=FILTERED  3=READY  4=APPLIED  5=OUTREACHED
                      6=WAITING  13=PHONE SCREEN  10=INTERVIEW
                      8=OFFER  9=CLOSED
      pipeline_heat   hot | warm | cold | archived
      outreach_status not_started | searching | contacted | replied
                      | connected | dead_end
      lead_source     job_board | linkedin | referral | direct
                      | cold_outreach
      cadence         daily | weekly | biweekly | monthly
      due_date        ISO date (YYYY-MM-DD)
      follow_up_date  ISO date (YYYY-MM-DD)
      applied_at      ISO date (YYYY-MM-DD)
      posting_url     URL string
      compensation    free text (e.g. "$150k-$180k")
      is_recurring    true | false
      description     free text

    \b
    Null values: pass field=null to clear a field.
    Output:      null fields are omitted from output.
    """
    ctx.ensure_object(dict)
    final_url = url or cfg.get("url")
    final_pid = project_id or cfg.get("project_id")
    final_token = cfg.get("token") or ""
    ctx.obj["client"] = JTClient(final_url, final_pid, token=final_token)


# Task commands (top-level — 80% of usage)
cli.add_command(get_cmd, "get")
cli.add_command(ls_cmd, "ls")
cli.add_command(new_cmd, "new")
cli.add_command(up_cmd, "up")
cli.add_command(note_cmd, "note")
cli.add_command(del_cmd, "del")
cli.add_command(link_cmd, "link")
cli.add_command(unlink_cmd, "unlink")
cli.add_command(deps_cmd, "deps")
cli.add_command(chain_cmd, "chain")
cli.add_command(block_cmd, "block")
cli.add_command(unblock_cmd, "unblock")
cli.add_command(why_cmd, "why")
cli.add_command(mv_cmd, "mv")

# Infrastructure
cli.add_command(dash_cmd, "dash")
cli.add_command(board_cmd, "board")
cli.add_command(health_cmd, "health")
cli.add_command(stages_cmd, "stages")

# Search & journal
cli.add_command(find_cmd, "find")
cli.add_command(log_cmd, "log")

# Entity CRUD subgroups
cli.add_command(contact_group, "contact")
cli.add_command(company_group, "company")
cli.add_command(doc_group, "doc")

# Checklist and subtask items
cli.add_command(check_group, "check")
cli.add_command(sub_group, "sub")

# Meetings
cli.add_command(meeting_group, "meeting")

# Config
cli.add_command(config_group, "config")


if __name__ == "__main__":
    cli()
