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
import {
  IconBack,
  IconChevronDown,
  IconEdit,
  IconSave,
  IconCancel,
  IconExternalLink,
} from "../components/icons";
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
  story_db_performance:     { label: "DB Performance",     accent: "#f59e0b", placeholder: "Problem → Options → Decision → Tradeoff → Result" },
  story_platform_migration: { label: "Platform Migration", accent: "#06b6d4", placeholder: "Platform re-seat with governance tradeoff" },
  story_java_modernization: { label: "Java Upgrade",       accent: "#ef4444", placeholder: "Dependency graph + ecosystem fragmentation" },
  story_observability:      { label: "Observability",      accent: "#10b981", placeholder: "Cross-cutting concern → platform-level framework" },
  story_test_ownership:     { label: "Test Ownership",     accent: "#8b5cf6", placeholder: "Argued call + owned fidelity tradeoff" },
  story_ai_workflow:        { label: "AI Workflow",        accent: "#ec4899", placeholder: "Approve-loop + project memory + governance" },
  story_token_sync:         { label: "Token Sync Debug",   accent: "#14b8a6", placeholder: "12-hour cycle, clock skew, pre-expiry refresh" },
  questions:         { label: "My Questions",     accent: "#8b5cf6", placeholder: "1. ... 2. ... 3. ..." },
  closing:           { label: "Closing",          accent: "#06b6d4", placeholder: "\"Thank you. What's the timeline for next steps?\"" },
  post_call:         { label: "Post-Call Notes",  accent: "#f97316", placeholder: "What they asked:\nWhat went well:\nWhat was weak:" },
  coderpad_boilerplate: { label: "CoderPad Boilerplate", accent: "#6366f1", placeholder: "import java.util.*; ..." },
};

const ACCENT_PALETTE = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899", "#6366f1", "#14b8a6"];

// ── Section emoji for quick-nav bar (first emoji from content, or default) ──
const SECTION_EMOJI: Record<string, string> = {
  // Navigation layer
  trajectory: "📍", map_compass: "🧭", objectives: "🎯", entry_signal_read: "🔍",

  // Substance layer
  quick_facts: "⚡", story_cards: "📖", pitch: "🎤",

  // Per-story cards (topic-relevant)
  story_db_performance: "🗄️",
  story_platform_migration: "☁️",
  story_java_modernization: "☕",
  story_observability: "📊",
  story_test_ownership: "🧪",
  story_ai_workflow: "🤖",
  story_token_sync: "🔑",

  // Engagement layer (branches, asks, strategy, probing)
  scenarios: "🌿", questions: "❓", question_strategy: "♟️", their_probes: "🔍",

  // Defense layer
  rescue_phrases: "🛟", tough_questions: "🔥",

  // Closure layer
  closing: "🏁", post_call: "📝",

  // Legacy keys (kept for backward compat with prior meeting cockpits)
  battle_card: "⚔️", red_team: "🎭", caller_id: "📞",
  tier1_tapan: "🟢", tier2_middle: "🟡", tier3_anupam: "🔴",
};

function getSectionEmoji(key: string, content: string): string {
  if (SECTION_EMOJI[key]) return SECTION_EMOJI[key];
  const match = content.match(/^##?\s*([\p{Emoji_Presentation}\p{Extended_Pictographic}])/u);
  if (match) return match[1];
  return "📄";
}

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
            <button className="ck-btn-icon" onClick={onEdit} title="Edit" aria-label="Edit section">
              <IconEdit size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
        <IconChevronDown className="ck-chevron" size={16} strokeWidth={1.75} aria-hidden="true" />
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
                <button className="ck-btn ck-btn--ghost" onClick={onCancel}>
                  <IconCancel size={14} strokeWidth={2} aria-hidden="true" />
                  <span>Cancel</span>
                </button>
                <button className="ck-btn ck-btn--primary" onClick={onSave} disabled={saving}>
                  <IconSave size={14} strokeWidth={2} aria-hidden="true" />
                  <span>{saving ? "Saving..." : "Save"}</span>
                </button>
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
  const panelRefs = useRef<Record<string, HTMLElement | null>>({});
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
          <button className="ck-back" onClick={() => navigate(`/tasks/${taskId}`)} aria-label="Back to task">
            <IconBack size={20} strokeWidth={2} />
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
                <IconExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                <span>Join {meeting.platform ? meeting.platform.charAt(0).toUpperCase() + meeting.platform.slice(1) : "Call"}</span>
              </a>
            )}
          </div>
        </header>

        {/* Quick-nav: sticky emoji bar for instant section jumps */}
        {sectionOrder.length > 0 && (
          <nav className="ck-quicknav" aria-label="Section quick navigation">
            <div className="ck-quicknav-strip">
            {sectionOrder.map((key) => {
              const emoji = getSectionEmoji(key, sections[key] || "");
              const label = KNOWN_SECTIONS[key]?.label ?? humanizeKey(key);
              return (
                <button
                  key={key}
                  className={`ck-quicknav-btn${focused === key ? " ck-quicknav-btn--active" : ""}`}
                  title={label}
                  aria-label={`Jump to ${label}`}
                  onClick={() => {
                    if (focused !== null) setFocused(null);
                    requestAnimationFrame(() => {
                      panelRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                  }}
                >
                  <span className="ck-quicknav-emoji">{emoji}</span>
                  <span className="ck-quicknav-label">{label}</span>
                </button>
              );
            })}
            </div>
          </nav>
        )}

        {/* Dynamic sections from API, ordered by position */}
        <div className="ck-grid">
          {sectionOrder.map((key, idx) => {
            const meta = getSectionMeta(key, idx);
            return (
              <div key={key} ref={(el) => { panelRefs.current[key] = el; }}>
                <Panel
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
              </div>
            );
          })}
        </div>

        {/* Toolbar — flat single-row chips, horizontal scroll */}
        <div className="ck-toolbar">
          <div className="ck-toolbar-flat">
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
            <div className="ck-modal-nav ck-toolbar-flat">
              {modal.groups.flatMap((group) =>
                group.items.map((item) => (
                  <button
                    key={item.key}
                    className={`ck-chip ck-chip--tone-${group.tone} ck-modal-nav-chip${modal.activeItem.key === item.key ? " ck-modal-nav-chip--active" : ""}${"featured" in item && item.featured ? " ck-chip--featured" : ""}`}
                    onClick={() => { void openModalItem(item, modal.groups); }}
                    disabled={modal.activeItem.key === item.key && modal.loading}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))
              )}
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
