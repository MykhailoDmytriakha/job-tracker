import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { tasksApi, categoriesApi, stagesApi, ApiError } from "../api";
import type { TaskFull, Stage } from "../api";
import { TaskDocuments } from "./TaskDocuments";
import { TaskContacts } from "./TaskContacts";
import { TaskCompanies } from "./TaskCompanies";
import { highlight } from "../utils/highlight";
import { HintBubble } from "./HintBubble";
import { ChecklistSection } from "./ChecklistSection";
import { DependencySection } from "./DependencySection";
import { ConfirmModal } from "./ConfirmModal";
import { SubtaskItem } from "./SubtaskItem";
import { CustomDatePicker } from "./CustomDatePicker";

const STATUS_OPTIONS = ["open", "in_progress", "waiting", "done", "closed"];
const PRIORITY_OPTIONS = ["high", "medium", "low"];
const CADENCE_DAYS: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };

/** Parse API datetime strings as UTC (backend stores naive datetimes treated as UTC via _aware()). */
function parseUtc(s: string | null): Date | null {
  if (!s) return null;
  const normalized = s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + "Z";
  return new Date(normalized);
}

/** Compute specific attention reasons for a task. Mirrors backend _needs_attention logic. */
function getAttentionReasons(task: TaskFull): string[] {
  const now = new Date();
  const reasons: string[] = [];
  const la = parseUtc(task.last_activity_at);
  const daysInactive = la ? Math.floor((now.getTime() - la.getTime()) / 86400000) : 9999;
  const isDone = task.status === "done" || task.status === "closed";
  if (isDone) return [];

  if (!task.is_recurring && !task.due_date && !task.follow_up_date)
    reasons.push("No due date or follow-up date — task is floating with no timeline");

  if (task.is_recurring) {
    const days = CADENCE_DAYS[task.cadence || ""] ?? 1;
    if (daysInactive >= days * 3)
      reasons.push(`Stale recurring — no activity for ${daysInactive}d (cadence: ${task.cadence ?? "daily"}, threshold: ${days * 3}d)`);
  }

  if (task.status === "waiting" && task.follow_up_date) {
    const followDay = parseUtc(task.follow_up_date)!;
    // Compare dates only (UTC) — overdue only when the day has fully passed
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (followDay < todayUtc)
      reasons.push("Follow-up date has passed — check-in is overdue");
  }

  if (task.status === "in_progress" && daysInactive >= 14)
    reasons.push(`In-progress but no activity for ${daysInactive} days — might be stuck`);

  if (task.priority === "high" && !task.due_date)
    reasons.push("High priority without a due date — when does this need to be done?");

  if (task.is_blocked && daysInactive >= 7)
    reasons.push(`Blocked with no movement for ${daysInactive} days`);

  if (task.status === "open") {
    const ageDays = Math.floor((now.getTime() - parseUtc(task.created_at)!.getTime()) / 86400000);
    const hasRealActivity = task.activities?.some(a => a.action !== "created");
    if (ageDays >= 10 && !hasRealActivity)
      reasons.push(`Created ${ageDays} days ago but never updated`);
  }

  return reasons;
}

/** Small ⚡ badge: subtle at rest, animates on hover, shows reasons on click */
function AttentionBadge({ reasons }: { reasons: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      const popW = 280, margin = 10;
      let left = r.left;
      left = Math.max(margin, Math.min(left, window.innerWidth - popW - margin));
      const top = r.bottom + 6;
      setPos({ top, left });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <>
      <button
        ref={ref}
        className={`attention-badge${open ? " attention-badge--open" : ""}`}
        onClick={onClick}
        title="This task needs attention — click to see why"
      >
        ⚡
      </button>
      {open && createPortal(
        <div
          className="attention-badge-popover"
          style={{ top: pos.top, left: pos.left }}
          onMouseDown={e => e.stopPropagation()}
          onMouseUp={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <div className="attention-badge-popover-title">Needs attention</div>
          <ul className="attention-badge-reasons">
            {reasons.map((r, i) => (
              <li key={i} className="attention-badge-reason">⚡ {r}</li>
            ))}
          </ul>
        </div>,
        document.body
      )}
    </>
  );
}

/** Sanitize value string to a valid CSS class slug */
const cssSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9_]+/g, '-');

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


export function TaskDetail({
  taskId,
  onClose,
  onDelete,
  onUpdate,
  onNavigate,
  onOpenFull,
  isModal = false,
  searchTerm = "",
}: {
  taskId: number;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
  onNavigate: (id: number) => void;
  onOpenFull?: () => void;
  isModal?: boolean;
  searchTerm?: string;
}) {
  const [task, setTask] = useState<TaskFull | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [allStages, setAllStages] = useState<Stage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; message: string; canForce: boolean }>({ show: false, message: "", canForce: false });
  const [copied, setCopied] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const descDivRef = useRef<HTMLDivElement>(null);
  const [descHeight, setDescHeight] = useState<number | undefined>(undefined);

  const load = () => {
    tasksApi.get(taskId).then((t) => {
      setTask(t);
      categoriesApi.list(t.project_id).then((cats) => setCategoryOptions(cats.map(c => c.name)));
      if (t.stage_id) {
        stagesApi.list().then((stages) => {
          setAllStages(stages.flatMap((s) => [s, ...s.children]));
        });
      }
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
    await tasksApi.addSubtaskItem(taskId, subtaskTitle.trim());
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
  const attentionReasons = getAttentionReasons(task);
  const hasAttention = attentionReasons.length > 0;
  const subtaskProgress =
    task.subtask_count > 0
      ? Math.round((task.subtask_done / task.subtask_count) * 100)
      : null;

  return (
    <div className={`detail-panel${isModal ? " detail-panel--modal" : ""}${hasAttention ? " detail-panel--attention" : ""}`}>
      <div className={`detail-header${isModal ? " detail-header--modal" : ""}`}>
        {isModal ? (
          <span className="detail-modal-id">{task.display_id}</span>
        ) : (
          <button className="detail-close" onClick={onClose} title="Back to list">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {onOpenFull && (
            <button
              className="detail-expand"
              onClick={onOpenFull}
              title="Open full page"
              style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: 'var(--text-faint)', padding: '6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.background = 'none'; }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 8v6a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1h6M10 2h4v4M14 2L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          <button
            className="detail-delete"
            onClick={() => setDeleteConfirm({ show: true, message: `Delete "${task.title}"? This cannot be undone.`, canForce: true })}
            title="Delete task"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {isModal && (
            <button
              className="detail-modal-close"
              onClick={onClose}
              title="Close (Esc)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="detail-body">
        <div className="detail-top">
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
              {hasAttention && <AttentionBadge reasons={attentionReasons} />}
              <span className="detail-id">{task.display_id}</span>
              {" "}{highlight(task.title, searchTerm)}
              <button
                className={`copy-link-btn${copied ? " copied" : ""}`}
                title={copied ? "Copied!" : "Copy ID + title"}
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(`${task.display_id} ${task.title}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? (
                  <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
                    <path d="M2.5 8L6 11.5L12.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
                    <rect x="5.5" y="1.5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M9.5 4.5H2.5C1.948 4.5 1.5 4.948 1.5 5.5V12.5C1.5 13.052 1.948 13.5 2.5 13.5H9.5C10.052 13.5 10.5 13.052 10.5 12.5V5.5C10.5 4.948 10.052 4.5 9.5 4.5Z" stroke="currentColor" strokeWidth="1.4"/>
                  </svg>
                )}
              </button>
            </h2>
          )}
          </div>
        </div>{/* /detail-top */}

        <div className="detail-columns">
          {/* ── LEFT: work surface ── */}
          <div className="detail-col-main">
            {/* Activity top (recurring only) */}
            {task.is_recurring && (
              <ActivitySection
                task={task}
                noteText={noteText}
                setNoteText={setNoteText}
                onAdd={addNote}
                recurring
                searchTerm={searchTerm}
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
                  {task.description ? highlight(task.description, searchTerm) : "Click to add description..."}
                </div>
              )}
            </div>

            {/* Dependencies */}
            <DependencySection
              taskId={taskId}
              blockedBy={task.blocked_by}
              blocks={task.blocks}
              onUpdate={load}
              onNavigate={onNavigate}
            />

            {/* Checklist */}
            <ChecklistSection
              taskId={taskId}
              items={task.checklist_items}
              onUpdate={load}
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
                  <div className="progress-fill sub" style={{ width: `${subtaskProgress}%` }} />
                </div>
              )}
              <div className="detail-subtasks">
                {task.subtask_items.map((s) => (
                  <SubtaskItem key={s.id} taskId={taskId} item={s} onUpdate={() => { load(); onUpdate(); }} />
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

            {/* Activity bottom (non-recurring) */}
            {!task.is_recurring && (
              <ActivitySection
                task={task}
                noteText={noteText}
                setNoteText={setNoteText}
                onAdd={addNote}
                searchTerm={searchTerm}
              />
            )}
          </div>

          {/* ── RIGHT: sidebar ── */}
          <div className="detail-col-side">
            {/* Task meta */}
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
                tooltip="Hard deadline — task must be done by this date or the opportunity is lost. Use for: job posting close dates, offer acceptance deadlines, legal filing dates."
              />
              <MetaDate
                label="Follow-up"
                value={task.follow_up_date}
                editing={editingField === "follow_up_date"}
                onEdit={() => setEditingField("follow_up_date")}
                onSave={(v) => updateField("follow_up_date", v || null)}
                onCancel={() => setEditingField(null)}
                tooltip="Soft reminder — come back on this date and take the next action. Nothing expires if missed. Use for: watchlist rechecks, recruiter follow-ups, waiting-on-response nudges."
              />
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

            {/* Pipeline fields */}
            {task.stage_id && (
              <div className="detail-section">
                <div className="detail-section-label">Pipeline</div>
                <div className="detail-meta">
                  <MetaSelect
                    label="Stage"
                    value={allStages.find((s) => s.id === task.stage_id)?.name || ""}
                    options={allStages.map((s) => s.name)}
                    pillPrefix="stage"
                    editing={editingField === "stage_id"}
                    onEdit={() => setEditingField("stage_id")}
                    onSave={(v) => { const stage = allStages.find((s) => s.name === v); if (stage) updateField("stage_id", stage.id); }}
                    onCancel={() => setEditingField(null)}
                  />
                  <MetaSelect
                    label="Heat"
                    value={task.pipeline_heat || ""}
                    options={["hot", "warm", "cold", "archived"]}
                    allowEmpty
                    pillPrefix="heat"
                    tooltip="Pipeline temperature — how actively you're pursuing this opportunity. hot = top priority now, warm = active, cold = passive/watching, archived = closed."
                    editing={editingField === "pipeline_heat"}
                    onEdit={() => setEditingField("pipeline_heat")}
                    onSave={(v) => updateField("pipeline_heat", v || null)}
                    onCancel={() => setEditingField(null)}
                  />
                  <MetaSelect
                    label="Lead Source"
                    value={task.lead_source || ""}
                    options={["job_board", "linkedin", "referral", "direct", "cold_outreach"]}
                    allowEmpty
                    pillPrefix="source"
                    editing={editingField === "lead_source"}
                    onEdit={() => setEditingField("lead_source")}
                    onSave={(v) => updateField("lead_source", v || null)}
                    onCancel={() => setEditingField(null)}
                  />
                  <MetaSelect
                    label="Outreach"
                    value={task.outreach_status || ""}
                    options={["not_started", "searching", "contacted", "replied", "connected", "dead_end"]}
                    allowEmpty
                    pillPrefix="outreach"
                    editing={editingField === "outreach_status"}
                    onEdit={() => setEditingField("outreach_status")}
                    onSave={(v) => updateField("outreach_status", v || null)}
                    onCancel={() => setEditingField(null)}
                  />
                  <MetaSelect
                    label="Close Reason"
                    value={task.close_reason || ""}
                    options={["skipped", "not_a_fit", "rejected", "ghosted", "withdrawn", "duplicate"]}
                    allowEmpty
                    editing={editingField === "close_reason"}
                    onEdit={() => setEditingField("close_reason")}
                    onSave={(v) => updateField("close_reason", v || null)}
                    onCancel={() => setEditingField(null)}
                    searchTerm={searchTerm}
                  />
                  <MetaDate
                    label="Applied"
                    value={task.applied_at}
                    editing={editingField === "applied_at"}
                    onEdit={() => setEditingField("applied_at")}
                    onSave={(v) => updateField("applied_at", v || null)}
                    onCancel={() => setEditingField(null)}
                  />
                  <MetaText
                    label="Posting URL"
                    value={task.posting_url}
                    editing={editingField === "posting_url"}
                    onEdit={() => setEditingField("posting_url")}
                    onSave={(v) => updateField("posting_url", v || null)}
                    onCancel={() => setEditingField(null)}
                    isLink
                    searchTerm={searchTerm}
                  />
                  <MetaText
                    label="Compensation"
                    value={task.compensation}
                    editing={editingField === "compensation"}
                    onEdit={() => setEditingField("compensation")}
                    onSave={(v) => updateField("compensation", v || null)}
                    onCancel={() => setEditingField(null)}
                    searchTerm={searchTerm}
                  />
                </div>
              </div>
            )}

            {/* Documents */}
            <TaskDocuments taskId={taskId} documents={task.documents} projectId={task.project_id} onUpdate={load} searchTerm={searchTerm} />

            {/* Companies */}
            <TaskCompanies taskId={taskId} companies={task.companies} projectId={task.project_id} onUpdate={load} searchTerm={searchTerm} />

            {/* Contacts */}
            <TaskContacts taskId={taskId} contacts={task.contacts} projectId={task.project_id} onUpdate={load} searchTerm={searchTerm} />
          </div>
        </div>
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
  tooltip,
  editing,
  onEdit,
  onSave,
  onCancel,
  onCreateNew,
  searchTerm = "",
}: {
  label: string;
  value: string;
  options: string[];
  allowEmpty?: boolean;
  pillPrefix?: string;
  tooltip?: string;
  editing: boolean;
  onEdit: () => void;
  onSave: (v: string) => void;
  onCancel: () => void;
  onCreateNew?: () => void;
  searchTerm?: string;
}) {
  return (
    <div className="meta-field" onClick={editing ? undefined : onEdit}>
      <span className="meta-label">
        {label}
        {tooltip && <HintBubble text={tooltip} />}
      </span>
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
        <span className={`meta-value ${!value ? "empty" : ""} ${pillPrefix && value ? `meta-value-pill ${pillPrefix}-${cssSlug(value)}` : ""}`}>
          {value ? highlight(value, searchTerm) : "Set..."}
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
  tooltip,
}: {
  label: string;
  value: string | null;
  editing: boolean;
  onEdit: () => void;
  onSave: (v: string) => void;
  onCancel: () => void;
  tooltip?: string;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  return (
    <div className="meta-field" onClick={editing ? undefined : onEdit} ref={fieldRef}>
      <span className="meta-label">
        {label}
        {tooltip && <HintBubble text={tooltip} />}
      </span>
      {editing && (
        <CustomDatePicker
          value={value}
          onSave={onSave}
          onCancel={onCancel}
          anchorRef={fieldRef}
        />
      )}
      <span className={`meta-value ${!value ? "empty" : ""} ${editing ? "active" : ""}`}>
        {formatDate(value) || "Set date..."}
      </span>
    </div>
  );
}

function MetaText({
  label,
  value,
  editing,
  onEdit,
  onSave,
  onCancel,
  isLink,
  searchTerm = "",
}: {
  label: string;
  value: string | null;
  editing: boolean;
  onEdit: () => void;
  onSave: (v: string) => void;
  onCancel: () => void;
  isLink?: boolean;
  searchTerm?: string;
}) {
  return (
    <div className="meta-field" onClick={editing ? undefined : onEdit}>
      <span className="meta-label">{label}</span>
      {editing ? (
        <input
          className="inline-input"
          type="text"
          defaultValue={value || ""}
          autoFocus
          onBlur={(e) => onSave(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave((e.target as HTMLInputElement).value);
            if (e.key === "Escape") onCancel();
          }}
        />
      ) : (
        <span className={`meta-value ${!value ? "empty" : ""}`}>
          {value ? (
            isLink ? (
              <a href={value} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                {highlight(value, searchTerm)}
              </a>
            ) : highlight(value, searchTerm)
          ) : "Set..."}
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
  searchTerm = "",
}: {
  task: TaskFull;
  noteText: string;
  setNoteText: (v: string) => void;
  onAdd: (e: React.FormEvent) => void;
  recurring?: boolean;
  searchTerm?: string;
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
                <span className="activity-text">{highlight(a.detail, searchTerm)}</span>
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
