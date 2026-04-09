import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
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

// ── Section config: known keys get nice labels + colors, unknown keys auto-derive ──

const KNOWN_SECTIONS: Record<string, { label: string; accent: string; placeholder: string }> = {
  pitch:             { label: "My Pitch",        accent: "#10b981", placeholder: "\"I'm a Senior Backend Engineer with 10+ years...\"" },
  rescue_phrases:    { label: "Rescue Phrases",  accent: "#ef4444", placeholder: "\"That's a great question, let me think of the best example...\"" },
  tough_questions:   { label: "Tough Questions",  accent: "#dc2626", placeholder: "\"Why are you leaving?\" → \"My engagement is winding down...\"" },
  quick_facts:       { label: "Quick Facts",      accent: "#3b82f6", placeholder: "**Comp:** $175K-$210K | **Auth:** US Citizen | **Start:** 2 weeks" },
  story_cards:       { label: "Story Cards",      accent: "#f59e0b", placeholder: "🟢 **PERFORMANCE** | 🔵 **MIGRATION** | 🟡 **MODERNIZATION**" },
  questions:         { label: "My Questions",     accent: "#8b5cf6", placeholder: "1. ... 2. ... 3. ..." },
  closing:           { label: "Closing",          accent: "#06b6d4", placeholder: "\"Thank you. What's the timeline for next steps?\"" },
  post_call:         { label: "Post-Call Notes",  accent: "#f97316", placeholder: "What they asked:\nWhat went well:\nWhat was weak:" },
  coderpad_boilerplate: { label: "CoderPad Boilerplate", accent: "#6366f1", placeholder: "import java.util.*; ..." },
};

const ACCENT_PALETTE = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899", "#6366f1", "#14b8a6"];

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSectionMeta(key: string, index: number) {
  const known = KNOWN_SECTIONS[key];
  return {
    label: known?.label ?? humanizeKey(key),
    accent: known?.accent ?? ACCENT_PALETTE[index % ACCENT_PALETTE.length],
    placeholder: known?.placeholder ?? "",
  };
}

const TYPE_LABELS: Record<string, string> = {
  phone_screen: "Phone Screen", technical: "Technical", behavioral: "Behavioral",
  panel: "Panel", onsite: "Onsite", other: "Meeting",
};

const COCKPIT_TEXT_SIZE_KEY = "jt_cockpit_text_size";

const CONTENT_SIZE_OPTIONS = [
  { id: "s", label: "Small", shortLabel: "S", scale: 0.92 },
  { id: "m", label: "Medium", shortLabel: "M", scale: 1 },
  { id: "l", label: "Large", shortLabel: "L", scale: 1.12 },
  { id: "xl", label: "XL", shortLabel: "XL", scale: 1.26 },
] as const;

type ContentSizeId = (typeof CONTENT_SIZE_OPTIONS)[number]["id"];

type ToolbarTone = "docs" | "companies" | "contacts" | "links";

type ModalResourceTone = Exclude<ToolbarTone, "links">;

type ModalResourceItem = {
  key: string;
  label: string;
  title: string;
  featured?: boolean;
  kind: "document" | "company" | "contact";
  resourceId: number;
};

type ModalResourceGroup = {
  key: string;
  label: string;
  tone: ModalResourceTone;
  items: ModalResourceItem[];
};

// ToolbarItem inferred from toolbarGroups items

function isContentSizeId(value: string | null): value is ContentSizeId {
  return CONTENT_SIZE_OPTIONS.some((option) => option.id === value);
}

function fmtDate(s: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function normalizeCockpitMarkdown(content: string): string {
  return content
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n");
}

function docChipLabel(title: string, docType: string | null | undefined): string {
  if (docType === "resume") return "Resume";
  if (docType === "cover_letter") return "Cover Letter";
  return title.length > 20 ? `${title.slice(0, 20)}...` : title;
}

function buildModalResourceGroups(task: TaskFull, meeting: Meeting): ModalResourceGroup[] {
  const documentItems: ModalResourceItem[] = [];
  const seen = new Set<number>();

  if (meeting.brief_doc_id) {
    documentItems.push({
      key: `doc-${meeting.brief_doc_id}`,
      label: "Full Briefing",
      title: "Full Briefing",
      featured: true,
      kind: "document",
      resourceId: meeting.brief_doc_id,
    });
    seen.add(meeting.brief_doc_id);
  }

  for (const doc of task.documents ?? []) {
    if (seen.has(doc.id)) continue;
    documentItems.push({
      key: `doc-${doc.id}`,
      label: docChipLabel(doc.title, doc.doc_type),
      title: doc.doc_type === "resume"
        ? "Resume"
        : doc.doc_type === "cover_letter"
          ? "Cover Letter"
          : doc.title,
      kind: "document",
      resourceId: doc.id,
    });
    seen.add(doc.id);
  }

  return [
    {
      key: "docs",
      label: "Docs",
      tone: "docs" as const,
      items: documentItems,
    },
    {
      key: "companies",
      label: task.companies && task.companies.length > 1 ? "Companies" : "Company",
      tone: "companies" as const,
      items: (task.companies?.map((company) => ({
        key: `company-${company.id}`,
        label: company.name,
        title: company.name,
        kind: "company" as const,
        resourceId: company.id,
      })) ?? []),
    },
    {
      key: "contacts",
      label: "Contacts",
      tone: "contacts" as const,
      items: (task.contacts?.map((contact) => ({
        key: `contact-${contact.id}`,
        label: contact.name,
        title: contact.name,
        kind: "contact" as const,
        resourceId: contact.id,
      })) ?? []),
    },
  ].filter((group) => group.items.length > 0);
}

// ── Modal ───────────────────────────────────────────────────────────────────

function CockpitModal({
  title,
  onClose,
  contentScale,
  switcher,
  children,
}: {
  title: string;
  onClose: () => void;
  contentScale: number;
  switcher?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return createPortal(
    <div className="ck-overlay" onClick={onClose}>
      <div
        className="ck-modal"
        style={{ "--ck-content-scale": contentScale } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`ck-modal-head${switcher ? " ck-modal-head--switcher-only" : ""}`}>
          {!switcher && <span className="ck-modal-title">{title}</span>}
          {switcher ? <div className="ck-modal-switcher-wrap">{switcher}</div> : <div />}
          <button className="ck-modal-x" onClick={onClose}>&times;</button>
        </div>
        <div className="ck-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ── Panel component ─────────────────────────────────────────────────────────

function Panel({
  label, accent, placeholder,
  content, mode, isEditing,
  onHeaderClick, onEdit, onSave, onCancel,
  editDraft, setEditDraft, saving,
}: {
  label: string; accent: string; placeholder: string;
  content: string; mode: "default" | "expanded" | "collapsed"; isEditing: boolean;
  onHeaderClick: () => void; onEdit: () => void; onSave: () => void; onCancel: () => void;
  editDraft: string; setEditDraft: (v: string) => void; saving: boolean;
}) {
  const editRef = useRef<HTMLTextAreaElement>(null);
  const normalizedContent = normalizeCockpitMarkdown(content);
  const previewText = normalizedContent.replace(/[*#|_\n]/g, " ").replace(/\s+/g, " ").trim();
  useEffect(() => { if (isEditing && editRef.current) editRef.current.focus(); }, [isEditing]);

  return (
    <article
      className={`ck-panel ck-panel--${mode}${isEditing ? " ck-panel--editing" : ""}`}
      style={{ "--accent": accent } as React.CSSProperties}
    >
      <div className="ck-panel-head" onClick={onHeaderClick}>
        <div className="ck-panel-bar" />
        <span className="ck-panel-label">{label}</span>
        {mode === "collapsed" && previewText && (
          <span className="ck-panel-preview">{previewText.slice(0, 100).trim()}</span>
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
          ) : normalizedContent ? (
            <div className="ck-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizedContent}</ReactMarkdown></div>
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
  const [sectionOrder, setSectionOrder] = useState<string[]>([]);
  const [focused, setFocused] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [contentSize, setContentSize] = useState<ContentSizeId>(() => {
    const saved = localStorage.getItem(COCKPIT_TEXT_SIZE_KEY);
    return isContentSizeId(saved) ? saved : "m";
  });
  const docCacheRef = useRef(new Map<number, DocumentFull>());
  const contactCacheRef = useRef(new Map<number, ContactFull>());
  const companyCacheRef = useRef(new Map<number, CompanyFull>());
  const [modal, setModal] = useState<{
    groups: ModalResourceGroup[];
    activeItem: ModalResourceItem;
    data?: DocumentFull | ContactFull | CompanyFull | null;
    loading: boolean;
  } | null>(null);

  const loadData = useCallback(async () => {
    const [t, meetings] = await Promise.all([tasksApi.get(taskId), meetingsApi.list(taskId)]);
    setTask(t);
    const m = meetings.find((x) => x.id === meetingId);
    if (m) {
      setMeeting(m);
      const sorted = [...(m.cockpit_sections || [])].sort((a, b) => a.position - b.position);
      const secs: Record<string, string> = {};
      const order: string[] = [];
      for (const s of sorted) {
        secs[s.section_key] = normalizeCockpitMarkdown(s.content);
        order.push(s.section_key);
      }
      setSections(secs);
      setSectionOrder(order);
    }
    requestAnimationFrame(() => setLoaded(true));
  }, [taskId, meetingId]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { localStorage.setItem(COCKPIT_TEXT_SIZE_KEY, contentSize); }, [contentSize]);

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

  async function openModalItem(item: ModalResourceItem, groups: ModalResourceGroup[]) {
    const cached = item.kind === "document"
      ? docCacheRef.current.get(item.resourceId)
      : item.kind === "contact"
        ? contactCacheRef.current.get(item.resourceId)
        : companyCacheRef.current.get(item.resourceId);

    setModal({
      groups,
      activeItem: item,
      data: cached ?? null,
      loading: !cached,
    });
    if (cached) return;

    const data = item.kind === "document"
      ? await documentsApi.get(item.resourceId)
      : item.kind === "contact"
        ? await contactsApi.get(item.resourceId)
        : await companiesApi.get(item.resourceId);

    if (item.kind === "document") docCacheRef.current.set(item.resourceId, data as DocumentFull);
    if (item.kind === "contact") contactCacheRef.current.set(item.resourceId, data as ContactFull);
    if (item.kind === "company") companyCacheRef.current.set(item.resourceId, data as CompanyFull);

    setModal((current) => {
      if (!current || current.activeItem.key !== item.key) return current;
      return {
        ...current,
        data,
        loading: false,
      };
    });
  }

  if (!task || !meeting) {
    return <div className="ck-loader"><div className="ck-loader-ring" /><span>Loading cockpit...</span></div>;
  }

  const modalResourceGroups = buildModalResourceGroups(task, meeting);
  const activeContentSize = CONTENT_SIZE_OPTIONS.find((option) => option.id === contentSize) ?? CONTENT_SIZE_OPTIONS[1];
  const companyName = task.companies?.[0]?.name || task.title.split(":")[0]?.trim() || "Meeting";
  const toolbarGroups = [
    ...modalResourceGroups.map((group) => ({
      key: group.key,
      label: group.label,
      tone: group.tone,
      items: group.items.map((item) => ({
        key: item.key,
        label: item.label,
        featured: item.featured,
        kind: "button" as const,
        onClick: () => { void openModalItem(item, modalResourceGroups); },
      })),
    })),
    {
      key: "links",
      label: "Links",
      tone: "links" as const,
      items: task.posting_url
        ? [{
            key: "job-description",
            label: "Job Description",
            kind: "link" as const,
            href: task.posting_url,
          }]
        : [],
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div
      className={`ck ${loaded ? "ck--loaded" : ""}`}
      style={{ "--ck-content-scale": activeContentSize.scale } as React.CSSProperties}
    >
      {/* Scrollable content area */}
      <div className="ck-scroll">
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
          <div className="ck-header-actions">
            <div className="ck-font-control" role="radiogroup" aria-label="Cockpit content text size">
              <span className="ck-font-control-label">Text size</span>
              <div className="ck-font-control-options">
                {CONTENT_SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`ck-font-control-btn${contentSize === option.id ? " ck-font-control-btn--active" : ""}`}
                    onClick={() => setContentSize(option.id)}
                    role="radio"
                    aria-checked={contentSize === option.id}
                    aria-label={`${option.label} content text`}
                    title={`${option.label} content text`}
                  >
                    {option.shortLabel}
                  </button>
                ))}
              </div>
            </div>
            {meeting.join_url && (
              <a className="ck-join" href={meeting.join_url} target="_blank" rel="noopener noreferrer">
                Join {meeting.platform ? meeting.platform.charAt(0).toUpperCase() + meeting.platform.slice(1) : "Call"}
              </a>
            )}
          </div>
        </header>

        {/* Dynamic sections from API, ordered by position */}
        <div className="ck-grid">
          {sectionOrder.map((key, idx) => {
            const meta = getSectionMeta(key, idx);
            return (
              <Panel
                key={key}
                label={meta.label}
                accent={meta.accent}
                placeholder={meta.placeholder}
                content={sections[key] || ""}
                mode={panelMode(key)}
                isEditing={editing === key}
                onHeaderClick={() => handlePanelClick(key)}
                onEdit={() => startEdit(key)}
                onSave={saveEdit}
                onCancel={() => setEditing(null)}
                editDraft={editDraft}
                setEditDraft={setEditDraft}
                saving={saving}
              />
            );
          })}
        </div>

        {/* Toolbar — flat single-row chips, horizontal scroll */}
        <div className="ck-toolbar">
          <div className="ck-toolbar-inner ck-toolbar-flat">
            {toolbarGroups.flatMap((group) =>
              group.items.map((item) => {
                const featured = "featured" in item && item.featured;
                const className = `ck-chip ck-chip--tone-${group.tone}${featured ? " ck-chip--featured" : ""}`;
                return item.kind === "link" ? (
                  <a key={item.key} className={className} href={item.href} target="_blank" rel="noopener noreferrer">
                    {item.label}<span className="ck-chip-external" aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <button key={item.key} className={className} onClick={item.onClick}>{item.label}</button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <CockpitModal
          title={modal.activeItem.title}
          onClose={() => setModal(null)}
          contentScale={activeContentSize.scale}
          switcher={modal.groups.reduce((sum, group) => sum + group.items.length, 0) > 1 ? (
            <div className="ck-modal-nav">
              {modal.groups.map((group) => (
                <section
                  key={group.key}
                  className={`ck-chip-group ck-chip-group--${group.tone} ck-modal-nav-group`}
                >
                  <div className="ck-chip-group-label ck-modal-nav-label">{group.label}</div>
                  <div className="ck-chip-group-chips ck-modal-nav-chips">
                    {group.items.map((item) => (
                      <button
                        key={item.key}
                        className={`ck-chip ck-modal-nav-chip${modal.activeItem.key === item.key ? " ck-modal-nav-chip--active" : ""}${item.featured ? " ck-chip--featured" : ""}`}
                        onClick={() => { void openModalItem(item, modal.groups); }}
                        disabled={modal.activeItem.key === item.key && modal.loading}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : undefined}
        >
          {modal.loading ? (
            <div className="ck-modal-loading"><div className="ck-loader-ring ck-loader-ring--sm" /></div>
          ) : modal.activeItem.kind === "document" && modal.data ? (
            <div className="ck-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{(modal.data as DocumentFull).content}</ReactMarkdown></div>
          ) : modal.activeItem.kind === "contact" && modal.data ? (
            <EntityCard data={modal.data as ContactFull} />
          ) : modal.activeItem.kind === "company" && modal.data ? (
            <EntityCard data={modal.data as CompanyFull} />
          ) : null}
        </CockpitModal>
      )}
    </div>
  );
}

function EntityCard({ data }: { data: ContactFull | CompanyFull }) {
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
