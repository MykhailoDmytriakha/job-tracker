import { useState } from "react";
import { tasksApi } from "../api";
import type { ChecklistItem } from "../api";

export function ChecklistSection({
  taskId,
  items,
  onUpdate,
}: {
  taskId: number;
  items: ChecklistItem[];
  onUpdate: () => void;
}) {
  const [newText, setNewText] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;
    await tasksApi.addChecklistItem(taskId, newText.trim(), items.length);
    setNewText("");
    onUpdate();
  }

  async function toggle(item: ChecklistItem) {
    await tasksApi.updateChecklistItem(taskId, item.id, {
      is_done: !item.is_done,
    });
    onUpdate();
  }

  async function remove(itemId: number) {
    await tasksApi.deleteChecklistItem(taskId, itemId);
    onUpdate();
  }

  const total = items.length;
  const done = items.filter((i) => i.is_done).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="detail-section">
      <div className="detail-section-label">
        Checklist
        {total > 0 && (
          <span className="detail-progress-text">
            {done}/{total}
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="checklist-items">
        {items.map((item) => (
          <div key={item.id} className="checklist-item">
            <button
              className={`task-checkbox ${item.is_done ? "checked" : ""}`}
              onClick={() => toggle(item)}
            >
              {item.is_done && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path
                    d="M1 4L3.5 6.5L9 1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
            <span className={`checklist-text ${item.is_done ? "done" : ""}`}>
              {item.text}
            </span>
            <button className="checklist-delete" onClick={() => remove(item.id)}>
              x
            </button>
          </div>
        ))}
      </div>

      <form className="checklist-add" onSubmit={handleAdd}>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Add item..."
        />
      </form>
    </div>
  );
}
