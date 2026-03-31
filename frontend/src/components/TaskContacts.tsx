import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { contactsApi } from "../api";
import type { ContactBrief } from "../api";
import { highlight } from "../utils/highlight";

export function TaskContacts({
  taskId, contacts, projectId, onUpdate, searchTerm = "",
}: {
  taskId: number; contacts: ContactBrief[]; projectId: number; onUpdate: () => void; searchTerm?: string;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"idle" | "link" | "create">("idle");
  const [search, setSearch] = useState("");
  const [allContacts, setAllContacts] = useState<ContactBrief[]>([]);
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMode("idle");
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function openLinkPicker() {
    setAllContacts(await contactsApi.list(projectId));
    setMode("link"); setSearch("");
  }

  const linkedIds = new Set(contacts.map(c => c.id));
  const filtered = allContacts.filter(c => !linkedIds.has(c.id)).filter(c => !search.trim() || c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10);

  return (
    <div className="detail-section" ref={ref}>
      <div className="detail-section-label">
        Contacts
        {contacts.length > 0 && <span className="docs-count-badge">{contacts.length}</span>}
      </div>
      {contacts.length > 0 && (
        <div className="task-contacts-list">
          {contacts.map(c => (
            <div key={c.id} className="task-contact-item">
              <span className="task-contact-name" onClick={() => navigate(`/contacts?selected=${c.id}`)}>{highlight(c.name, searchTerm)}</span>
              {c.company && <span className="task-contact-company">{c.company}</span>}
              {c.contact_type && <span className={`contact-type-badge small ctype-${c.contact_type}`}>{c.contact_type.replace("_"," ")}</span>}
              <button className="task-doc-unlink" onClick={async () => { await contactsApi.unlinkFromTask(taskId, c.id); onUpdate(); }}>&times;</button>
            </div>
          ))}
        </div>
      )}
      {mode === "idle" && (
        <div className="task-docs-actions">
          <button className="task-docs-btn" onClick={openLinkPicker}>Link existing...</button>
          <button className="task-docs-btn" onClick={() => setMode("create")}>+ Create new</button>
        </div>
      )}
      {mode === "link" && (
        <div className="task-docs-picker">
          <input className="dep-search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..." autoFocus />
          <div className="dep-picker">
            {filtered.length === 0 ? <div className="dep-picker-empty">No matching contacts</div> : filtered.map(c => (
              <div key={c.id} className="dep-picker-item" onClick={async () => { await contactsApi.linkToTask(taskId, c.id); setMode("idle"); onUpdate(); }}>
                <span className="dep-picker-title">{c.name}</span>
                {c.company && <span className="dep-picker-status">{c.company}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {mode === "create" && (
        <form className="task-docs-create" onSubmit={async e => {
          e.preventDefault(); if (!newName.trim()) return;
          const c = await contactsApi.create(projectId, { name: newName.trim(), company: newCompany.trim() || undefined });
          await contactsApi.linkToTask(taskId, c.id);
          setNewName(""); setNewCompany(""); setMode("idle"); onUpdate();
        }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" autoFocus />
          <input value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="Company" style={{ width: 100 }} />
          <button type="submit">Create</button>
          <button type="button" onClick={() => setMode("idle")}>Cancel</button>
        </form>
      )}
    </div>
  );
}
