"""Single-page comprehensive reference for LLM agents using jt.

Purpose: hit `jt agent-help` once at session start, get full mental model in one
output without multi-level help drilling. Complements but does NOT replace the
standard `jt --help` / `jt <cmd> --help`.
"""

import click


AGENT_HELP_TEXT = r"""jt — Job Tracker CLI for AI agents (single-page reference)
==========================================================

DESIGN PRINCIPLE
  Output is JSON by default. Commands return structured data. Errors come back
  as {"error": ..., "status": ..., "hint": ...} with HTTP-style status codes.
  All commands compose — pipe JSON into python3 / jq for filtering.

ID FORMATS
  Task IDs accept both: internal numeric (226) OR display_id (EJS-225).
  Contact / Company / Document / Meeting use internal numeric IDs only.

  Meetings have TWO numbers: global `id` (unique across all tasks) AND `position`
  (index within one task). Meeting commands use global `id` as MEETING_ID arg.

FLAG CONVENTIONS
  Task/entity `up` commands use KVS pairs, NOT --flags:
    jt up 226 status=in_progress priority=high
    jt meeting up EJS-225 13 scheduled_at=2026-04-21T16:00:00Z

  Some commands use --flags (Click idiom) for discovery/listing:
    jt ls --attention
    jt meeting upcoming --days=3
    jt contact ls --company=Tiger

  Rule: mutations = KVS, filters = --flag. When in doubt, run `--help`.

  Null clearing: pass `field=null` to clear a field. Null fields omitted from
  output.

COMMAND TREE
  jt health                          check API alive
  jt dash                            dashboard overview
  jt board                           kanban board
  jt stages                          list pipeline stages + ids

  # Task CRUD (top-level, 80% of usage)
  jt ls                              list tasks (filters: --attention, --stage, --status)
  jt ls --attention                  tasks needing attention (surfaced via why)
  jt get <id>                        full task detail with notes + activities
  jt new "Title" key=value...        create task
  jt up <id> key=value...            update task fields
  jt note <id> "text"                add note (free text)
  jt why <id>                        explain why task needs attention
  jt mv <id> <stage_id>              move to stage
  jt del <id>                        delete task (soft)

  # Linking
  jt link <id> contact <cid>         link entity to task
  jt unlink <id> contact <cid>       unlink
  jt deps <id>                       dependency tree
  jt chain <id>                      blocking chain
  jt block <id> --by <other_id>      mark blocked
  jt unblock <id>                    clear block

  # Search
  jt find "query"                    global search across tasks/contacts/companies/docs

  # Journal / activity
  jt log                             today's activity journal

  # Entities (subgroups)
  jt contact ls | get | new | up | link
  jt company ls | get | new | up | link
  jt doc     ls | get | new | up | del

  # Checklists + subtasks
  jt check add <id> "item"           add checklist item on task
  jt check toggle <id> <item_id>     mark done
  jt sub add <id> "Subtask title"    add subtask

  # Meetings (per-task CRUD + cross-task aggregate)
  jt meeting upcoming [--days=N]     cross-task, all upcoming
  jt meeting today                   today + tomorrow
  jt meeting next                    closest single meeting
  jt meeting ls <task_id>            meetings on one task
  jt meeting add <task_id> <type> key=value...
  jt meeting up <task_id> <mid> key=value...
  jt meeting done <task_id> <mid> --result=passed
  jt meeting del <task_id> <mid>

  # Cockpit (live interview reference screen)
  jt meeting cockpit ls <task_id> <mid>                  # full JSON
  jt meeting cockpit ls <task_id> <mid> --keys           # compact: pos | key | chars
  jt meeting cockpit get <task_id> <mid> <section_key>
  jt meeting cockpit set <task_id> <mid> <section_key> "content" [--position N]
  jt meeting cockpit bulk <task_id> <mid> sections.json
  jt meeting cockpit bulk <task_id> <mid> new.json --backup old.json   # safety
  jt meeting cockpit del <task_id> <mid> [section_key]

  # Config
  jt config get|set|ls

FIELD FORMATS (key=value for `up` / `new` / `add`)
  status          open | in_progress | waiting | done | closed
  priority        high | medium | low
  stage_id        1=FILTERED  3=READY  4=APPLIED  5=OUTREACHED
                  6=WAITING  13=PHONE SCREEN  10=INTERVIEW
                  8=OFFER  9=CLOSED
  pipeline_heat   hot | warm | cold | archived
  outreach_status not_started | searching | contacted | replied
                  | connected | dead_end
  lead_source     job_board | linkedin | referral | direct | cold_outreach
  cadence         daily | weekly | biweekly | monthly
  due_date        ISO date (YYYY-MM-DD) or null
  follow_up_date  ISO date (YYYY-MM-DD) or null
  applied_at      ISO date (YYYY-MM-DD) or null
  scheduled_at    ISO datetime Z (e.g. 2026-04-21T16:00:00Z) or null
  posting_url     URL string
  compensation    free text (e.g. "$150k-$180k")
  is_recurring    true | false
  description     free text (supports markdown)

MEETING TYPES (for `jt meeting add`)
  phone_screen | technical | behavioral | onsite | panel | offer | other

COCKPIT SECTION KEYS
  Open set — any descriptive snake_case string. Canonical keys (recommended for
  standard interviews): pitch | rescue_phrases | quick_facts | story_cards |
  questions | closing | post_call. Custom keys encouraged for complex situations
  (e.g. trajectory, map_compass, scenarios, market_data_gift, bench_protection,
  scenario_1_clean, deflection_patterns).

  Bulk upload accepts TWO JSON formats:
    Format A (array, explicit positions):
      [{"section_key": "pitch", "content": "...", "position": 0}, ...]
    Format B (dict, insertion order = position):
      {"pitch": "...", "rescue_phrases": "...", "quick_facts": "..."}
    Format B nested (explicit positions via object values):
      {"pitch": {"content": "...", "position": 0}, ...}

COMMON PATTERNS

  Full context on a task:
    jt get EJS-225                     # task core + notes + activities
    jt contact ls --task=EJS-225       # linked contacts
    jt meeting ls EJS-225              # linked meetings with cockpits

  Fix meeting time:
    jt meeting up EJS-225 <mid> scheduled_at=2026-04-21T16:00:00Z

  Close a task cleanly:
    jt up EJS-225 status=closed stage_id=9 pipeline_heat=archived
    jt note EJS-225 "[YYYY-MM-DD] Closed. Reason: ..."

  Update description (always `get` first, never blind overwrite):
    jt get EJS-225 | jq .description  # inspect current
    jt up EJS-225 description="..."    # overwrite

GOTCHAS

  1. Task `up` with description OVERWRITES — no append. Read current, edit,
     write back. Agent protocol: get → inspect → modify relevant section only.

  2. `jt meeting cockpit del` without a section_key deletes ALL sections. To
     delete one, pass the key: `jt meeting cockpit del 97 1 pitch`.

  2b. `jt meeting cockpit bulk` REPLACES all sections — it does NOT merge.
      Uploading 2 sections when 10 exist leaves only the 2 new ones. To add
      sections without wiping existing: use `jt meeting cockpit set` one-by-one,
      OR first `jt meeting cockpit ls`, merge new into current, then bulk.
      Safer: pass `--backup PATH` to bulk — it snapshots current state to PATH
      (array format, ready for re-upload) BEFORE replace. Recommended default
      for any bulk op when existing content matters.

  3. Large list outputs (`jt meeting ls EJS-225` with many meetings + cockpits)
     may be 30KB+. Prefer `jt meeting ls <id> | python3 -c "import json..."`
     for summary view. Or filter first with `jt get` / direct SQL if needed.

  4. `jt find` searches across all entity types. Use `--type=task` / `--type=contact`
     to narrow.

  5. Notes on tasks are append-only via `jt note`. Do NOT try to edit notes via
     description update — they live in a separate table.

  6. Meeting scheduled_at must be UTC Z format. Convert PDT: subtract 7h (PST
     summer, April) or 8h (PST winter). E.g. 9 AM PDT = 16:00:00 UTC.

  7. `jt meeting up` positional args: TASK_ID MEETING_ID, then KVS. Meeting ID
     is GLOBAL numeric, not position-within-task.

AGENT WORKFLOW RECOMMENDATIONS

  Session start:
    jt health
    jt dash                    # stats + today + attention
    jt meeting upcoming --days=3

  Task investigation:
    jt get <id>                # full card
    jt find "<entity_name>"    # related entities

  Before modifying:
    jt get <id>                # snapshot current state
    # make change
    jt note <id> "[YYYY-MM-DD HH:MM] Updated X from Y to Z. Reason: ..."

  After any destructive/external-facing action:
    jt note <id> "[date] Action: ..."  # preserve audit trail

VERSION: 0.1.0
"""


@click.command("agent-help")
def agent_help_cmd():
    """Single-page comprehensive reference for LLM agents.

    \b
    Dense one-shot reference. Read once at session start to internalize full
    command tree, field formats, canonical patterns, and known gotchas.
    Complements (does not replace) standard `jt --help` / `jt <cmd> --help`.

    \b
    Example:
      jt agent-help
      jt agent-help | grep -i cockpit   # filter to specific topic
    """
    click.echo(AGENT_HELP_TEXT)
