import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { meetingsApi, documentsApi } from "../api";
import type { Meeting, DocumentBrief } from "../api";
import { StripTooltip } from "./StripTooltip";

// ── Display maps ────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  phone_screen: "Phone Screen",
  technical: "Technical",
  behavioral: "Behavioral",
  panel: "Panel",
  onsite: "Onsite",
  other: "Meeting",
};

const PLATFORM_LABELS: Record<string, string> = {
  teams: "Teams",
  zoom: "Zoom",
  phone: "Phone",
  onsite: "On-site",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "var(--accent)",
  completed: "var(--green)",
  cancelled: "var(--red)",
  rescheduled: "var(--orange)",
  no_show: "var(--text-faint)",
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
  scheduled: "Blue: scheduled — meeting is confirmed",
  completed: "Green: completed — meeting took place",
  cancelled: "Red: cancelled — meeting was called off",
  rescheduled: "Orange: rescheduled — new time being arranged",
  no_show: "Gray: no show — participant(s) didn't appear",
};

const STATUS_BG: Record<string, string> = {
  scheduled: "var(--accent-soft)",
  completed: "var(--green-soft)",
  cancelled: "var(--red-soft)",
  rescheduled: "var(--orange-soft)",
  no_show: "transparent",
};

const RESULT_COLORS: Record<string, string> = {
  passed: "var(--green)",
  failed: "var(--red)",
  pending: "var(--orange)",
  unknown: "var(--text-faint)",
};

const RESULT_BG: Record<string, string> = {
  passed: "var(--green-soft)",
  failed: "var(--red-soft)",
  pending: "var(--orange-soft)",
  unknown: "transparent",
};

// ── Date helpers ─────────────────────────────────────────────────────────────

function formatScheduledAt(s: string | null): string {
  if (!s) return "—";
  // Normalize: treat as local if no tz offset
  const normalized = s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : s;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// Strip seconds from datetime-local value for input
function toDatetimeLocal(s: string | null): string {
  if (!s) return "";
  // Take first 16 chars: "YYYY-MM-DDTHH:MM"
  return s.slice(0, 16);
}

// ── Blank form state ─────────────────────────────────────────────────────────

interface FormState {
  meeting_type: string;
  scheduled_at: string;
  interviewer: string;
  platform: string;
  join_url: string;
  status: string;
  result: string;
  notes: string;
  brief_doc_id: string;
  notes_doc_id: string;
}

function blankForm(): FormState {
  return {
    meeting_type: "phone_screen",
    scheduled_at: "",
    interviewer: "",
    platform: "",
    join_url: "",
    status: "scheduled",
    result: "",
    notes: "",
    brief_doc_id: "",
    notes_doc_id: "",
  };
}

function fromMeeting(m: Meeting): FormState {
  return {
    meeting_type: m.meeting_type,
    scheduled_at: toDatetimeLocal(m.scheduled_at),
    interviewer: m.interviewer ?? "",
    platform: m.platform ?? "",
    join_url: m.join_url ?? "",
    status: m.status,
    result: m.result ?? "",
    notes: m.notes ?? "",
    brief_doc_id: m.brief_doc_id != null ? String(m.brief_doc_id) : "",
    notes_doc_id: m.notes_doc_id != null ? String(m.notes_doc_id) : "",
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function PillGroup({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; color?: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="meeting-form-field">
      <label className="meeting-form-label">{label}</label>
      <div className="meeting-pill-group">
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            className={`meeting-pill${value === o.value ? " meeting-pill--active" : ""}`}
            style={value === o.value && o.color ? { background: o.color, borderColor: o.color, color: "#fff" } : {}}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── MeetingForm ──────────────────────────────────────────────────────────────

function MeetingForm({
  initial,
  onSave,
  onCancel,
  saving,
  docs,
}: {
  initial: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
  saving: boolean;
  docs: DocumentBrief[];
}) {
  const [f, setF] = useState<FormState>(initial);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF(prev => ({ ...prev, [k]: e.target.value }));

  const setProp = (k: keyof FormState, v: string) =>
    setF(prev => ({ ...prev, [k]: v }));

  // Auto-expand textarea on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, []);

  const STATUS_OPTIONS = [
    { value: "scheduled",   label: "Scheduled",   color: "var(--accent)" },
    { value: "completed",   label: "Completed",   color: "var(--green)"  },
    { value: "rescheduled", label: "Rescheduled", color: "var(--orange)" },
    { value: "cancelled",   label: "Cancelled",   color: "var(--red)"    },
    { value: "no_show",     label: "No Show",     color: "var(--text-muted)" },
  ];

  const RESULT_OPTIONS = [
    { value: "",        label: "—"       },
    { value: "passed",  label: "Passed",  color: "var(--green)"  },
    { value: "failed",  label: "Failed",  color: "var(--red)"    },
    { value: "pending", label: "Pending", color: "var(--orange)" },
    { value: "unknown", label: "Unknown", color: "var(--text-muted)" },
  ];

  return (
    <form
      className="meeting-form"
      onSubmit={e => { e.preventDefault(); onSave(f); }}
    >
      {/* Row 1: Type · Date · Platform */}
      <div className="meeting-form-row meeting-form-row--3">
        <div className="meeting-form-field">
          <label className="meeting-form-label">Type</label>
          <select className="meeting-form-select" value={f.meeting_type} onChange={set("meeting_type")}>
            <option value="phone_screen">Phone Screen</option>
            <option value="technical">Technical</option>
            <option value="behavioral">Behavioral</option>
            <option value="panel">Panel</option>
            <option value="onsite">Onsite</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="meeting-form-field">
          <label className="meeting-form-label">Date &amp; Time</label>
          <input
            className="meeting-form-input"
            type="datetime-local"
            value={f.scheduled_at}
            onChange={set("scheduled_at")}
          />
        </div>
        <div className="meeting-form-field">
          <label className="meeting-form-label">Platform</label>
          <select className="meeting-form-select" value={f.platform} onChange={set("platform")}>
            <option value="">—</option>
            <option value="teams">Teams</option>
            <option value="zoom">Zoom</option>
            <option value="phone">Phone</option>
            <option value="onsite">On-site</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Row 2: Interviewer (full width) */}
      <div className="meeting-form-field">
        <label className="meeting-form-label">Interviewer</label>
        <input
          className="meeting-form-input"
          type="text"
          value={f.interviewer}
          onChange={set("interviewer")}
          placeholder="Name or role..."
        />
      </div>

      {/* Row 3: Status pills */}
      <PillGroup
        label="Status"
        value={f.status}
        options={STATUS_OPTIONS}
        onChange={v => setProp("status", v)}
      />

      {/* Row 4: Result pills */}
      <PillGroup
        label="Result"
        value={f.result}
        options={RESULT_OPTIONS}
        onChange={v => setProp("result", v)}
      />

      {/* Row 5: Join URL */}
      <div className="meeting-form-field">
        <label className="meeting-form-label">Join URL</label>
        <input
          className="meeting-form-input"
          type="text"
          value={f.join_url}
          onChange={set("join_url")}
          placeholder="https://..."
        />
      </div>

      {/* Row 6: Brief Doc + Notes Doc */}
      <div className="meeting-form-row">
        <div className="meeting-form-field">
          <label className="meeting-form-label">
            Brief Doc <span className="meeting-form-label-hint">— подготовка</span>
          </label>
          <select className="meeting-form-select" value={f.brief_doc_id} onChange={set("brief_doc_id")}>
            <option value="">— нет —</option>
            {docs.map(d => (
              <option key={d.id} value={String(d.id)}>
                #{d.id} {d.title}{d.doc_type ? ` [${d.doc_type}]` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="meeting-form-field">
          <label className="meeting-form-label">
            Notes Doc <span className="meeting-form-label-hint">— итоги</span>
          </label>
          <select className="meeting-form-select" value={f.notes_doc_id} onChange={set("notes_doc_id")}>
            <option value="">— нет —</option>
            {docs.map(d => (
              <option key={d.id} value={String(d.id)}>
                #{d.id} {d.title}{d.doc_type ? ` [${d.doc_type}]` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 7: Notes (auto-expand) */}
      <div className="meeting-form-field">
        <label className="meeting-form-label">Notes</label>
        <textarea
          ref={textareaRef}
          className="meeting-form-textarea"
          value={f.notes}
          onChange={e => {
            set("notes")(e);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          placeholder="Meeting ID, passcode, prep notes, feedback..."
        />
      </div>

      <div className="meeting-form-actions">
        <button type="submit" className="meeting-form-save" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="meeting-form-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── MeetingCard ──────────────────────────────────────────────────────────────

function MeetingDocChip({ doc }: { doc: DocumentBrief }) {
  const navigate = useNavigate();
  return (
    <div className="task-doc-item" style={{ marginTop: 4 }}>
      <span
        className="task-doc-title"
        onClick={() => navigate(`/docs?selected=${doc.id}`)}
        title="Open document"
      >
        {doc.title}
      </span>
      {doc.doc_type && (
        <span className={`docs-type-badge type-${doc.doc_type}`}>{doc.doc_type}</span>
      )}
    </div>
  );
}

function MeetingCard({
  meeting,
  taskId,
  docs,
  onUpdate,
}: {
  meeting: Meeting;
  taskId: number;
  docs: DocumentBrief[];
  onUpdate: () => void;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const statusColor = STATUS_COLORS[meeting.status] ?? "var(--text-faint)";
  const statusBg = STATUS_BG[meeting.status] ?? "transparent";
  const resultColor = meeting.result ? (RESULT_COLORS[meeting.result] ?? "var(--text-faint)") : null;
  const resultBg = meeting.result ? (RESULT_BG[meeting.result] ?? "transparent") : null;

  async function handleSave(f: FormState) {
    setSaving(true);
    try {
      await meetingsApi.update(taskId, meeting.id, {
        meeting_type: f.meeting_type,
        scheduled_at: f.scheduled_at || null,
        interviewer: f.interviewer || null,
        platform: f.platform || null,
        join_url: f.join_url || null,
        status: f.status,
        result: f.result || null,
        notes: f.notes || null,
        brief_doc_id: f.brief_doc_id ? Number(f.brief_doc_id) : null,
        notes_doc_id: f.notes_doc_id ? Number(f.notes_doc_id) : null,
      });
      setEditing(false);
      onUpdate();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await meetingsApi.delete(taskId, meeting.id);
    onUpdate();
  }

  async function handleMarkDone() {
    await meetingsApi.update(taskId, meeting.id, {
      status: "completed",
      result: meeting.result ?? "pending",
    });
    onUpdate();
  }

  if (editing) {
    return (
      <div className="meeting-card meeting-card--editing">
        <MeetingForm
          initial={fromMeeting(meeting)}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          saving={saving}
          docs={docs}
        />
      </div>
    );
  }

  return (
    <div
      className={`meeting-card${expanded ? " meeting-card--expanded" : ""}`}
      style={{ "--status-color": statusColor } as React.CSSProperties}
    >
      <StripTooltip
        className="meeting-card-strip"
        style={{ background: statusColor }}
        text={STATUS_DESCRIPTIONS[meeting.status] ?? `Status: ${meeting.status}`}
      />

      <div className="meeting-card-body">
        {/* ── Compact row — always visible, click to expand ── */}
        <div
          className="meeting-card-top"
          onClick={() => setExpanded(v => !v)}
          style={{ cursor: "pointer" }}
        >
          <span className="meeting-chevron">{expanded ? "▾" : "▸"}</span>

          <span className="meeting-type-badge">
            {TYPE_LABELS[meeting.meeting_type] ?? meeting.meeting_type}
          </span>

          <div className="meeting-card-meta">
            {meeting.scheduled_at && (
              <span className="meeting-date">{formatScheduledAt(meeting.scheduled_at)}</span>
            )}
            {meeting.platform && (
              <span className="meeting-platform">
                {PLATFORM_LABELS[meeting.platform] ?? meeting.platform}
              </span>
            )}
            {meeting.interviewer && (
              <span className="meeting-interviewer">{meeting.interviewer}</span>
            )}
          </div>

          <div className="meeting-card-right" onClick={e => e.stopPropagation()}>
            <button
              className="meeting-cockpit-btn"
              onClick={() => navigate(`/tasks/${taskId}/meeting/${meeting.id}/cockpit`)}
              title="Open Cockpit"
            >
              Cockpit
            </button>

            {meeting.join_url && meeting.status === "scheduled" && (
              <a
                className="meeting-join-btn"
                href={meeting.join_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Join ↗
              </a>
            )}

            <span
              className="meeting-status-pill"
              style={{ color: statusColor, background: statusBg }}
            >
              {meeting.status.replace("_", " ")}
            </span>

            {meeting.result && resultColor && (
              <span
                className="meeting-result-pill"
                style={{ color: resultColor, background: resultBg ?? "transparent" }}
              >
                {meeting.result}
              </span>
            )}

            <div className="meeting-card-actions">
              {meeting.status === "scheduled" && (
                <button
                  className="meeting-action-btn meeting-action-done"
                  onClick={handleMarkDone}
                  title="Mark as completed"
                >
                  ✓
                </button>
              )}
              <button
                className="meeting-action-btn"
                onClick={() => setEditing(true)}
                title="Edit meeting"
              >
                ✎
              </button>
              <button
                className="meeting-action-btn meeting-action-delete"
                onClick={handleDelete}
                title="Delete meeting"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* ── Expanded detail panel ── */}
        {expanded && (
          <div className="meeting-detail">
            <div className="meeting-detail-grid">
              {meeting.interviewer && (
                <div className="meeting-detail-row">
                  <span className="meeting-detail-label">Interviewer</span>
                  <span className="meeting-detail-value">{meeting.interviewer}</span>
                </div>
              )}
              {meeting.platform && (
                <div className="meeting-detail-row">
                  <span className="meeting-detail-label">Platform</span>
                  <span className="meeting-detail-value">
                    {PLATFORM_LABELS[meeting.platform] ?? meeting.platform}
                  </span>
                </div>
              )}
              {meeting.scheduled_at && (
                <div className="meeting-detail-row">
                  <span className="meeting-detail-label">Scheduled</span>
                  <span className="meeting-detail-value">{formatScheduledAt(meeting.scheduled_at)}</span>
                </div>
              )}
              {meeting.result && (
                <div className="meeting-detail-row">
                  <span className="meeting-detail-label">Result</span>
                  <span
                    className="meeting-detail-value"
                    style={{ color: resultColor ?? undefined, fontWeight: 600 }}
                  >
                    {meeting.result}
                  </span>
                </div>
              )}
              {meeting.join_url && (
                <div className="meeting-detail-row">
                  <span className="meeting-detail-label">Join URL</span>
                  <a
                    className="meeting-detail-link"
                    href={meeting.join_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {meeting.join_url.length > 60
                      ? meeting.join_url.slice(0, 60) + "…"
                      : meeting.join_url}
                  </a>
                </div>
              )}
              {meeting.brief_doc_id && (() => {
                const doc = docs.find(d => d.id === meeting.brief_doc_id);
                return doc ? (
                  <div className="meeting-detail-row">
                    <span className="meeting-detail-label">Brief Doc</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <MeetingDocChip doc={doc} />
                    </div>
                  </div>
                ) : null;
              })()}
              {meeting.notes_doc_id && (() => {
                const doc = docs.find(d => d.id === meeting.notes_doc_id);
                return doc ? (
                  <div className="meeting-detail-row">
                    <span className="meeting-detail-label">Notes Doc</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <MeetingDocChip doc={doc} />
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
            {meeting.notes && (
              <div className="meeting-detail-notes">{meeting.notes}</div>
            )}
            {!meeting.interviewer && !meeting.platform && !meeting.scheduled_at &&
              !meeting.result && !meeting.join_url && !meeting.notes && (
              <span className="meeting-detail-empty">No additional details</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MeetingSection ───────────────────────────────────────────────────────────

export function MeetingSection({
  taskId,
  projectId,
  meetings,
  onUpdate,
}: {
  taskId: number;
  projectId: number;
  meetings: Meeting[];
  onUpdate: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [docs, setDocs] = useState<DocumentBrief[]>([]);

  const upcoming = meetings.filter(m => m.status === "scheduled").length;

  useEffect(() => {
    documentsApi.list(projectId).then(setDocs).catch(() => {});
  }, [projectId]);

  async function handleAdd(f: FormState) {
    setSaving(true);
    try {
      await meetingsApi.add(taskId, {
        meeting_type: f.meeting_type,
        scheduled_at: f.scheduled_at || null,
        interviewer: f.interviewer || null,
        platform: f.platform || null,
        join_url: f.join_url || null,
        status: f.status,
        result: f.result || null,
        notes: f.notes || null,
        brief_doc_id: f.brief_doc_id ? Number(f.brief_doc_id) : null,
        notes_doc_id: f.notes_doc_id ? Number(f.notes_doc_id) : null,
      });
      setAdding(false);
      onUpdate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="detail-section">
      <div className="detail-section-label">
        Meetings
        {meetings.length > 0 && (
          <span className="meeting-count-pill">
            {meetings.length}
            {upcoming > 0 && (
              <span className="meeting-upcoming-dot" title={`${upcoming} upcoming`} />
            )}
          </span>
        )}
      </div>

      {meetings.length > 0 && (
        <div className="meeting-list">
          {meetings.map(m => (
            <MeetingCard
              key={m.id}
              meeting={m}
              taskId={taskId}
              docs={docs}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}

      {adding ? (
        <MeetingForm
          initial={blankForm()}
          onSave={handleAdd}
          onCancel={() => setAdding(false)}
          saving={saving}
          docs={docs}
        />
      ) : (
        <button className="meeting-add-btn" onClick={() => setAdding(true)}>
          + Add meeting
        </button>
      )}

    </div>
  );
}
