import { useDraggable } from "@dnd-kit/core";
import type { TaskBrief } from "../api";

const priorityColor: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

function formatShortDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isOverdue(d: string | null): boolean {
  if (!d) return false;
  return new Date(d).getTime() < Date.now();
}

export function Card({ task }: { task: TaskBrief }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        opacity: isDragging ? 0.4 : 1,
      }
    : undefined;

  const dateStr = task.due_date || task.follow_up_date;
  const overdue = isOverdue(dateStr);
  const isDone = task.status === "done" || task.status === "closed";

  return (
    <div
      ref={setNodeRef}
      className={`card ${task.is_blocked ? "card-blocked" : ""}`}
      style={style}
      {...listeners}
      {...attributes}
    >
      <div className="card-inner">
        <div
          className="card-priority"
          style={{
            backgroundColor:
              priorityColor[task.priority] || "var(--text-faint)",
          }}
        />
        <div className="card-body">
          <div className="card-title">{task.title}</div>
          <div className="card-meta">
            {task.category && (
              <span className="badge badge-category">{task.category}</span>
            )}
            {task.is_blocked && (
              <span className="badge badge-blocked">blocked</span>
            )}
            {task.status === "waiting" && (
              <span className="badge badge-waiting">waiting</span>
            )}
            {task.subtask_count > 0 && (
              <span className="badge badge-progress">
                {task.subtask_done}/{task.subtask_count}
              </span>
            )}
            {dateStr && !isDone && (
              <span
                className={`badge ${overdue ? "badge-overdue" : "badge-date"}`}
              >
                {formatShortDate(dateStr)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
