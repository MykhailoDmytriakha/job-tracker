import { tasksApi } from "../api";
import type { TaskBrief } from "../api";

export function TaskItem({
  task,
  selected,
  onSelect,
  onUpdate,
}: {
  task: TaskBrief;
  selected: boolean;
  onSelect: (id: number) => void;
  onUpdate: () => void;
}) {
  async function toggleStatus(e: React.MouseEvent) {
    e.stopPropagation();
    const newStatus = task.status === "done" ? "open" : "done";
    await tasksApi.update(task.id, { status: newStatus } as any);
    onUpdate();
  }

  const isDone = task.status === "done" || task.status === "closed";
  const progress = task.subtask_count > 0 ? `${task.subtask_done}/${task.subtask_count}` : null;

  return (
    <div
      className={`task-item ${isDone ? "task-done" : ""} ${selected ? "task-selected" : ""}`}
      onClick={() => onSelect(task.id)}
    >
      <button className={`task-checkbox ${isDone ? "checked" : ""}`} onClick={toggleStatus}>
        {isDone && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
      <div className="task-content">
        <span className={`task-title ${isDone ? "title-done" : ""}`}>{task.title}</span>
        <div className="task-badges">
          <span className={`badge-priority badge-${task.priority}`}>{task.priority}</span>
          {progress && <span className="badge-progress">{progress}</span>}
          {task.follow_up_date && (
            <span className="badge-date">{new Date(task.follow_up_date).toLocaleDateString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}
