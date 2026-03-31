import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { tasksApi } from "../api";
import type { TaskBrief } from "../api";
import { TaskItem } from "../components/TaskItem";
import { TaskDetail } from "../components/TaskDetail";
import { useProject } from "../ProjectContext";

const STATUS_FILTERS = ["open", "in_progress", "waiting"];

type SpecialFilter = "overdue" | "blocked" | "recurring" | "pipeline" | null;

export function Tasks() {
  const { active: project } = useProject();
  const { taskId } = useParams<{ taskId?: string }>();
  const navigate = useNavigate();
  const selectedId = taskId ? Number(taskId) : null;
  const [tasks, setTasks] = useState<TaskBrief[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [specialFilter, setSpecialFilter] = useState<SpecialFilter>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Pick up ?filter= from URL (dashboard click-through)
  useEffect(() => {
    const filter = searchParams.get("filter");
    if (filter) {
      if (filter === "overdue" || filter === "blocked" || filter === "recurring") {
        setSpecialFilter(filter);
        setStatusFilter(null);
      } else if (filter === "open") {
        setStatusFilter("open");
        setSpecialFilter(null);
      } else if (filter === "waiting") {
        setStatusFilter("waiting");
        setSpecialFilter(null);
      }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const load = useCallback(() => {
    if (!project) return;
    const params: Record<string, string> = { root_only: "true", project_id: String(project.id) };
    if (search.trim()) params.search = search.trim();
    if (statusFilter) params.status = statusFilter;
    if (specialFilter === "overdue") params.overdue = "true";
    if (specialFilter === "recurring") params.is_recurring = "true";
    if (specialFilter === "pipeline") params.on_board = "true";
    tasksApi.list(params).then((result) => {
      if (specialFilter === "blocked") {
        setTasks(result.filter((t) => t.is_blocked));
      } else {
        setTasks(result);
      }
    });
  }, [search, statusFilter, specialFilter, project]);

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

  const active = tasks.filter(
    (t) => t.status !== "done" && t.status !== "closed"
  );
  const done = tasks.filter(
    (t) => t.status === "done" || t.status === "closed"
  );

  return (
    <div className={`tasks-layout ${selectedId ? "has-detail" : ""}`}>
      <div className="tasks-list-panel">
        <div className="tasks-toolbar">
          <div className="tasks-toolbar-row1">
            <input
              className="filter-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
            />
            <button className="new-task-btn" onClick={() => setShowCreate(true)}>
              + New
            </button>
          </div>
          <div className="tasks-toolbar-row2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                className={`filter-chip ${statusFilter === s ? "active" : ""}`}
                onClick={() => { setStatusFilter(statusFilter === s ? null : s); setSpecialFilter(null); }}
              >
                {s.replace("_", " ")}
              </button>
            ))}
            {specialFilter && specialFilter !== "pipeline" && (
              <button className="filter-chip active" onClick={() => setSpecialFilter(null)}>
                {specialFilter}
              </button>
            )}
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
        />
      )}
    </div>
  );
}
