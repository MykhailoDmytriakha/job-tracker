import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { tasksApi } from "../api";
import type { TaskBrief } from "../api";
import { TaskItem } from "../components/TaskItem";
import { TaskDetail } from "../components/TaskDetail";
import { useProject } from "../ProjectContext";

const STATUS_FILTERS = ["open", "in_progress", "waiting"];

export function Tasks() {
  const { active: project } = useProject();
  const [tasks, setTasks] = useState<TaskBrief[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Pick up ?selected= from URL (dashboard click-through)
  useEffect(() => {
    const sel = searchParams.get("selected");
    if (sel) {
      setSelectedId(Number(sel));
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const load = useCallback(() => {
    if (!project) return;
    const params: Record<string, string> = { root_only: "true", project_id: String(project.id) };
    if (search.trim()) params.search = search.trim();
    if (statusFilter) params.status = statusFilter;
    tasksApi.list(params).then(setTasks);
  }, [search, statusFilter, project]);

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
          {statusFilter && (
            <button
              className="filter-chip"
              onClick={() => setStatusFilter(null)}
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
