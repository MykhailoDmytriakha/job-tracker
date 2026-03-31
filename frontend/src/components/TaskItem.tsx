import { tasksApi, ApiError } from "../api";
import type { TaskBrief } from "../api";
import { showToast } from "./Toast";

function formatShortDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function isOverdue(d: string | null): boolean {
  return !!d && new Date(d).getTime() < Date.now();
}

export function TaskItem({
  task,
  selected,
  onSelect,
  onUpdate,
  onNavigate,
}: {
  task: TaskBrief;
  selected: boolean;
  onSelect: (id: number) => void;
  onUpdate: () => void;
  onNavigate?: (id: number) => void;
}) {
  async function toggleStatus(e: React.MouseEvent) {
    e.stopPropagation();
    const newStatus = task.status === "done" ? "open" : "done";
    try {
      await tasksApi.update(task.id, { status: newStatus } as any);
    } catch (e) {
      if (e instanceof ApiError) {
        try {
          const body = JSON.parse(e.body);
          showToast(body.detail || "Cannot complete this task", "error", onNavigate);
        } catch {
          showToast("Cannot complete this task");
        }
      }
    }
    onUpdate();
  }

  const isDone = task.status === "done" || task.status === "closed";
  const dateStr = task.due_date || task.follow_up_date;
  const overdue = !isDone && isOverdue(dateStr);

  // Progress: separate subtasks vs checklist
  const hasSub = task.subtask_count > 0;
  const hasCl = task.checklist_total > 0;
  const subPct = hasSub ? Math.round((task.subtask_done / task.subtask_count) * 100) : 0;
  const clPct = hasCl ? Math.round((task.checklist_done / task.checklist_total) * 100) : 0;

  // Build status tag: explicit text, not abstract color stripe
  let statusTag: { text: string; className: string; title: string } | null = null;
  if (task.is_blocked) {
    statusTag = { text: "Blocked", className: "status-tag blocked", title: "This task has unresolved dependencies" };
  } else if (!isDone && overdue) {
    statusTag = { text: "Overdue", className: "status-tag overdue", title: "Past due date" };
  } else if (task.status === "waiting") {
    statusTag = { text: "Waiting", className: "status-tag waiting", title: "Waiting for external event" };
  } else if (task.status === "in_progress") {
    statusTag = { text: "In progress", className: "status-tag in-progress", title: "Currently being worked on" };
  }

  return (
    <div
      className={`task-item ${isDone ? "task-done" : ""} ${selected ? "task-selected" : ""}`}
      onClick={() => onSelect(task.id)}
      title={task.title}
    >
      <button
        className={`task-checkbox ${isDone ? "checked" : ""}`}
        onClick={toggleStatus}
        title={isDone ? "Mark as open" : "Mark as done"}
      >
        {isDone ? (
          <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
            <path d="M1 5L4.5 8.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="12" height="10" viewBox="0 0 12 10" fill="none" style={{ opacity: 0 }}>
            <path d="M1 5L4.5 8.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      <div className="task-content">
        <span className={`task-title ${isDone ? "title-done" : ""}`}>
          <span className="task-id">{task.display_id}</span> {task.title}
        </span>
        <div className="task-meta-row">
          {/* Status: explicit readable tag */}
          {statusTag && (
            <span className={statusTag.className} title={statusTag.title}>
              {statusTag.text}
            </span>
          )}
          {/* Priority: only show HIGH (red, urgent). Medium/low = not shown */}
          {task.priority === "high" && (
            <span className="status-tag high-priority" title="High priority">
              High
            </span>
          )}
          {/* Category */}
          {task.category && (
            <span className="task-category" title={`Category: ${task.category}`}>
              {task.category}
            </span>
          )}
          {/* Progress: subtasks (purple) and checklist (green), separate */}
          {hasSub && (
            <span className="progress-pill sub" title={`Subtasks: ${task.subtask_done} of ${task.subtask_count} done`}>
              {task.subtask_done}/{task.subtask_count}
            </span>
          )}
          {hasCl && (
            <span className="progress-pill cl" title={`Checklist: ${task.checklist_done} of ${task.checklist_total} done`}>
              {task.checklist_done}/{task.checklist_total}
            </span>
          )}
          {/* Date */}
          {dateStr && !isDone && (
            <span
              className={`task-date ${overdue ? "overdue" : ""}`}
              title={overdue ? "Overdue!" : `Due: ${new Date(dateStr).toLocaleDateString()}`}
            >
              {formatShortDate(dateStr)}
            </span>
          )}
        </div>
        {/* Mini progress bars: subtasks purple, checklist green */}
        {(hasSub || hasCl) && !isDone && (
          <div className="task-mini-progress">
            {hasSub && (
              <div className="progress-bar" style={{ height: 2 }}>
                <div className="progress-fill sub" style={{ width: `${subPct}%` }} />
              </div>
            )}
            {hasCl && (
              <div className="progress-bar" style={{ height: 2 }}>
                <div className="progress-fill cl" style={{ width: `${clPct}%` }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
