import { useState, useEffect } from "react";
import { tasksApi } from "../api";
import type { TaskFull } from "../api";

export function TaskDetail({
  taskId,
  onClose,
  onUpdate,
}: {
  taskId: number;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [task, setTask] = useState<TaskFull | null>(null);

  const load = () => tasksApi.get(taskId).then(setTask);

  useEffect(() => { load(); }, [taskId]);

  async function toggleSubtask(subtaskId: number, currentStatus: string) {
    const newStatus = currentStatus === "done" ? "open" : "done";
    await tasksApi.update(subtaskId, { status: newStatus } as any);
    load();
    onUpdate();
  }

  async function toggleMainStatus() {
    if (!task) return;
    const newStatus = task.status === "done" ? "open" : "done";
    await tasksApi.update(task.id, { status: newStatus } as any);
    load();
    onUpdate();
  }

  if (!task) return <div className="detail-panel"><div className="detail-loading">Loading...</div></div>;

  const isDone = task.status === "done" || task.status === "closed";
  const progress = task.subtask_count > 0
    ? Math.round((task.subtask_done / task.subtask_count) * 100)
    : null;

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <button className="detail-close" onClick={onClose}>&times;</button>
      </div>

      <div className="detail-body">
        {/* Title + status */}
        <div className="detail-title-row">
          <button
            className={`task-checkbox checkbox-lg ${isDone ? "checked" : ""}`}
            onClick={toggleMainStatus}
          >
            {isDone && (
              <svg width="12" height="10" viewBox="0 0 10 8" fill="none">
                <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          <h2 className={isDone ? "title-done" : ""}>{task.title}</h2>
        </div>

        {/* Meta */}
        <div className="detail-meta">
          <span className={`badge-priority badge-${task.priority}`}>{task.priority}</span>
          <span className="detail-meta-item">Status: {task.status}</span>
          <span className="detail-meta-item">Created: {new Date(task.created_at).toLocaleDateString()}</span>
          {task.follow_up_date && (
            <span className="detail-meta-item">Follow-up: {new Date(task.follow_up_date).toLocaleDateString()}</span>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <div className="detail-section">
            <div className="detail-section-label">Description</div>
            <div className="detail-description">{task.description}</div>
          </div>
        )}

        {/* Subtasks */}
        {task.subtasks.length > 0 && (
          <div className="detail-section">
            <div className="detail-section-label">
              Subtasks
              {progress !== null && (
                <span className="detail-progress-text">{task.subtask_done}/{task.subtask_count}</span>
              )}
            </div>

            {progress !== null && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            )}

            <div className="detail-subtasks">
              {task.subtasks.map((s) => {
                const sDone = s.status === "done";
                return (
                  <div key={s.id} className="detail-subtask" onClick={() => toggleSubtask(s.id, s.status)}>
                    <button className={`task-checkbox ${sDone ? "checked" : ""}`}>
                      {sDone && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                    <span className={sDone ? "title-done" : ""}>{s.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Activity */}
        {task.activities.length > 0 && (
          <div className="detail-section">
            <div className="detail-section-label">Activity</div>
            <div className="detail-activities">
              {task.activities.map((a) => (
                <div key={a.id} className="detail-activity">
                  <span className="activity-dot" />
                  <div className="activity-content">
                    <span className="activity-text">{a.detail}</span>
                    <span className="activity-time">{new Date(a.timestamp).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
