# Job Tracker - Vision & Architecture

## Problem

Markdown-based task/memory system grows 100-300 lines/day. As data accumulates:
- Finding specific information requires reading entire files
- Cross-referencing tasks, dependencies, contacts, and timelines is manual
- No query language for filtering, sorting, aggregating
- Agent context window fills up reading large files
- No visual overview of the full pipeline state

## Solution

A database-backed task management system with:
1. **SQLite database** as canonical source of truth (replacing markdown files over time)
2. **Web UI** for human-readable operational view (Tasks list + Pipeline kanban)
3. **REST API** for programmatic access
4. **CLI tool** (future) for AI agent integration

## Guiding Principles

- **Solve own problem first** - build what's immediately useful for Mykhailo's job search and life management
- **Production-grade architecture** - clean code, good patterns, because this could become a product for others
- **Tasks are the universal primitive** - everything is a task. Pipeline stages are groupings of tasks. Subtasks are child tasks. Unlimited nesting depth.
- **Agent prepares, user commits** - the system should support both human and AI agent workflows

## User: Mykhailo's Task System (source data analysis)

### Task Fields (observed from 78+ real tasks)

| Field | Examples | Required |
|-------|---------|----------|
| ID | Sequential: #001, #078 | Yes |
| Title | With cadence prefix for recurring: "Daily...", "Weekly...", "Monitor...", "Track..." | Yes |
| Description | Rich text, sometimes very long (500+ words) | Yes |
| Priority | High / Medium / Low | Yes |
| Category | Financial, Career, Legal, Career/Research, Career/Network, Career/Negotiation, Career/Government, Career/Process, Career/Positioning, Interview Prep, Documentation, Research | Yes |
| Status | Not started, In Progress, Waiting (with context), Completed | Yes |
| Steps | Checklist items within a task, individually checkable | Yes |
| Dependencies | Task X depends on Task Y. Chain: #024 -> #046 -> #047 -> #048 -> #049 | Critical |
| Track | EXPIRES / MULTIPLIES / EXPLORES (from AGENTS.md decision framework) | Nice to have |
| Cadence | For recurring: Daily, Weekly, 2-3x/week, Event-driven | For recurring |
| Latest progress | Free-text log of most recent activity | For recurring |
| Next checkpoint | Date or event trigger | For recurring |
| Contact/person | Who to talk to, who owns the task on the other side | Nice to have |
| Files/artifacts | Links to created research files, scripts, documents | Nice to have |
| Completion date | When task was finished | For completed |
| Completion notes | What was done, what was the outcome | For completed |

### Task Categories (observed)

```
Financial          - severance, PTO, insurance, 401k, budget
Legal              - contracts, clauses, unemployment
Legal/Financial    - overlap (Release Notice, sick days)
Career             - general career actions
Career/Research    - exploring specific lanes (data centers, banking, transportation)
Career/Network     - recommendations, outreach, contacts
Career/Negotiation - HCSC direct hire, meetings, scripts
Career/Government  - WA State, federal, public sector
Career/Process     - pipeline system, operating procedures
Career/Positioning - Solutions Engineer bridge, lane viability
Career/Strategic Fit - assessing new lanes
Interview Prep     - LeetCode, system design, NeetCode
Documentation      - system docs, guides
Research           - general research tasks
```

### Dependency Chains (real examples)

```
#024 (HCSC clearance)
  -> #046 (1-on-1 with MATHI MOHAN)
     -> #047 (1-on-1 with Menuka, optional)
        -> #048 (prepare Dawn meeting script)
           -> #049 (conduct Dawn meeting)

#041 (ask HCSC colleagues for recommendations)
  -> #055 (recommendation matrix)

#056, #057, #058, #059 (individual recommendation outreach)
  -> #060 (track ELEKS recommendation pipeline)
```

### Task Types

1. **One-time tasks** - do once and close (most tasks)
2. **Recurring tasks** - have cadence, latest progress, next checkpoint
   - Daily/Weekly rhythm: #011 (daily pipeline), #039 (NeetCode)
   - Event-driven: #052 (sick days two-touch)
   - Follow-up cadence: #056-#058 (recommendations)
   - Monitoring: #051 (federal IT), #073 (WA State gov)
3. **Completed tasks** - archived with outcome documentation

### Pipeline Stages (current, for job search)

```
INBOX -> TRIAGED -> TO APPLY -> SUBMITTED -> HUMAN LANE -> WAITING -> RESPONSE -> OFFER -> CLOSED
```

## Architecture

### Current Stack
- **Backend:** Python + FastAPI + SQLAlchemy + SQLite
- **Frontend:** React + TypeScript + Vite + dnd-kit
- **Database:** SQLite with WAL

### Data Model Evolution Needed

**Current model supports:** tasks with one level of parent/child, stages, activity log.

**What needs to be added:**

1. **Task dependencies** (blocked_by / blocks relationship table)
2. **Categories** (as a field or tag system)
3. **Richer status** (add "waiting" with optional context string)
4. **Checklist items** (step-level tracking within a task, separate from subtasks)
5. **Recurring task fields** (cadence, next_checkpoint, is_recurring flag)
6. **Unlimited nesting** (already supported by parent_id, but UI needs to handle depth > 1)
7. **Tags/labels** (flexible categorization beyond single category)
8. **Contact references** (optional, link to person name/info)
9. **File/artifact links** (optional, references to external files)

### Access Layers (phased)

```
Phase 1 (now):     Web UI + REST API
Phase 2 (next):    CLI tool with auth (token-based)
Phase 3 (future):  Agent skill / CLAUDE.md instructions for CLI usage
Phase 4 (product): Multi-user, deployment, auth, public access
```

## Roadmap

### Milestone 1: Core Task Management (current focus)
- [ ] Evolve data model: dependencies, categories, richer status, checklist items
- [ ] Migrate real task data from ELEKS markdown files
- [ ] Task list UI: filtering, sorting, dependency visualization
- [ ] Pipeline (kanban) UI: stages with drag-and-drop
- [ ] Nested task support in UI (expand/collapse subtree)

### Milestone 2: CLI & Agent Integration
- [ ] CLI tool: `jt task list`, `jt task create`, `jt task update`, `jt task get`
- [ ] Auth: token-based access for CLI
- [ ] Agent instructions / skill definition

### Milestone 3: Recurring & Automation
- [ ] Recurring task dashboard (cadence, last touched, overdue)
- [ ] Follow-up reminders / overdue indicators
- [ ] Daily/weekly view of what needs attention

### Milestone 4: Projects & Product Polish
- [ ] **Projects** — namespace for tasks (see architecture below)
- [ ] Multi-user support
- [ ] Deployment (cloud hosting)
- [ ] Onboarding flow with starter tasks (see below)
- [ ] Public-facing landing page

### Architecture: Projects (Milestone 4)
Each user can have multiple projects (job searches, career tracks, etc.). A project groups tasks under a short key prefix, like Linear/Jira.

**Data model:**
```
Project:
  id: int (PK)
  name: str           — "ELEKS Job Search 2026"
  short_key: str      — "ELK" (2-5 uppercase letters, unique per user)
  description: str
  pipeline: FK(Stage)  — optional custom stages, or use default
  created_at, updated_at

Task:
  + project_id: FK(Project)   — nullable (backcompat)
  + sequence_num: int          — auto-increment per project
  Display ID = "{short_key}-{sequence_num}" (e.g. ELK-1, ELK-2)
```

**UI changes:**
- Project switcher in sidebar/header
- Task IDs display as `ELK-1` instead of `#1`
- Each project can have its own pipeline stages
- Dashboard scoped to active project
- Global view across all projects (optional)

**Migration path:** Add project_id nullable. Existing tasks get assigned to a default project. New tasks require project selection.

### Architecture: Multi-User (Milestone 4)
Adding users later must NOT require breaking changes. Current prep:

**Data model change:**
```
User:
  id, email, name, created_at

Project:
  + user_id: FK(User)    — owner
```

**What's already safe (no changes needed when adding user_id):**
- Tasks scoped through Project (Task → Project → User). No direct Task.user_id needed.
- Stages are system-wide (shared pipeline). No user scoping needed.
- All task queries already go through project_id.

**What needs a one-line change per endpoint when adding auth:**
- `list_projects()` → filter by `current_user.id`
- `get_task()` → validate `task.project.user_id == current_user.id`
- `dashboard/board` → already accept project_id, just validate ownership

**Auth plan:** Token-based (JWT or session). Middleware extracts current_user. Each endpoint validates ownership through project. No breaking migration — just add user_id FK to projects table + auth middleware.

**Stages:** Remain global (system defaults). Future: optional per-user custom stages.

### Architecture: Contacts (Milestone 3)
A full-fledged contact/people system linked to tasks.

**Data model:**
```
Contact:
  id, project_id, name, email, linkedin_url, company, role, notes
  created_at, updated_at

ContactInteraction:
  id, contact_id, task_id (optional), type (email/linkedin/call/meeting)
  date, summary, direction (inbound/outbound)

task_contacts (many-to-many):
  task_id, contact_id
```

**Features:**
- Contacts page: list, search, view profile
- Contact profile: fields + interaction timeline (messages history)
- Link contacts to tasks ("who is involved")
- From TaskDetail: see linked contacts, add contact, log interaction
- Search across contacts and interactions

**Why defer:** Requires its own page, interactions model, possibly import from LinkedIn/Gmail. Big scope. Categories fix is quick and unblocks real usage now.

### Architecture: File Attachments — PDF/DOCX support (Milestone 3)
Documents currently store markdown text in DB. Need to support binary file attachments (PDF, DOCX) for resumes and other artifacts.

**Approach:**
- Add `Attachment` model: id, document_id (optional), task_id (optional), filename, mime_type, size, storage_path
- Store files on disk (e.g. `data/attachments/{id}/{filename}`)
- API: upload, download, delete
- UI: upload button on Document view and TaskDetail, download link, preview for PDFs
- Resume workflow: markdown = source of truth, "Export to PDF" generates from markdown + CSS template, or user uploads manually crafted PDF

**Resume template engine (future):**
- 2-3 CSS templates for resume rendering (clean, modern, classic)
- Preview before download
- Separation: markdown = content, template = presentation, PDF = output

**Decision (2026-03-31):** Auth deferred until deployment/second user. Reason: single user now, architecture already prepared (user_id on Project = one column), implementing auth now adds friction without value. When ready: email+password + Google OAuth + Apple in one pass.

### Idea: Onboarding Starter Tasks
When a new user creates an account, pre-populate their task list with a typical layoff/job-search action plan as a starting template. Examples:
- Calculate finances (runway, severance, savings)
- Check legal rights (employment contract, non-compete, WARN Act)
- File for unemployment benefits
- Set up job search pipeline (LinkedIn, job boards, filters)
- Update resume and portfolio
- Notify network / request references
- Review health insurance options (COBRA, marketplace)
- Create daily job search routine (recurring task)

This gives the user an immediate "here's what to do" framework instead of a blank screen. Tasks are editable/deletable — it's a starting point, not a prescription. Could be implemented as selectable templates ("Layoff plan", "Career change", "Immigration case", etc.).

## File Structure

```
job-tracker/
  backend/
    main.py            - FastAPI app, CORS, routers
    models.py          - SQLAlchemy ORM models
    schemas.py         - Pydantic request/response schemas
    database.py        - SQLite engine, session factory
    seed.py            - Default stage seeder
    api/
      board.py         - Kanban board endpoint
      tasks.py         - Task CRUD + activity logging
      stages.py        - Stage CRUD + reordering
  frontend/
    src/
      App.tsx          - Router (Pipeline, Tasks pages)
      api.ts           - API client with TypeScript types
      pages/
        Pipeline.tsx   - Kanban board with drag-and-drop
        Tasks.tsx      - Task list + detail panel
      components/
        Column.tsx     - Board column (droppable stage)
        Card.tsx       - Draggable task card
        TaskItem.tsx   - List task item
        TaskDetail.tsx - Full task editor
        ThemeSwitcher.tsx - Theme toggle
  data.db              - SQLite database
  run_dev.sh           - Development launcher
  requirements.txt     - Python dependencies
  VISION.md            - This file
```

## Philosophy (from user)

- **Enforcement over advisory** - dependencies are enforced: cannot close a task if blocker is not done
- **Dates everywhere** - every task should have a date. Waiting = always with a date. System nudges.
- **System forces tracking** - recurring tasks remind user to log progress. Not silent.
- **Activity-heavy** - job search = stream of actions. Quick logging matters.
- **Modern UI** - best practices, pleasant to use, clean design.
- **Start for yourself, build for others** - production-grade architecture from day one.

## Running the App

```bash
./run_dev.sh
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000/api
# Swagger docs: http://localhost:8000/docs
```

## Implementation Status

### Milestone 1: Core Task Management
- [x] Phase 1: Database schema (5 new columns + 2 new tables)
- [x] Phase 2: API validation + new endpoints (dependencies, checklist, filters, dashboard)
- [x] Phase 3: Frontend TypeScript types + API client
- [x] Phase 4: Task Detail with inline editing, checklist, dependencies
- [x] Phase 5: Task List with filters, search, visual indicators
- [x] Phase 6: Kanban cards with category, dates, blocked state
- [x] Phase 7: Dashboard page (stats, overdue, waiting, recurring, recent)
- [x] Phase 8: Modern CSS design system (custom properties, dark mode, animations)

### Milestone 2: CLI & Agent Integration (next)
- [ ] CLI tool
- [ ] Auth
- [ ] Agent instructions

### Milestone 3: Data Migration
- [ ] Migrate ELEKS todo.active.md tasks
- [ ] Migrate todo.recurring.md tasks
- [ ] Migrate todo.completed.md tasks
