import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  tasksApi,
  meetingsApi,
  documentsApi,
  contactsApi,
  companiesApi,
} from "../api";
import type {
  TaskFull,
  Meeting,
  DocumentFull,
  ContactFull,
  CompanyFull,
} from "../api";

// ── Section config with grid placement ──────────────────────────────────────

const SECTIONS = [
  { key: "ready_answers", label: "Ready Answers", area: "answers", accent: "#3b82f6", placeholder: "**Comp:** $175K-$210K base\n**Auth:** US Citizen\n**Hybrid:** ...\n**Start:** ...\n**Gaps:** ..." },
  { key: "pitch", label: "My Pitch", area: "pitch", accent: "#10b981", placeholder: "\"I'm a Senior Engineer with ~10 years...\"" },
  { key: "numbers", label: "Key Numbers", area: "numbers", accent: "#f59e0b", placeholder: "| Fact | Value |\n|------|-------|\n| ... | ... |" },
  { key: "questions", label: "My Questions", area: "questions", accent: "#8b5cf6", placeholder: "1. ...\n2. ...\n3. ..." },
  { key: "closing", label: "Closing", area: "closing", accent: "#06b6d4", placeholder: "\"Thank you. Anything else? What's the timeline?\"" },
  { key: "post_call", label: "Post-Call Notes", area: "postcall", accent: "#f97316", placeholder: "What they asked:\n\nWhat went well:\n\nWhat was weak:\n\nNext steps:" },
];

const TYPE_LABELS: Record<string, string> = {
  phone_screen: "Phone Screen", technical: "Technical", behavioral: "Behavioral",
  panel: "Panel", onsite: "Onsite", other: "Meeting",
};

function fmtDate(s: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ── Modal ───────────────────────────────────────────────────────────────────

function CockpitModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="ck-overlay" onClick={onClose}>
      <div className="ck-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ck-modal-head">
          <span className="ck-modal-title">{title}</span>
          <button className="ck-modal-x" onClick={onClose}>&times;</button>
        </div>
        <div className="ck-modal-body">{children}</div>
      </div>
    </div>
  );
}

// ── Panel component ─────────────────────────────────────────────────────────

function Panel({
  sectionKey, label, accent, area, placeholder,
  content, mode, isEditing,
  onHeaderClick, onEdit, onSave, onCancel,
  editDraft, setEditDraft, saving,
}: {
  sectionKey: string; label: string; accent: string; area: string; placeholder: string;
  content: string; mode: "default" | "expanded" | "collapsed"; isEditing: boolean;
  onHeaderClick: () => void; onEdit: () => void; onSave: () => void; onCancel: () => void;
  editDraft: string; setEditDraft: (v: string) => void; saving: boolean;
}) {
  const editRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (isEditing && editRef.current) editRef.current.focus(); }, [isEditing]);

  return (
    <article
      className={`ck-panel ck-panel--${mode}${isEditing ? " ck-panel--editing" : ""}`}
      style={{ "--accent": accent, gridArea: area } as React.CSSProperties}
    >
      <div className="ck-panel-head" onClick={onHeaderClick}>
        <div className="ck-panel-bar" />
        <span className="ck-panel-label">{label}</span>
        {mode === "collapsed" && content && (
          <span className="ck-panel-preview">{content.replace(/[*#|_\n]/g, " ").slice(0, 100).trim()}</span>
        )}
        <div className="ck-panel-tools" onClick={(e) => e.stopPropagation()}>
          {!isEditing && (
            <button className="ck-btn-icon" onClick={onEdit} title="Edit">
              <svg width="14" height="14" viewBox="0 0 15 15" fill="none"><path d="M11.08 1.67a1.5 1.5 0 012.12 0l.13.13a1.5 1.5 0 010 2.12L5.5 11.75l-3 .75.75-3L11.08 1.67z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
        </div>
        <svg className="ck-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      <div className="ck-panel-body">
        <div className="ck-panel-inner">
          {isEditing ? (
            <div className="ck-edit">
              <textarea
                ref={editRef}
                className="ck-textarea"
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                placeholder={placeholder}
                onKeyDown={(e) => { if (e.key === "Escape") onCancel(); if (e.metaKey && e.key === "Enter") onSave(); }}
              />
              <div className="ck-edit-row">
                <span className="ck-edit-hint">Cmd+Enter save / Esc cancel</span>
                <button className="ck-btn ck-btn--ghost" onClick={onCancel}>Cancel</button>
                <button className="ck-btn ck-btn--primary" onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
              </div>
            </div>
          ) : content ? (
            <div className="ck-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>
          ) : (
            <div className="ck-empty" onClick={onEdit}>Click to add content</div>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function MeetingCockpit() {
  const { taskId: tid, meetingId: mid } = useParams<{ taskId: string; meetingId: string }>();
  const navigate = useNavigate();
  const taskId = Number(tid);
  const meetingId = Number(mid);

  const [task, setTask] = useState<TaskFull | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [sections, setSections] = useState<Record<string, string>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState<{ type: string; data?: DocumentFull | ContactFull | CompanyFull | null; loading?: boolean } | null>(null);

  const loadData = useCallback(async () => {
    const [t, meetings] = await Promise.all([tasksApi.get(taskId), meetingsApi.list(taskId)]);
    setTask(t);
    const m = meetings.find((x) => x.id === meetingId);
    if (m) {
      setMeeting(m);
      const secs: Record<string, string> = {};
      for (const s of m.cockpit_sections || []) secs[s.section_key] = s.content;
      setSections(secs);
    }
    requestAnimationFrame(() => setLoaded(true));
  }, [taskId, meetingId]);

  useEffect(() => { loadData(); }, [loadData]);

  function handlePanelClick(key: string) { if (!editing) setFocused(prev => prev === key ? null : key); }
  function startEdit(key: string) { setEditing(key); setEditDraft(sections[key] || ""); setFocused(key); }
  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      await meetingsApi.saveCockpitSection(taskId, meetingId, editing, editDraft);
      setSections(prev => ({ ...prev, [editing!]: editDraft }));
      setEditing(null);
    } finally { setSaving(false); }
  }
  function panelMode(key: string): "default" | "expanded" | "collapsed" {
    if (focused === null) return "default";
    return focused === key ? "expanded" : "collapsed";
  }

  async function openDoc(docId: number, label: string) {
    setModal({ type: label, loading: true });
    setModal({ type: label, data: await documentsApi.get(docId) });
  }
  async function openContact(cid: number) {
    setModal({ type: "Contact", loading: true });
    setModal({ type: "Contact", data: await contactsApi.get(cid) });
  }
  async function openCompany(cid: number) {
    setModal({ type: "Company", loading: true });
    setModal({ type: "Company", data: await companiesApi.get(cid) });
  }

  if (!task || !meeting) {
    return <div className="ck-loader"><div className="ck-loader-ring" /><span>Loading cockpit...</span></div>;
  }

  const companyName = task.companies?.[0]?.name || task.title.split(":")[0]?.trim() || "Meeting";

  return (
    <div className={`ck ${loaded ? "ck--loaded" : ""}`}>
      {/* Header */}
      <header className="ck-header">
        <button className="ck-back" onClick={() => navigate(`/tasks/${taskId}`)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div className="ck-header-text">
          <h1 className="ck-company">{companyName}</h1>
          <div className="ck-meta">
            <span className="ck-type-badge">{TYPE_LABELS[meeting.meeting_type] || meeting.meeting_type}</span>
            {meeting.scheduled_at && <span className="ck-date">{fmtDate(meeting.scheduled_at)}</span>}
            {meeting.interviewer && <span className="ck-interviewer">{meeting.interviewer}</span>}
          </div>
        </div>
        {meeting.join_url && (
          <a className="ck-join" href={meeting.join_url} target="_blank" rel="noopener noreferrer">
            Join {meeting.platform ? meeting.platform.charAt(0).toUpperCase() + meeting.platform.slice(1) : "Call"}
          </a>
        )}
      </header>

      {/* Two-column grid */}
      <div className="ck-grid">
        {SECTIONS.map((def) => (
          <Panel
            key={def.key}
            sectionKey={def.key}
            label={def.label}
            accent={def.accent}
            area={def.area}
            placeholder={def.placeholder}
            content={sections[def.key] || ""}
            mode={panelMode(def.key)}
            isEditing={editing === def.key}
            onHeaderClick={() => handlePanelClick(def.key)}
            onEdit={() => startEdit(def.key)}
            onSave={saveEdit}
            onCancel={() => setEditing(null)}
            editDraft={editDraft}
            setEditDraft={setEditDraft}
            saving={saving}
          />
        ))}
      </div>

      {/* Toolbar */}
      <div className="ck-toolbar">
        <div className="ck-toolbar-inner">
          {task.documents?.map((doc) => (
            <button key={doc.id} className="ck-chip" onClick={() => openDoc(doc.id, doc.doc_type || "Document")}>
              {doc.doc_type === "resume" ? "Resume" : doc.doc_type === "cover_letter" ? "Cover Letter" : doc.title.length > 20 ? doc.title.slice(0, 20) + "..." : doc.title}
            </button>
          ))}
          {task.companies?.map((c) => (
            <button key={c.id} className="ck-chip" onClick={() => openCompany(c.id)}>{c.name}</button>
          ))}
          {task.contacts?.map((c) => (
            <button key={c.id} className="ck-chip" onClick={() => openContact(c.id)}>{c.name}</button>
          ))}
          {meeting.brief_doc_id && (
            <button className="ck-chip ck-chip--accent" onClick={() => openDoc(meeting.brief_doc_id!, "Briefing")}>Full Briefing</button>
          )}
          {task.posting_url && (
            <a className="ck-chip" href={task.posting_url} target="_blank" rel="noopener noreferrer">Job Description</a>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <CockpitModal title={modal.type} onClose={() => setModal(null)}>
          {modal.loading ? (
            <div className="ck-modal-loading"><div className="ck-loader-ring ck-loader-ring--sm" /></div>
          ) : modal.data && "content" in modal.data ? (
            <div className="ck-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{(modal.data as DocumentFull).content}</ReactMarkdown></div>
          ) : modal.data && "linkedin" in modal.data ? (
            <EntityCard data={modal.data as ContactFull} type="contact" />
          ) : modal.data && "website" in modal.data ? (
            <EntityCard data={modal.data as CompanyFull} type="company" />
          ) : null}
        </CockpitModal>
      )}
    </div>
  );
}

function EntityCard({ data, type }: { data: ContactFull | CompanyFull; type: "contact" | "company" }) {
  const c = data as any;
  return (
    <div className="ck-entity-card">
      <h3>{c.name}</h3>
      <div className="ck-entity-grid">
        {c.role && <><span className="ck-elabel">Role</span><span>{c.role}</span></>}
        {c.company && <><span className="ck-elabel">Company</span><span>{c.company}</span></>}
        {c.email && <><span className="ck-elabel">Email</span><span>{c.email}</span></>}
        {c.phone && <><span className="ck-elabel">Phone</span><span>{c.phone}</span></>}
        {c.linkedin && <><span className="ck-elabel">LinkedIn</span><a href={c.linkedin.startsWith("http") ? c.linkedin : `https://${c.linkedin}`} target="_blank" rel="noopener noreferrer">{c.linkedin.replace(/^https?:\/\/(www\.)?/, "")}</a></>}
        {c.website && <><span className="ck-elabel">Website</span><a href={c.website} target="_blank" rel="noopener noreferrer">{c.website.replace(/^https?:\/\/(www\.)?/, "")}</a></>}
        {c.location && <><span className="ck-elabel">Location</span><span>{c.location}</span></>}
        {c.domain && <><span className="ck-elabel">Domain</span><span>{c.domain}</span></>}
        {c.department && <><span className="ck-elabel">Dept</span><span>{c.department}</span></>}
        {c.strategic_lane && <><span className="ck-elabel">Lane</span><span>{c.strategic_lane}</span></>}
      </div>
      {c.notes && <div className="ck-entity-notes ck-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{c.notes}</ReactMarkdown></div>}
    </div>
  );
}
