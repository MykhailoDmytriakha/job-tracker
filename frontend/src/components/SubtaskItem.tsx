import { useState, useRef, useCallback } from "react";
import { tasksApi, ApiError } from "../api";
import type { TaskBrief, TaskFull } from "../api";
import { showToast } from "./Toast";

export function SubtaskItem({
  subtask,
  depth = 0,
  onUpdate,
}: {
  subtask: TaskBrief;
  depth?: number;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<TaskFull | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const descRef = useRef<HTMLDivElement>(null);
  const [descHeight, setDescHeight] = useState<number | undefined>(undefined);

  const sDone = subtask.status === "done";

  const loadDetail = useCallback(async () => {
    const full = await tasksApi.get(subtask.id);
    setDetail(full);
  }, [subtask.id]);

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await tasksApi.update(subtask.id, { status: sDone ? "open" : "done" } as any);
    } catch (e) {
      if (e instanceof ApiError) {
        try { showToast(JSON.parse(e.body).detail); } catch { showToast("Cannot complete this task"); }
      }
    }
    onUpdate();
  }

  async function expand() {
    if (expanded) { setExpanded(false); return; }
    if (!detail) await loadDetail();
    setExpanded(true);
  }

  async function saveTitle(value: string) {
    setEditingTitle(false);
    if (value.trim() && value !== (detail?.title ?? subtask.title)) {
      await tasksApi.update(subtask.id, { title: value.trim() } as any);
      await loadDetail();
      onUpdate();
    }
  }

  function startEditDesc(e: React.MouseEvent) {
    e.stopPropagation();
    if (descRef.current) setDescHeight(Math.max(descRef.current.scrollHeight, 48));
    setEditingDesc(true);
  }

  async function saveDesc(value: string) {
    setEditingDesc(false);
    setDescHeight(undefined);
    await tasksApi.update(subtask.id, { description: value } as any);
    await loadDetail();
    onUpdate();
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    await tasksApi.delete(subtask.id);
    onUpdate();
  }

  async function addChild(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    await tasksApi.create({ title: newSubtask.trim(), parent_id: subtask.id } as any, subtask.project_id);
    setNewSubtask("");
    await loadDetail();
    onUpdate();
  }

  const title = detail?.title ?? subtask.title;
  const desc = detail?.description ?? "";
  const children = detail?.subtasks ?? [];

  // Progress: subtasks
  const subTotal = subtask.subtask_count;
  const subDone = subtask.subtask_done;
  const hasSubProgress = subTotal > 0;
  const subPct = hasSubProgress ? Math.round((subDone / subTotal) * 100) : 0;

  // Progress: checklist
  const clTotal = subtask.checklist_total;
  const clDone = subtask.checklist_done;
  const hasClProgress = clTotal > 0;

  const maxDepth = 6;

  return (
    <div className="subtask-item" style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      <div className="subtask-row" onClick={expand}>
        <button
          className={`task-checkbox ${sDone ? "checked" : ""}`}
          onClick={toggle}
          title={sDone ? "Mark as open" : "Mark as done"}
        >
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className={`subtask-title ${sDone ? "title-done" : ""}`}>{title}</span>

        {/* Progress: subtasks (purple), checklist (green) */}
        {hasSubProgress && (
          <span className="progress-pill sub" title={`Subtasks: ${subDone} of ${subTotal} done`}>
            {subDone}/{subTotal}
          </span>
        )}
        {hasClProgress && (
          <span className="progress-pill cl" title={`Checklist: ${clDone} of ${clTotal} done`}>
            {clDone}/{clTotal}
          </span>
        )}

        <span className="subtask-chevron">{expanded ? "\u25B4" : "\u25BE"}</span>
        <button className="subtask-delete" onClick={handleDelete} title="Delete subtask">&times;</button>
      </div>

      {/* Mini progress bar under row when collapsed and has children */}
      {!expanded && hasSubProgress && (
        <div className="subtask-mini-progress" style={{ marginLeft: 30 }}>
          <div className="progress-bar" style={{ height: 2 }}>
            <div className="progress-fill" style={{ width: `${subPct}%` }} />
          </div>
        </div>
      )}

      {expanded && detail && (
        <div className="subtask-detail">
          {/* Title */}
          <div className="subtask-field">
            <span className="subtask-field-label">Title</span>
            {editingTitle ? (
              <input
                className="subtask-edit-input"
                defaultValue={title}
                autoFocus
                onBlur={(e) => saveTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle((e.target as HTMLInputElement).value);
                  if (e.key === "Escape") setEditingTitle(false);
                }}
              />
            ) : (
              <span className="subtask-field-value" onClick={(e) => { e.stopPropagation(); setEditingTitle(true); }}>
                {title}
              </span>
            )}
          </div>

          {/* Description */}
          <div className="subtask-field">
            <span className="subtask-field-label">Description</span>
            {editingDesc ? (
              <textarea
                className="subtask-edit-textarea"
                defaultValue={desc}
                autoFocus
                style={{ height: descHeight ? `${descHeight}px` : undefined }}
                onBlur={(e) => saveDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setEditingDesc(false); setDescHeight(undefined); } }}
              />
            ) : (
              <div
                ref={descRef}
                className={`subtask-field-value ${!desc ? "empty" : ""}`}
                onClick={startEditDesc}
              >
                {desc || "Add description..."}
              </div>
            )}
          </div>

          {/* Checklist from detail */}
          {detail.checklist_items.length > 0 && (
            <div className="subtask-field">
              <span className="subtask-field-label">
                Checklist {detail.checklist_items.filter(c => c.is_done).length}/{detail.checklist_items.length}
              </span>
              <div className="progress-bar">
                <div className="progress-fill cl" style={{ width: `${detail.checklist_items.length > 0 ? Math.round((detail.checklist_items.filter(c => c.is_done).length / detail.checklist_items.length) * 100) : 0}%` }} />
              </div>
              <div className="checklist-items">
                {detail.checklist_items.map((item) => (
                  <div key={item.id} className="checklist-item">
                    <button
                      className={`task-checkbox ${item.is_done ? "checked" : ""}`}
                      onClick={async (e) => {
                        e.stopPropagation();
                        await tasksApi.updateChecklistItem(subtask.id, item.id, { is_done: !item.is_done });
                        await loadDetail();
                        onUpdate();
                      }}
                      title={item.is_done ? "Uncheck" : "Check"}
                    >
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <span className={`checklist-text ${item.is_done ? "done" : ""}`}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nested subtasks with progress */}
          {children.length > 0 && (
            <div className="subtask-field">
              <span className="subtask-field-label">
                Subtasks {children.filter(c => c.status === "done").length}/{children.length}
              </span>
              <div className="progress-bar">
                <div className="progress-fill sub" style={{ width: `${Math.round((children.filter(c => c.status === "done").length / children.length) * 100)}%` }} />
              </div>
              <div className="detail-subtasks">
                {children.map((c) => (
                  <SubtaskItem key={c.id} subtask={c} depth={depth + 1} onUpdate={async () => { await loadDetail(); onUpdate(); }} />
                ))}
              </div>
            </div>
          )}

          {/* Add sub-subtask */}
          {depth < maxDepth && (
            <form className="checklist-add" onSubmit={addChild}>
              <input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="Add subtask..."
                onClick={(e) => e.stopPropagation()}
              />
            </form>
          )}
        </div>
      )}
    </div>
  );
}
