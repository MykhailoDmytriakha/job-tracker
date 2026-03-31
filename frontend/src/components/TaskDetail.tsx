import { useState, useEffect, useRef } from "react";
import { tasksApi, categoriesApi, ApiError } from "../api";
import type { TaskFull } from "../api";
import { TaskDocuments } from "./TaskDocuments";
import { TaskContacts } from "./TaskContacts";
import { ChecklistSection } from "./ChecklistSection";
import { DependencySection } from "./DependencySection";
import { ConfirmModal } from "./ConfirmModal";
import { SubtaskItem } from "./SubtaskItem";

const STATUS_OPTIONS = ["open", "in_progress", "waiting", "done", "closed"];
const PRIORITY_OPTIONS = ["high", "medium", "low"];

/** Turn "#123 Some title" references into clickable links */
function linkifyTaskRefs(text: string, onClick: (id: number) => void): React.ReactNode {
  const parts = text.split(/(#\d+)/g);
  return parts.map((part, i) => {
    const match = part.match(/^#(\d+)$/);
    if (match) {
      const id = parseInt(match[1], 10);
      return (
        <span
          key={i}
          className="task-ref-link"
          onClick={(e) => { e.stopPropagation(); onClick(id); }}
          title={`Go to task #${id}`}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}
// Categories loaded from API per project

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString();
}

function toInputDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function TaskDetail({
  taskId,
  onClose,
  onDelete,
  onUpdate,
  onNavigate,
}: {
  taskId: number;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
  onNavigate: (id: number) => void;
}) {
  const [task, setTask] = useState<TaskFull | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; message: string; canForce: boolean }>({ show: false, message: "", canForce: false });
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const descDivRef = useRef<HTMLDivElement>(null);
  const [descHeight, setDescHeight] = useState<number | undefined>(undefined);

  const load = () => {
    tasksApi.get(taskId).then((t) => {
      setTask(t);
      categoriesApi.list(t.project_id).then((cats) => setCategoryOptions(cats.map(c => c.name)));
    });
  };

  useEffect(() => {
    load();
    setEditingField(null);
    setError(null);
  }, [taskId]);

  async function updateField(field: string, value: unknown) {
    setEditingField(null);
    setError(null);
    try {
      await tasksApi.update(taskId, { [field]: value } as any);
      load();
      onUpdate();
    } catch (e) {
      if (e instanceof ApiError) {
        let msg = "Something went wrong";
        try { msg = JSON.parse(e.body).detail || msg; } catch {}
        setError(msg);
        // Auto-clear error after 5s so persistent blocked banner shows
        setTimeout(() => setError(null), 5000);
      }
    }
  }

  async function toggleMainStatus() {
    if (!task) return;
    const newStatus = task.status === "done" ? "open" : "done";
    await updateField("status", newStatus);
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    await tasksApi.addNote(taskId, noteText.trim());
    setNoteText("");
    load();
  }

  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!subtaskTitle.trim()) return;
    await tasksApi.create({
      title: subtaskTitle.trim(),
      parent_id: taskId,
    } as any, task!.project_id);
    setSubtaskTitle("");
    load();
    onUpdate();
  }

  if (!task) {
    return (
      <div className="detail-panel">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  const isDone = task.status === "done" || task.status === "closed";
  const subtaskProgress =
    task.subtask_count > 0
      ? Math.round((task.subtask_done / task.subtask_count) * 100)
      : null;

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <button
          className="detail-delete"
          onClick={() => {
            setDeleteConfirm({
              show: true,
              message: `Delete "${task.title}"? This cannot be undone.`,
              canForce: true,
            });
          }}
          title="Delete this task permanently"
        >
          Delete
        </button>
        <button className="detail-close" onClick={onClose}>
          &times;
        </button>
      </div>

      <div className="detail-body">
        {isDone && (
          <div className="done-banner">Completed</div>
        )}

        {error && <div className="detail-error">{linkifyTaskRefs(error, (id) => { setError(null); onNavigate(id); })}</div>}

        {!error && task.is_blocked && task.blocked_by.length > 0 && (
          <div className="blocked-banner">
            Blocked by{" "}
            {task.blocked_by
              .filter((d) => d.status !== "done" && d.status !== "closed")
              .map((d, i, arr) => (
                <span key={d.id}>
                  <span className="task-ref-link" onClick={() => onNavigate(d.id)} title={`Go to #${d.id}`}>#{d.id} {d.title}</span>
                  {i < arr.length - 1 ? ", " : ""}
                </span>
              ))}
            {" "}- complete {task.blocked_by.length === 1 ? "it" : "them"} first
          </div>
        )}

        {/* Title */}
        <div className="detail-title-row">
          <button
            className={`task-checkbox checkbox-lg ${isDone ? "checked" : ""}`}
            onClick={toggleMainStatus}
          >
            {isDone && (
              <svg width="12" height="10" viewBox="0 0 10 8" fill="none">
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
          {editingField === "title" ? (
            <input
              className="inline-title"
              defaultValue={task.title}
              autoFocus
              onBlur={(e) => updateField("title", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  updateField("title", (e.target as HTMLInputElement).value);
                }
                if (e.key === "Escape") setEditingField(null);
              }}
            />
          ) : (
            <h2
              className={`detail-title-text ${isDone ? "title-done" : ""}`}
              onClick={() => setEditingField("title")}
            >
              <span className="detail-id">{task.display_id}</span> {task.title}
            </h2>
          )}
        </div>

        {/* Meta grid */}
        <div className="detail-meta">
          <MetaSelect
            label="Status"
            value={task.status}
            options={STATUS_OPTIONS}
            pillPrefix="status"
            editing={editingField === "status"}
            onEdit={() => setEditingField("status")}
            onSave={(v) => updateField("status", v)}
            onCancel={() => setEditingField(null)}
          />
          <MetaSelect
            label="Priority"
            value={task.priority}
            options={PRIORITY_OPTIONS}
            pillPrefix="priority"
            editing={editingField === "priority"}
            onEdit={() => setEditingField("priority")}
            onSave={(v) => updateField("priority", v)}
            onCancel={() => setEditingField(null)}
          />
          <MetaSelect
            label="Category"
            value={task.category || ""}
            options={categoryOptions}
            allowEmpty
            editing={editingField === "category"}
            onEdit={() => setEditingField("category")}
            onSave={(v) => updateField("category", v || null)}
            onCancel={() => setEditingField(null)}
            onCreateNew={() => { setEditingField(null); setShowNewCat(true); setNewCatName(""); }}
          />
          {showNewCat && (
            <form className="meta-create-inline" onSubmit={async (e) => {
              e.preventDefault();
              if (!newCatName.trim() || !task) return;
              await categoriesApi.create(task.project_id, { name: newCatName.trim() });
              await updateField("category", newCatName.trim());
              setShowNewCat(false);
              load();
            }}>
              <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name..." autoFocus />
              <button type="submit">Create</button>
              <button type="button" onClick={() => setShowNewCat(false)}>Cancel</button>
            </form>
          )}
          <MetaDate
            label="Due Date"
            value={task.due_date}
            editing={editingField === "due_date"}
            onEdit={() => setEditingField("due_date")}
            onSave={(v) => updateField("due_date", v || null)}
            onCancel={() => setEditingField(null)}
          />
          <MetaDate
            label="Follow-up"
            value={task.follow_up_date}
            editing={editingField === "follow_up_date"}
            onEdit={() => setEditingField("follow_up_date")}
            onSave={(v) => updateField("follow_up_date", v || null)}
            onCancel={() => setEditingField(null)}
          />
          {/* Recurring toggle + cadence */}
          <div className="meta-field" onClick={() => updateField("is_recurring", !task.is_recurring)}>
            <span className="meta-label">Recurring</span>
            <span className="meta-value">
              <span className={`toggle-switch ${task.is_recurring ? "on" : ""}`}>
                <span className="toggle-knob" />
              </span>
            </span>
          </div>
          {task.is_recurring && (
            <MetaSelect
              label="Cadence"
              value={task.cadence || "daily"}
              options={["daily", "weekly", "biweekly", "monthly"]}
              editing={editingField === "cadence"}
              onEdit={() => setEditingField("cadence")}
              onSave={(v) => updateField("cadence", v)}
              onCancel={() => setEditingField(null)}
            />
          )}
        </div>

        {/* Activity: for recurring tasks, show here (top). For normal tasks, shown at bottom. */}
        {task.is_recurring && (
          <ActivitySection
            task={task}
            noteText={noteText}
            setNoteText={setNoteText}
            onAdd={addNote}
            recurring
          />
        )}

        {/* Description */}
        <div className="detail-section">
          <div className="detail-section-label">Description</div>
          {editingField === "description" ? (
            <textarea
              className="inline-textarea"
              defaultValue={task.description}
              autoFocus
              style={{ height: descHeight ? `${descHeight}px` : undefined }}
              onBlur={(e) => { updateField("description", e.target.value); setDescHeight(undefined); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setEditingField(null); setDescHeight(undefined); }
              }}
            />
          ) : (
            <div
              ref={descDivRef}
              className={`detail-description ${!task.description ? "empty" : ""}`}
              onClick={() => {
                if (descDivRef.current) setDescHeight(Math.max(descDivRef.current.scrollHeight, 48));
                setEditingField("description");
              }}
            >
              {task.description || "Click to add description..."}
            </div>
          )}
        </div>

        {/* Checklist */}
        <ChecklistSection
          taskId={taskId}
          items={task.checklist_items}
          onUpdate={load}
        />

        {/* Dependencies */}
        <DependencySection
          taskId={taskId}
          blockedBy={task.blocked_by}
          blocks={task.blocks}
          onUpdate={load}
          onNavigate={onNavigate}
        />

        {/* Subtasks */}
        <div className="detail-section">
          <div className="detail-section-label">
            Subtasks
            {subtaskProgress !== null && (
              <span className="progress-pill sub" title={`Subtasks: ${task.subtask_done} of ${task.subtask_count} done`}>
                {task.subtask_done}/{task.subtask_count}
              </span>
            )}
          </div>
          {subtaskProgress !== null && (
            <div className="progress-bar">
              <div
                className="progress-fill sub"
                style={{ width: `${subtaskProgress}%` }}
              />
            </div>
          )}
          <div className="detail-subtasks">
            {task.subtasks.map((s) => (
              <SubtaskItem key={s.id} subtask={s} onUpdate={() => { load(); onUpdate(); }} />
            ))}
          </div>
          <form className="checklist-add" onSubmit={addSubtask}>
            <input
              value={subtaskTitle}
              onChange={(e) => setSubtaskTitle(e.target.value)}
              placeholder="Add subtask..."
            />
          </form>
        </div>

        {/* Documents */}
        <TaskDocuments taskId={taskId} documents={task.documents} projectId={task.project_id} onUpdate={load} />

        {/* Contacts */}
        <TaskContacts taskId={taskId} contacts={task.contacts} projectId={task.project_id} onUpdate={load} />

        {/* Activity: for non-recurring, show at bottom */}
        {!task.is_recurring && (
          <ActivitySection
            task={task}
            noteText={noteText}
            setNoteText={setNoteText}
            onAdd={addNote}
          />
        )}
      </div>

      {deleteConfirm.show && (
        <ConfirmModal
          title={deleteConfirm.canForce ? "Delete task?" : "Cannot delete"}
          message={linkifyTaskRefs(deleteConfirm.message, (id) => {
            setDeleteConfirm({ show: false, message: "", canForce: false });
            onNavigate(id);
          })}
          confirmLabel={deleteConfirm.canForce ? "Delete" : "OK"}
          danger={deleteConfirm.canForce}
          onConfirm={async () => {
            if (!deleteConfirm.canForce) {
              setDeleteConfirm({ show: false, message: "", canForce: false });
              return;
            }
            try {
              await tasksApi.delete(taskId);
              setDeleteConfirm({ show: false, message: "", canForce: false });
              onDelete();
            } catch (e) {
              if (e instanceof ApiError && e.status === 409) {
                let msg = "Cannot delete this task";
                try { msg = JSON.parse(e.body).detail || msg; } catch {}
                const canForce = !msg.includes("middle of a dependency chain");
                setDeleteConfirm({ show: true, message: msg, canForce });
              }
            }
          }}
          onCancel={() => setDeleteConfirm({ show: false, message: "", canForce: false })}
        />
      )}
    </div>
  );
}

/* === Inline Meta Components === */

function MetaSelect({
  label,
  value,
  options,
  allowEmpty,
  pillPrefix,
  editing,
  onEdit,
  onSave,
  onCancel,
  onCreateNew,
}: {
  label: string;
  value: string;
  options: string[];
  allowEmpty?: boolean;
  pillPrefix?: string;
  editing: boolean;
  onEdit: () => void;
  onSave: (v: string) => void;
  onCancel: () => void;
  onCreateNew?: () => void;
}) {
  return (
    <div className="meta-field" onClick={editing ? undefined : onEdit}>
      <span className="meta-label">{label}</span>
      {editing ? (
        <select
          className="inline-select"
          defaultValue={value}
          autoFocus
          onChange={(e) => {
            if (e.target.value === "__create_new__" && onCreateNew) {
              onCreateNew();
            } else {
              onSave(e.target.value);
            }
          }}
          onBlur={onCancel}
        >
          {allowEmpty && <option value="">-</option>}
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          {onCreateNew && <option value="__create_new__">+ New...</option>}
        </select>
      ) : (
        <span className={`meta-value ${!value ? "empty" : ""} ${pillPrefix && value ? `meta-value-pill ${pillPrefix}-${value}` : ""}`}>
          {value || "Set..."}
        </span>
      )}
    </div>
  );
}

function MetaDate({
  label,
  value,
  editing,
  onEdit,
  onSave,
  onCancel,
}: {
  label: string;
  value: string | null;
  editing: boolean;
  onEdit: () => void;
  onSave: (v: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="meta-field" onClick={editing ? undefined : onEdit}>
      <span className="meta-label">{label}</span>
      {editing ? (
        <input
          className="inline-input"
          type="date"
          defaultValue={toInputDate(value)}
          autoFocus
          onBlur={(e) => {
            const v = e.target.value;
            onSave(v ? new Date(v + "T00:00:00Z").toISOString() : "");
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
        />
      ) : (
        <span className={`meta-value ${!value ? "empty" : ""}`}>
          {formatDate(value) || "Set date..."}
        </span>
      )}
    </div>
  );
}

/* === Activity Section — shared between recurring (top, green) and normal (bottom) === */

function ActivitySection({
  task,
  noteText,
  setNoteText,
  onAdd,
  recurring = false,
}: {
  task: TaskFull;
  noteText: string;
  setNoteText: (v: string) => void;
  onAdd: (e: React.FormEvent) => void;
  recurring?: boolean;
}) {
  return (
    <div className={`detail-section ${recurring ? "activity-recurring" : ""}`}>
      <div className="detail-section-label">
        {recurring ? "Progress Log" : "Activity"}
      </div>
      <form className="note-form" onSubmit={onAdd}>
        <input
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder={recurring ? "What did you do today?" : "Add a note..."}
        />
        <button type="submit">{recurring ? "Log" : "Add"}</button>
      </form>
      {task.activities.length > 0 && (
        <div className="detail-activities">
          {task.activities.map((a) => (
            <div key={a.id} className={`detail-activity ${recurring && a.action === "note_added" ? "progress-entry" : ""}`}>
              <span className={`activity-dot ${recurring && a.action === "note_added" ? "green" : ""}`} />
              <div className="activity-content">
                <span className="activity-text">{a.detail}</span>
                <span className="activity-time">
                  {new Date(a.timestamp).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
