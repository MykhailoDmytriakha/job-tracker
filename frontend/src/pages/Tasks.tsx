import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { tasksApi } from "../api";
import type { TaskBrief } from "../api";
import { TaskItem } from "../components/TaskItem";
import { TaskDetail } from "../components/TaskDetail";
import { useProject } from "../ProjectContext";

const STATUS_FILTERS = ["open", "in_progress", "waiting"];

type SpecialFilter = "overdue" | "blocked" | "recurring" | null;

export function Tasks() {
  const { active: project } = useProject();
  const [tasks, setTasks] = useState<TaskBrief[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [specialFilter, setSpecialFilter] = useState<SpecialFilter>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Pick up ?selected= or ?filter= from URL (dashboard click-through)
  useEffect(() => {
    const sel = searchParams.get("selected");
    const filter = searchParams.get("filter");
    if (sel) {
      setSelectedId(Number(sel));
    }
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
    }
    if (sel || filter) {
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
    load();
    setSelectedId(created.id);
  }

  function handleDelete(id: number) {
    if (selectedId === id) setSelectedId(null);
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
        <form onSubmit={handleCreate} className="task-form">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New task..."
            autoFocus
          />
          <button type="submit">Add</button>
        </form>

        <div className="filter-bar">
          <input
            className="filter-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
          />
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              className={`filter-chip ${statusFilter === s ? "active" : ""}`}
              onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            >
              {s.replace("_", " ")}
            </button>
          ))}
          {specialFilter && (
            <button
              className={`filter-chip active`}
              onClick={() => setSpecialFilter(null)}
            >
              {specialFilter}
            </button>
          )}
          {(statusFilter || specialFilter) && (
            <button
              className="filter-chip"
              onClick={() => { setStatusFilter(null); setSpecialFilter(null); }}
              style={{ fontStyle: "italic" }}
            >
              clear
            </button>
          )}
        </div>

        <div className="task-list">
          {active.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              selected={t.id === selectedId}
              onSelect={setSelectedId}
              onUpdate={load}
              onNavigate={setSelectedId}
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
                  onSelect={setSelectedId}
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
          onClose={() => setSelectedId(null)}
          onDelete={() => handleDelete(selectedId!)}
          onUpdate={load}
          onNavigate={setSelectedId}
        />
      )}
    </div>
  );
}
