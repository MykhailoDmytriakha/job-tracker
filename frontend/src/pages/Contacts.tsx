import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { contactsApi, searchApi } from "../api";
import type { ContactBrief, ContactFull } from "../api";
import { useProject } from "../ProjectContext";

const CONTACT_TYPES = ["colleague", "recruiter", "manager", "reference", "hiring_manager"];
const CHANNELS = ["email", "linkedin", "teams", "phone", "in_person"];

type SortKey = "name" | "company" | "updated" | "type";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name",    label: "Name A→Z"  },
  { key: "company", label: "Company"   },
  { key: "updated", label: "Updated"   },
  { key: "type",    label: "Type"      },
];

function sortContacts(contacts: ContactBrief[], sortBy: SortKey): ContactBrief[] {
  return [...contacts].sort((a, b) => {
    switch (sortBy) {
      case "name":    return a.name.localeCompare(b.name);
      case "company": return (a.company || "").localeCompare(b.company || "");
      case "updated": return (b.updated_at || "").localeCompare(a.updated_at || "");
      case "type":    return (a.contact_type || "").localeCompare(b.contact_type || "");
      default:        return 0;
    }
  });
}

export function Contacts() {
  const { active: project } = useProject();
  const { contactId } = useParams<{ contactId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedId = contactId ? Number(contactId) : null;

  const [contacts, setContacts] = useState<ContactBrief[]>([]);
  const [contact, setContact] = useState<ContactFull | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchHints, setSearchHints] = useState<Record<string, number>>({});
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newType, setNewType] = useState("");
  const [interSummary, setInterSummary] = useState("");
  const [interChannel, setInterChannel] = useState("");

  // Backward compat: ?selected= → /contacts/:id
  useEffect(() => {
    const sel = searchParams.get("selected");
    if (sel) navigate(`/contacts/${sel}`, { replace: true });
  }, [searchParams, navigate]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Cross-entity search hints
  useEffect(() => {
    if (!project || debouncedSearch.length < 2) { setSearchHints({}); return; }
    searchApi.search(project.id, debouncedSearch).then((res) => {
      const hints: Record<string, number> = {};
      for (const g of res.groups) {
        if (g.entity_type !== "contact" && g.entity_type !== "activity" && g.count > 0) {
          hints[g.entity_type] = g.count;
        }
      }
      setSearchHints(hints);
    }).catch(() => setSearchHints({}));
  }, [debouncedSearch, project]);

  const loadList = useCallback(() => {
    if (!project) return;
    const params: Record<string, string> = {};
    if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
    if (typeFilter) params.contact_type = typeFilter;
    contactsApi.list(project.id, params).then(setContacts);
  }, [project, debouncedSearch, typeFilter]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (selectedId) contactsApi.get(selectedId).then(setContact);
    else setContact(null);
  }, [selectedId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !project) return;
    const c = await contactsApi.create(project.id, {
      name: newName.trim(), company: newCompany.trim() || undefined,
      contact_type: newType || undefined,
    });
    setNewName(""); setNewCompany(""); setNewType("");
    setCreating(false);
    loadList();
    navigate(`/contacts/${c.id}`);
  }

  async function updateField(field: string, value: unknown) {
    if (!contact) return;
    await contactsApi.update(contact.id, { [field]: value } as any);
    const updated = await contactsApi.get(contact.id);
    setContact(updated);
    loadList();
  }

  async function addInteraction(e: React.FormEvent) {
    e.preventDefault();
    if (!contact || !interSummary.trim()) return;
    await contactsApi.addInteraction(contact.id, {
      summary: interSummary.trim(),
      channel: interChannel || undefined,
      direction: "outbound",
    });
    setInterSummary(""); setInterChannel("");
    const updated = await contactsApi.get(contact.id);
    setContact(updated);
  }

  async function handleDelete() {
    if (!contact) return;
    await contactsApi.delete(contact.id);
    loadList();
    navigate("/contacts");
  }

  const sorted = sortContacts(contacts, sortBy);

  return (
    <div className={`contacts-layout ${selectedId ? "has-detail" : ""}`}>
      <div className="contacts-list-panel">
        <div className="tasks-toolbar">
          <div className="tasks-toolbar-row1">
            <div className="search-wrap">
              <input
                className="filter-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contacts..."
                style={search ? { paddingRight: 30 } : undefined}
              />
              {search && (
                <button className="search-clear" onClick={() => setSearch("")} title="Clear search" aria-label="Clear search">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>
            <button className="docs-new-btn" onClick={() => setCreating(true)}>+ New</button>
          </div>

          {Object.keys(searchHints).length > 0 && (
            <div className="search-hints">
              Also in:&nbsp;
              {Object.entries(searchHints).map(([type, count], i, arr) => (
                <span key={type}>
                  <span className="search-hint-chip">{count} {type}{count !== 1 ? "s" : ""}</span>
                  {i < arr.length - 1 && " "}
                </span>
              ))}
            </div>
          )}

          <div className="tasks-toolbar-row2">
            {CONTACT_TYPES.map((t) => (
              <button
                key={t}
                className={`filter-chip ${typeFilter === t ? "active" : ""}`}
                onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              >
                {t.replace("_", " ")}
              </button>
            ))}
            {typeFilter && (
              <button className="filter-chip filter-clear" onClick={() => setTypeFilter(null)}>×</button>
            )}
            <div className="toolbar-divider" />
            <div className="sort-control">
              <svg className="sort-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 3h8M3 6h6M4 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {creating && (
          <form className="docs-create-form" onSubmit={handleCreate}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" autoFocus />
            <input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="Company" style={{ width: 100 }} />
            <select value={newType} onChange={(e) => setNewType(e.target.value)}>
              <option value="">Type</option>
              {CONTACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="submit">Add</button>
            <button type="button" onClick={() => setCreating(false)}>Cancel</button>
          </form>
        )}

        <div className="docs-list">
          {sorted.map((c) => (
            <div
              key={c.id}
              className={`contacts-item ${c.id === selectedId ? "selected" : ""}`}
              onClick={() => navigate(`/contacts/${c.id}`)}
            >
              <div className="contacts-item-info">
                <span className="contacts-item-name">{c.name}</span>
                {c.company && <span className="contacts-item-company">{c.company}</span>}
              </div>
              {c.contact_type && <span className={`contact-type-badge ctype-${c.contact_type}`}>{c.contact_type.replace("_", " ")}</span>}
            </div>
          ))}
          {sorted.length === 0 && <div className="docs-empty">No contacts yet</div>}
        </div>
      </div>

      {selectedId && contact && (
        <div className="contacts-detail-panel">
          <div className="docs-detail-header">
            <button className="detail-close" onClick={() => navigate("/contacts")} title="Back to list">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
            <button className="detail-delete" onClick={handleDelete}>Delete</button>
          </div>

          <h2 className="contacts-detail-name">{contact.name}</h2>
          {contact.contact_type && <span className={`contact-type-badge ctype-${contact.contact_type}`}>{contact.contact_type.replace("_", " ")}</span>}

          <div className="contacts-fields">
            <ContactField label="Company" value={contact.company} onSave={(v) => updateField("company", v)} />
            <ContactField label="Role" value={contact.role} onSave={(v) => updateField("role", v)} />
            <ContactField label="Email" value={contact.email} onSave={(v) => updateField("email", v)} link={contact.email ? `mailto:${contact.email}` : undefined} />
            <ContactField label="Phone" value={contact.phone} onSave={(v) => updateField("phone", v)} />
            <ContactField label="LinkedIn" value={contact.linkedin} onSave={(v) => updateField("linkedin", v)} link={contact.linkedin || undefined} />
            <ContactField label="Location" value={contact.location} onSave={(v) => updateField("location", v)} />
            <ContactField label="Department" value={contact.department} onSave={(v) => updateField("department", v)} />
          </div>

          <div className="detail-section">
            <div className="detail-section-label">Notes</div>
            <div
              className="detail-description"
              onClick={() => {
                const n = prompt("Notes:", contact.notes || "");
                if (n !== null) updateField("notes", n);
              }}
            >
              {contact.notes || "Click to add notes..."}
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-label">
              Interactions
              {contact.interactions.length > 0 && <span className="docs-count-badge">{contact.interactions.length}</span>}
            </div>
            <form className="interaction-form" onSubmit={addInteraction}>
              <input value={interSummary} onChange={(e) => setInterSummary(e.target.value)} placeholder="What happened?" />
              <select value={interChannel} onChange={(e) => setInterChannel(e.target.value)}>
                <option value="">Channel</option>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="submit">Log</button>
            </form>
            {contact.interactions.map((i) => (
              <div key={i.id} className="interaction-item">
                <div className="interaction-meta">
                  {i.channel && <span className={`interaction-channel ch-${i.channel}`}>{i.channel}</span>}
                  {i.direction && <span className="interaction-direction">{i.direction === "outbound" ? "\u2192" : "\u2190"}</span>}
                  <span className="interaction-date">{new Date(i.date).toLocaleDateString()}</span>
                </div>
                <div className="interaction-summary">{i.summary}</div>
              </div>
            ))}
          </div>

          {contact.tasks.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-label">Linked Tasks</div>
              {contact.tasks.map((t) => (
                <div key={t.id} className="docs-task-link clickable" onClick={() => navigate(`/tasks/${t.id}`)}>
                  <span className="task-id">{t.display_id}</span> {t.title}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContactField({ label, value, onSave, link }: {
  label: string; value: string | null; onSave: (v: string) => void; link?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");

  if (editing) {
    return (
      <div className="contact-field">
        <span className="contact-field-label">{label}</span>
        <input
          className="contact-field-input"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => { onSave(val); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") { onSave(val); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="contact-field" onClick={() => { setVal(value || ""); setEditing(true); }}>
      <span className="contact-field-label">{label}</span>
      {value ? (
        link ? <a className="contact-field-value link" href={link} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>{value}</a>
        : <span className="contact-field-value">{value}</span>
      ) : (
        <span className="contact-field-value empty">Set...</span>
      )}
    </div>
  );
}
