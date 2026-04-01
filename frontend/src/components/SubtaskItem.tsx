import { useState } from "react";
import { tasksApi } from "../api";
import type { SubtaskItem as SubtaskItemType } from "../api";

export function SubtaskItem({
  taskId,
  item,
  onUpdate,
}: {
  taskId: number;
  item: SubtaskItemType;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    await tasksApi.updateSubtaskItem(taskId, item.id, { is_done: !item.is_done });
    onUpdate();
  }

  async function saveTitle(value: string) {
    setEditingTitle(false);
    if (value.trim() && value.trim() !== item.title) {
      await tasksApi.updateSubtaskItem(taskId, item.id, { title: value.trim() });
      onUpdate();
    }
  }

  async function saveDesc(value: string) {
    setEditingDesc(false);
    await tasksApi.updateSubtaskItem(taskId, item.id, { description: value });
    onUpdate();
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    await tasksApi.deleteSubtaskItem(taskId, item.id);
    onUpdate();
  }

  return (
    <div className="subtask-item">
      <div className="subtask-row" onClick={() => setExpanded((v) => !v)}>
        <button
          className={`task-checkbox ${item.is_done ? "checked" : ""}`}
          onClick={toggle}
          title={item.is_done ? "Mark as open" : "Mark as done"}
        >
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className={`subtask-title ${item.is_done ? "title-done" : ""}`}>{item.title}</span>
        {item.description && !expanded && (
          <span className="subtask-has-desc" title="Has description">…</span>
        )}
        <span className="subtask-chevron">{expanded ? "▴" : "▾"}</span>
        <button className="subtask-delete" onClick={handleDelete} title="Delete">&times;</button>
      </div>

      {expanded && (
        <div className="subtask-detail">
          <div className="subtask-field">
            <span className="subtask-field-label">Title</span>
            {editingTitle ? (
              <input
                className="subtask-edit-input"
                defaultValue={item.title}
                autoFocus
                onBlur={(e) => saveTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle((e.target as HTMLInputElement).value);
                  if (e.key === "Escape") setEditingTitle(false);
                }}
              />
            ) : (
              <span className="subtask-field-value" onClick={(e) => { e.stopPropagation(); setEditingTitle(true); }}>
                {item.title}
              </span>
            )}
          </div>
          <div className="subtask-field">
            <span className="subtask-field-label">Description</span>
            {editingDesc ? (
              <textarea
                className="subtask-edit-textarea"
                defaultValue={item.description}
                autoFocus
                onBlur={(e) => saveDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setEditingDesc(false); }}
              />
            ) : (
              <div
                className={`subtask-field-value ${!item.description ? "empty" : ""}`}
                onClick={(e) => { e.stopPropagation(); setEditingDesc(true); }}
              >
                {item.description || "Add description..."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
