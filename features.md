# Features

How each feature works. Spec for current state + planned behavior.

---

## Task CRUD

### Create
- Input field at top of Tasks page, press Enter or click Add
- Creates task with status "open", priority "medium"
- Auto-selects the new task in detail panel
- Logs "created" activity

### Read
- Task list: shows active tasks, then completed section (collapsed by default when filter active)
- Detail panel: opens on click, shows all fields, checklist, dependencies, subtasks, activity
- Dashboard: shows aggregated views (overdue, waiting, recurring, recent)

### Update
- All fields editable inline in detail panel (click to edit, blur/Enter to save)
- Status changes enforce rules:
  - "waiting" requires follow_up_date (422 if missing)
  - "done"/"closed" blocked if unresolved dependencies exist (409 with details)
- Every change logged as activity

### Delete
- Red "Delete" button visible in detail panel header
- **Confirmation required:** browser confirm dialog before deletion
- Cascades: deletes activities, checklist items, clears dependencies, deletes subtasks
- After delete: detail panel closes, task list refreshes

---

## Statuses

| Status | Meaning | Visual | Rules |
|--------|---------|--------|-------|
| open | Default, actionable | No special indicator | - |
| in_progress | Actively working on it | No special indicator | - |
| waiting | Blocked on external event | Orange left border | MUST have follow_up_date |
| done | Completed | Checkbox filled, text strikethrough, faded | Cannot set if unresolved dependencies |
| closed | Completed (alternative) | Same as done | Cannot set if unresolved dependencies |

---

## Priority

| Level | Visual |
|-------|--------|
| high | Red badge, red left stripe on kanban card |
| medium | Orange badge, orange stripe |
| low | Green badge, green stripe |

---

## Categories

Free-text field. Preset options in dropdown:
Financial, Legal, Career, Career/Research, Career/Network, Career/Negotiation, Career/Government, Career/Process, Interview Prep, Documentation, Research

Shown as blue badge on task items and kanban cards.

---

## Dependencies (chain of dependency)

### How they work
- Task A "blocked by" Task B = A cannot be closed until B is done
- Task B "blocks" Task A = informational (shown on B's detail)
- **Enforced:** API returns 409 if trying to close a task with unresolved blockers
- **Circular prevention:** API returns 400 if adding dependency would create a cycle (BFS check)

### Visual
- Detail panel: "Blocked by" section with left color stripe per dependency
  - Orange stripe = dependency not resolved (blocker is open/in_progress/waiting)
  - Green stripe = dependency resolved (blocker is done/closed), item faded
- "Blocks" section: read-only, shows what tasks depend on this one
- Blocked banner: prominent orange banner at top of detail panel when task is blocked
- Task list: blocked tasks have grey left border + reduced opacity
- Kanban: blocked cards have reduced opacity

### Adding dependencies
- Search input at bottom of Dependencies section
- Type to search tasks by title (debounced 250ms)
- Click result to add dependency
- Cannot add: self-dependency, already existing, circular

### Removing dependencies
- X button appears on hover for each "Blocked by" item
- Removes the dependency, refreshes view

---

## Checklist

Steps within a task. Separate from subtasks (subtasks are full tasks, checklist items are lightweight).

- Add: input at bottom of Checklist section, press Enter
- Toggle: click checkbox to mark done/undone
- Delete: X button on hover
- Progress: shown as fraction (3/5) next to section label + progress bar
- Activity logged on every add/toggle/remove

---

## Subtasks

Full tasks nested under a parent task.

- Add: input at bottom of Subtasks section, press Enter
- Toggle: click to toggle done/open
- Progress: shown as fraction + progress bar
- Subtasks inherit no properties from parent (independent status, priority, etc.)
- Deleting parent cascades to subtasks

---

## Dashboard

Default page ("/"). One-glance overview.

### Stat cards (top row, 5 cards)
- Open Tasks: total count of non-done/closed root tasks
- Overdue: tasks with due_date or follow_up_date in the past, not done/closed
- Waiting: tasks with status "waiting"
- Blocked: tasks with unresolved dependencies
- Recurring: tasks with is_recurring=true

### Sections
1. **Needs Attention** - overdue tasks, sorted by most overdue first
2. **Waiting** - waiting tasks, sorted by follow_up_date ascending (soonest first)
3. **Recurring** - recurring tasks, sorted by next_checkpoint ascending
4. **Recently Updated** - last 10 tasks by updated_at

### Click behavior
- Clicking any task navigates to `/tasks?selected=ID`
- Tasks page reads URL param and opens detail panel for that task

---

## Pipeline (Kanban)

Board view with 9 default stages:
INBOX, TRIAGED, TO APPLY, SUBMITTED, HUMAN LANE, WAITING, RESPONSE, OFFER, CLOSED

- Drag-and-drop cards between columns (updates stage_id)
- Cards show: title, priority stripe, category badge, date, blocked indicator
- Blocked cards: reduced opacity (0.45)

---

## Filters (Tasks page)

- **Search:** text search on title (debounced via useEffect re-fetch)
- **Status chips:** open, in_progress, waiting (click to toggle, click again to clear)
- **Clear:** italic "clear" chip when filter active
- Completed section hidden when status filter is active

---

## Recurring Tasks

- `is_recurring` flag on task
- `cadence` field: "daily", "weekly", "2-3x/week", "event-driven"
- `next_checkpoint` field: when next review/action is due
- Shown in Dashboard "Recurring" section
- Detail panel shows cadence + next checkpoint fields when is_recurring=true

---

## Theme

Three options: Light, Dark, System (auto)
- Persisted in localStorage
- Applied via `data-theme` attribute on `<html>`
- All colors use CSS custom properties
- Dark mode: tested, all components work

---

## Activity Log

Every task has a chronological activity log:
- Auto-logged: created, status_changed, moved (stage), description_updated, category_changed, priority_changed, dependency_added/removed, checklist_added/toggled/removed, subtask_added
- Manual: notes (via "Add a note" input)
- Shown in detail panel, newest first
- Each entry: dot indicator, detail text, timestamp

---

## Planned Features (not yet built)

- [ ] CLI tool for agent integration (token-based auth)
- [ ] Data migration from ELEKS markdown files
- [ ] Recurring task reminders (system nudges to log progress)
- [ ] Bulk operations (multi-select + batch status change)
- [ ] Tags/labels (flexible categorization beyond single category)
- [ ] Task reordering within list (manual sort)
- [ ] Keyboard shortcuts (j/k navigate, x toggle, n new task)
- [ ] Undo delete (soft delete with 10s undo window)
