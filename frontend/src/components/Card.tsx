import { useDraggable } from "@dnd-kit/core";
import type { TaskBrief } from "../api";

const priorityColor: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

export function Card({ task }: { task: TaskBrief }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1 }
    : undefined;

  const progress =
    task.subtask_count > 0
      ? `${task.subtask_done}/${task.subtask_count}`
      : null;

  return (
    <div
      ref={setNodeRef}
      className="card"
      style={style}
      {...listeners}
      {...attributes}
    >
      <div className="card-priority" style={{ backgroundColor: priorityColor[task.priority] || "#94a3b8" }} />
      <div className="card-body">
        <div className="card-title">{task.title}</div>
        <div className="card-meta">
          {progress && <span className="card-progress">{progress}</span>}
          {task.follow_up_date && (
            <span className="card-date">
              {new Date(task.follow_up_date).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
