import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { contactsApi } from "../api";
import type { ContactBrief, ContactFull } from "../api";
import { useProject } from "../ProjectContext";

const CONTACT_TYPES = ["colleague", "recruiter", "manager", "reference", "hiring_manager"];
const CHANNELS = ["email", "linkedin", "teams", "phone", "in_person"];

export function Contacts() {
  const { active: project } = useProject();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contacts, setContacts] = useState<ContactBrief[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [contact, setContact] = useState<ContactFull | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newType, setNewType] = useState("");
  const [interSummary, setInterSummary] = useState("");
  const [interChannel, setInterChannel] = useState("");

  useEffect(() => {
    const sel = searchParams.get("selected");
    if (sel) {
      setSelectedId(Number(sel));
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadList = useCallback(() => {
    if (!project) return;
    const params: Record<string, string> = {};
    if (search.trim()) params.q = search.trim();
    if (typeFilter) params.contact_type = typeFilter;
    contactsApi.list(project.id, params).then(setContacts);
  }, [project, search, typeFilter]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (selectedId) {
      contactsApi.get(selectedId).then(setContact);
    } else {
      setContact(null);
    }
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
    setSelectedId(c.id);
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
    setSelectedId(null);
    loadList();
  }

  return (
    <div className={`contacts-layout ${selectedId ? "has-detail" : ""}`}>
      <div className="contacts-list-panel">
        <div className="docs-toolbar">
          <input className="filter-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." />
          <button className="docs-new-btn" onClick={() => setCreating(true)}>+ New</button>
        </div>
        <div className="docs-type-filter">
          {CONTACT_TYPES.map((t) => (
            <button key={t} className={`filter-chip ${typeFilter === t ? "active" : ""}`} onClick={() => setTypeFilter(typeFilter === t ? null : t)}>
              {t.replace("_", " ")}
            </button>
          ))}
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
          {contacts.map((c) => (
            <div key={c.id} className={`contacts-item ${c.id === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(c.id)}>
              <div className="contacts-item-info">
                <span className="contacts-item-name">{c.name}</span>
                {c.company && <span className="contacts-item-company">{c.company}</span>}
              </div>
              {c.contact_type && <span className={`contact-type-badge ctype-${c.contact_type}`}>{c.contact_type.replace("_", " ")}</span>}
            </div>
          ))}
          {contacts.length === 0 && <div className="docs-empty">No contacts yet</div>}
        </div>
      </div>

      {selectedId && contact && (
        <div className="contacts-detail-panel">
          <div className="docs-detail-header">
            <button className="detail-delete" onClick={handleDelete}>Delete</button>
            <button className="detail-close" onClick={() => setSelectedId(null)}>&times;</button>
          </div>

          {/* Profile fields */}
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

          {/* Notes */}
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

          {/* Interactions timeline */}
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

          {/* Linked tasks */}
          {contact.tasks.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-label">Linked Tasks</div>
              {contact.tasks.map((t) => (
                <div key={t.id} className="docs-task-link">
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
