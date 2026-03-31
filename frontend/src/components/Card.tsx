import { useDraggable } from "@dnd-kit/core";
import type { TaskBrief } from "../api";

const priorityColor: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const heatColor: Record<string, string> = {
  hot: "#ef4444",
  warm: "#f59e0b",
  cold: "#3b82f6",
  archived: "#6b7280",
};

import { calculateDaysDiff, isDateOverdue, formatShortDateUTC } from "../utils/date";

function formatShortDate(d: string | null): string {
  if (!d) return "";
  const diffDays = calculateDaysDiff(d);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  return formatShortDateUTC(d);
}

function isOverdue(d: string | null): boolean {
  return isDateOverdue(d);
}

export function Card({ task, onSelect }: { task: TaskBrief; onSelect?: (id: number) => void }) {
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
      style={{ ...style, cursor: onSelect ? "pointer" : undefined }}
      onClick={() => onSelect?.(task.id)}
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
            {task.pipeline_heat && (
              <span className="badge" style={{ color: heatColor[task.pipeline_heat] || "inherit" }}>
                {task.pipeline_heat}
              </span>
            )}
            {task.close_reason && (
              <span className="badge badge-close-reason" title={task.close_reason}>
                {task.close_reason.length > 28 ? task.close_reason.slice(0, 28).trimEnd() + "…" : task.close_reason}
              </span>
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
