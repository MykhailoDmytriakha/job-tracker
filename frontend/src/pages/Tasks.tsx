import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { tasksApi, searchApi } from "../api";
import type { TaskBrief } from "../api";
import { TaskItem } from "../components/TaskItem";
import { TaskDetail } from "../components/TaskDetail";
import { useProject } from "../ProjectContext";

type SortKey = "created" | "updated" | "due_date" | "follow_up" | "priority" | "title";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "created",   label: "Newest"     },
  { key: "updated",   label: "Updated"    },
  { key: "due_date",  label: "Due date"   },
  { key: "follow_up", label: "Follow-up"  },
  { key: "priority",  label: "Priority"   },
  { key: "title",     label: "Title A→Z"  },
];

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortTasks(tasks: TaskBrief[], sortBy: SortKey): TaskBrief[] {
  return [...tasks].sort((a, b) => {
    switch (sortBy) {
      case "created":   return b.id - a.id;
      case "updated": {
        const ta = a.last_activity_at ?? "";
        const tb = b.last_activity_at ?? "";
        return tb.localeCompare(ta);
      }
      case "due_date": {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      }
      case "follow_up": {
        if (!a.follow_up_date && !b.follow_up_date) return 0;
        if (!a.follow_up_date) return 1;
        if (!b.follow_up_date) return -1;
        return a.follow_up_date.localeCompare(b.follow_up_date);
      }
      case "priority": {
        const pa = PRIORITY_ORDER[a.priority] ?? 99;
        const pb = PRIORITY_ORDER[b.priority] ?? 99;
        return pa - pb;
      }
      case "title":
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });
}

const STATUS_FILTERS = ["open", "in_progress", "waiting"];

type SpecialFilter = "overdue" | "blocked" | "recurring" | "pipeline" | "attention" | null;
const SPECIAL_FILTERS: Exclude<SpecialFilter, "pipeline" | null>[] = ["overdue", "attention", "blocked", "recurring"];

function parseFilterParam(filter: string | null): { statusFilter: string | null; specialFilter: SpecialFilter } {
  if (filter === "overdue" || filter === "blocked" || filter === "recurring" || filter === "attention") {
    return { statusFilter: null, specialFilter: filter };
  }
  if (filter === "open" || filter === "waiting" || filter === "in_progress") {
    return { statusFilter: filter, specialFilter: null };
  }
  return { statusFilter: null, specialFilter: null };
}

export function Tasks() {
  const { active: project } = useProject();
  const { taskId } = useParams<{ taskId?: string }>();
  const navigate = useNavigate();
  const selectedId = taskId ? Number(taskId) : null;
  const [tasks, setTasks] = useState<TaskBrief[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchHints, setSearchHints] = useState<Record<string, number>>({});
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize filters from URL param on first render only (lazy init to avoid race condition)
  const [statusFilter, setStatusFilter] = useState<string | null>(() => parseFilterParam(searchParams.get("filter")).statusFilter);
  const [specialFilter, setSpecialFilter] = useState<SpecialFilter>(() => parseFilterParam(searchParams.get("filter")).specialFilter);
  const [sortBy, setSortBy] = useState<SortKey>("created");

  // Sync active filter to URL so it survives page reloads
  useEffect(() => {
    const currentFilter = statusFilter || specialFilter;
    if (currentFilter) {
      if (searchParams.get("filter") !== currentFilter) {
        setSearchParams({ filter: currentFilter }, { replace: true });
      }
    } else if (searchParams.has("filter")) {
      setSearchParams({}, { replace: true });
    }
  }, [statusFilter, specialFilter]);

  // Debounce search input: fire API only after 300ms of no typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Cross-entity search hints (contacts, companies, docs)
  useEffect(() => {
    if (!project || debouncedSearch.length < 2) {
      setSearchHints({});
      return;
    }
    searchApi.search(project.id, debouncedSearch).then((res) => {
      const hints: Record<string, number> = {};
      for (const g of res.groups) {
        if (g.entity_type !== "task" && g.entity_type !== "activity" && g.count > 0) {
          hints[g.entity_type] = g.count;
        }
      }
      setSearchHints(hints);
    }).catch(() => setSearchHints({}));
  }, [debouncedSearch, project]);

  const load = useCallback(() => {
    if (!project) return;
    const params: Record<string, string> = { project_id: String(project.id) };
    if (debouncedSearch.trim()) {
      params.search = debouncedSearch.trim();
    } else {
      params.root_only = "true";
    }
    if (statusFilter) params.status = statusFilter;
    if (specialFilter === "overdue") params.overdue = "true";
    if (specialFilter === "recurring") params.is_recurring = "true";
    if (specialFilter === "pipeline") params.on_board = "true";
    if (specialFilter === "attention") params.attention = "true";
    tasksApi.list(params).then((result) => {
      if (specialFilter === "blocked") {
        setTasks(result.filter((t) => t.is_blocked));
      } else {
        setTasks(result);
      }
    });
  }, [debouncedSearch, statusFilter, specialFilter, project]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !project) return;
    const created = await tasksApi.create({ title: title.trim() } as any, project.id);
    setTitle("");
    setShowCreate(false);
    load();
    navigate(`/tasks/${created.id}`);
  }

  function handleDelete() {
    navigate("/tasks");
    load();
  }

  const active = sortTasks(
    tasks.filter((t) => t.status !== "done" && t.status !== "closed"),
    sortBy
  );
  const done = sortTasks(
    tasks.filter((t) => t.status === "done" || t.status === "closed"),
    sortBy
  );

  return (
    <div className={`tasks-layout ${selectedId ? "has-detail" : ""}`}>
      <div className="tasks-list-panel">
        <div className="tasks-toolbar">
          <div className="tasks-toolbar-row1">
            <div className="search-wrap">
              <input
                className="filter-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks..."
                style={search ? { paddingRight: 30 } : undefined}
              />
              {search && (
                <button className="search-clear" onClick={() => setSearch("")} title="Clear search" aria-label="Clear search">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>
            <button className="new-task-btn" onClick={() => setShowCreate(true)}>
              + New
            </button>
          </div>
          {Object.keys(searchHints).length > 0 && (
            <div className="search-hints">
              Also in:&nbsp;
              {Object.entries(searchHints).map(([type, count], i, arr) => (
                <span key={type}>
                  <span className="search-hint-chip">{count} {type}{count !== 1 ? "s" : ""}</span>
                  {i < arr.length - 1 && " "}
                </span>
              ))}
            </div>
          )}
          <div className="tasks-toolbar-row2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                className={`filter-chip ${statusFilter === s && !specialFilter ? "active" : ""}`}
                onClick={() => { setStatusFilter(statusFilter === s && !specialFilter ? null : s); setSpecialFilter(null); }}
              >
                {s.replace("_", " ")}
              </button>
            ))}
            <div className="toolbar-divider" />
            
            {SPECIAL_FILTERS.map((f) => (
              <button
                key={f}
                className={`filter-chip ${specialFilter === f ? "active" : ""}`}
                onClick={() => { setSpecialFilter(specialFilter === f ? null : f); setStatusFilter(null); }}
              >
                {f}
              </button>
            ))}

            {(statusFilter || (specialFilter && specialFilter !== "pipeline")) && (
              <button className="filter-chip filter-clear" onClick={() => { setStatusFilter(null); setSpecialFilter(null); }}>
                ×
              </button>
            )}
            <div className="toolbar-divider" />
            <button
              className={`filter-chip pipeline-chip ${specialFilter === "pipeline" ? "active" : ""}`}
              onClick={() => { setSpecialFilter(specialFilter === "pipeline" ? null : "pipeline"); setStatusFilter(null); }}
              title="Show only pipeline tasks"
            >
              pipeline
            </button>
            <div className="toolbar-divider" />
            <div className="sort-control">
              <svg className="sort-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 3h8M3 6h6M4 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <select
                className="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="task-form task-form-inline">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              autoFocus
              onKeyDown={(e) => { if (e.key === "Escape") { setShowCreate(false); setTitle(""); } }}
              onBlur={() => { if (!title.trim()) { setShowCreate(false); } }}
            />
            <button type="submit">Add</button>
            <button type="button" className="cancel-btn" onClick={() => { setShowCreate(false); setTitle(""); }}>✕</button>
          </form>
        )}

        <div className="task-list">
          {active.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              selected={t.id === selectedId}
              onSelect={(id) => navigate(`/tasks/${id}`)}
              onUpdate={load}
              onNavigate={(id) => navigate(`/tasks/${id}`)}
            />
          ))}
        </div>

        {done.length > 0 && !statusFilter && (
          <>
            <div className="task-list-divider">Completed ({done.length})</div>
            <div className="task-list">
              {done.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  selected={t.id === selectedId}
                  onSelect={(id) => navigate(`/tasks/${id}`)}
                  onUpdate={load}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {selectedId && (
        <TaskDetail
          taskId={selectedId}
          onClose={() => navigate("/tasks")}
          onDelete={handleDelete}
          onUpdate={load}
          onNavigate={(id) => navigate(`/tasks/${id}`)}
          searchTerm={debouncedSearch}
        />
      )}
    </div>
  );
}
