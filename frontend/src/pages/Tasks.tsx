import { useEffect, useState } from "react";
import { tasksApi } from "../api";
import type { TaskBrief } from "../api";
import { TaskItem } from "../components/TaskItem";
import { TaskDetail } from "../components/TaskDetail";

export function Tasks() {
  const [tasks, setTasks] = useState<TaskBrief[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");

  const load = () => tasksApi.list({ root_only: "true" }).then(setTasks);

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const created = await tasksApi.create({ title: title.trim() } as any);
    setTitle("");
    load();
    setSelectedId(created.id);
  }

  const active = tasks.filter((t) => t.status !== "done" && t.status !== "closed");
  const done = tasks.filter((t) => t.status === "done" || t.status === "closed");

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

        <div className="task-list">
          {active.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              selected={t.id === selectedId}
              onSelect={setSelectedId}
              onUpdate={load}
            />
          ))}
        </div>

        {done.length > 0 && (
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
          onUpdate={load}
        />
      )}
    </div>
  );
}
