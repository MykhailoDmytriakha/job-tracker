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
- Clicking any dashboard task opens task detail in a modal on the dashboard route (`/?task=ID`)
- The modal keeps a browsing queue in dashboard order: `Today -> Upcoming -> Recurring`
- The modal header shows previous/current/next task IDs so you can move through the queue without closing the popup
- `Left` / `Right` arrow keys switch tasks in-place when focus is not inside an input, textarea, or select
- `Open full page` still navigates to `/tasks/:id`

---

## Docs / Contacts / Companies

- These routes use the same split-view pattern on desktop: list/filter panel on the left, selected entity detail on the right
- On narrow screens, selecting an entity collapses the route into a single detail column and hides the list panel until the user goes `Back`
- Detail headers use the shared library pattern: `Back` navigation on the left, destructive action in the right-side action group
- Document detail stacks title, optional type badge, and `Edit` action above the markdown body instead of forcing all controls into one row
- Contact and Company detail pages reuse the same header shell, then show inline-editable fields and linked entities/notes below

---

## Meetings

- Meetings live inside task detail as a dedicated section
- A meeting can be created first with operational data: type, date/time, platform, interviewer, status, result, join URL, notes, linked brief doc, linked notes doc
- Each meeting card can be expanded to inspect details and related documents
- Cockpit has an explicit lifecycle:
  - Before initialization, the meeting shows `Create cockpit`
  - Creating a cockpit seeds a starter prep workspace and then opens the cockpit page
  - Repeating `Create cockpit` on an already initialized meeting is treated as a no-op; existing cockpit content is preserved
  - After initialization, the action becomes `Open cockpit`
- Expanded meeting detail shows cockpit status so it is clear whether prep space already exists

---

## Meeting Cockpit

Route: `/tasks/:taskId/meeting/:meetingId/cockpit`

- Opens a dedicated full-page cockpit for one meeting
- Header shows back button, company/task context, meeting type, schedule, interviewer, and join link when present
- Header includes a Cockpit-only text size control for section content
- Main body is a two-column cockpit grid with six markdown sections:
  - Ready Answers
  - My Pitch
  - Key Numbers
  - My Questions
  - Closing
  - Post-Call Notes
- Cockpit section rendering normalizes escaped newlines from storage and preserves meaningful line breaks in the rendered text
- The text-size preference affects Cockpit section content in both read mode and edit mode, persists locally per user/browser, and does not resize the surrounding page chrome
- Footer-opened modal viewers inherit the same Cockpit text-size preference, so documents and notes stay visually consistent with the main prep panels
- Clicking a panel header focuses it; other panels collapse to previews
- Each panel supports inline markdown editing
- Edit shortcuts: `Cmd+Enter` saves, `Esc` cancels
- Bottom toolbar stays sticky inside the cockpit, centers its content, and groups related docs, companies, contacts, and links into color-coded clusters
- On iPad/mobile browsers, the bottom toolbar remains fully visible above browser chrome/home indicator via dynamic viewport sizing and bottom safe-area padding
- Footer resources open in a viewport-bounded modal with internal scrolling for long documents; highlighted items use subtle accent emphasis, not a primary CTA look
- Modal navigation preserves the same grouped resource structure as the footer (`Docs / Companies / Contacts`) so the user can switch resources in-place without closing the popup
- When grouped modal navigation is present, the standalone left-side title is hidden to avoid repeating the active item twice
- External footer links such as `Job Description` carry an outbound arrow cue and open outside the popup flow
- Scroll behavior: the cockpit page owns its own vertical scroll inside the app shell, so long meeting prep content remains reachable without breaking the fixed-height layout

---

## Pipeline (Kanban)

Board view with 9 default stages:
INBOX, TRIAGED, TO APPLY, SUBMITTED, HUMAN LANE, WAITING, RESPONSE, OFFER, CLOSED

- Drag-and-drop cards between columns (updates stage_id)
- Cards show: title, priority stripe, category badge, date, blocked indicator
- Blocked cards: reduced opacity (0.45)
- Clicking a card opens task detail in a modal on the pipeline route (`/pipeline?task=ID`)
- The modal header shows previous/current/next task IDs using the current board order: column order first, then card order inside each column
- `Left` / `Right` arrow keys switch cards in-place when focus is not inside an input, textarea, or select

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

## Developer Scripts

- `./run_dev.sh` is the default dev launcher and forwards to `./start_dev.sh`
- `./start_dev.sh` starts backend and frontend in the background, then returns control to the shell immediately
- Startup stores the active ports and process IDs in `.dev-ports.env`
- Startup writes logs to `.dev-logs/backend.log` and `.dev-logs/frontend.log`
- Backend port starts at `8000` and moves upward only if the port is already busy
- Frontend port starts at `5173` and moves upward only if the port is already busy
- Frontend gets `VITE_API_URL` pointing at the chosen backend port
- Backend gets `FRONTEND_URL` matching the chosen frontend port so CORS stays valid
- `./stop_dev.sh` reads `.dev-ports.env`, stops the recorded processes, clears any leftover listeners on those ports, and deletes the state file

---

## Activity Log

Every task has a chronological activity log:
- Auto-logged: created, status_changed, moved (stage), description_updated, category_changed, priority_changed, dependency_added/removed, checklist_added/toggled/removed, subtask_added
- Manual: notes (via "Add a note" input)
- Shown in detail panel, newest first
- Each entry: dot indicator, detail text, timestamp
- Entry text preserves line breaks and wraps long tokens such as URLs/IDs without introducing horizontal scroll in the detail panel or popup

---

## Planned Features (not yet built)

### UI & UX
- [ ] Calendar page (visual calendar view for meetings, due dates, follow-ups)
- [ ] Bulk operations (multi-select + batch status change)
- [ ] Tags/labels (flexible categorization beyond single category)
- [ ] Task reordering within list (manual sort)
- [ ] Keyboard shortcuts (j/k navigate, x toggle, n new task)
- [ ] Undo delete (soft delete with 10s undo window)

### Agent & CLI
- [ ] CLI tool for agent integration (token-based auth)
- [ ] Document chunk editing API (PATCH /api/documents/{id}/replace for targeted text replacement)

### Data & Migration
- [ ] Data migration from ELEKS markdown files (active, recurring, completed)
- [ ] Recurring task reminders (system nudges to log progress)

### Contacts & Documents
- [ ] Contact interaction tracking (ContactInteraction model, interaction history per contact)
- [ ] Resume template engine (2-3 CSS templates for markdown-to-PDF rendering)

### Product (long-term)
- [ ] Projects as namespace (project_id scoping, multi-project support)
- [ ] Multi-user support + auth (JWT/session, per-user stages)
- [ ] Cloud deployment
- [ ] Onboarding starter tasks (templates: "Layoff plan", "Career change", etc.)
- [ ] Public-facing landing page
