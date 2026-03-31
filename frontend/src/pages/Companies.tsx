import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { companiesApi } from "../api";
import type { CompanyBrief, CompanyFull } from "../api";
import { useProject } from "../ProjectContext";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Companies() {
  const { active: project } = useProject();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [companies, setCompanies] = useState<CompanyBrief[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [company, setCompany] = useState<CompanyFull | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

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
    companiesApi.list(project.id, params).then(setCompanies);
  }, [project, search]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (selectedId) companiesApi.get(selectedId).then(setCompany);
    else setCompany(null);
  }, [selectedId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !project) return;
    const co = await companiesApi.create(project.id, { name: newName.trim() });
    setNewName(""); setCreating(false);
    loadList();
    setSelectedId(co.id);
  }

  async function updateField(field: string, value: unknown) {
    if (!company) return;
    await companiesApi.update(company.id, { [field]: value } as any);
    companiesApi.get(company.id).then(setCompany);
    loadList();
  }

  return (
    <div className={`contacts-layout ${selectedId ? "has-detail" : ""}`}>
      <div className="contacts-list-panel">
        <div className="docs-toolbar">
          <input className="filter-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies..." />
          <button className="docs-new-btn" onClick={() => setCreating(true)}>+ New</button>
        </div>
        {creating && (
          <form className="docs-create-form" onSubmit={handleCreate}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Company name" autoFocus />
            <button type="submit">Add</button>
            <button type="button" onClick={() => setCreating(false)}>Cancel</button>
          </form>
        )}
        <div className="docs-list">
          {companies.map((co) => (
            <div key={co.id} className={`contacts-item ${co.id === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(co.id)}>
              <div className="contacts-item-info">
                <span className="contacts-item-name">{co.short_name || co.name}</span>
                {co.domain && <span className="contacts-item-company">{co.domain}</span>}
              </div>
              {co.strategic_lane && <span className="company-lane-badge">{co.strategic_lane}</span>}
            </div>
          ))}
          {companies.length === 0 && <div className="docs-empty">No companies yet</div>}
        </div>
      </div>

      {selectedId && company && (
        <div className="contacts-detail-panel">
          <div className="docs-detail-header">
            <button className="detail-delete" onClick={async () => { await companiesApi.delete(company.id); setSelectedId(null); loadList(); }}>Delete</button>
            <button className="detail-close" onClick={() => setSelectedId(null)}>&times;</button>
          </div>

          <h2 className="contacts-detail-name">{company.name}</h2>

          <div className="contacts-fields">
            <CompanyField label="Type" value={company.company_type} onSave={(v) => updateField("company_type", v)} />
            <CompanyField label="Domain" value={company.domain} onSave={(v) => updateField("domain", v)} />
            <CompanyField label="Lane" value={company.strategic_lane} onSave={(v) => updateField("strategic_lane", v)} />
            <CompanyField label="Location" value={company.location} onSave={(v) => updateField("location", v)} />
            <CompanyField label="Website" value={company.website} onSave={(v) => updateField("website", v)} link={company.website || undefined} />
          </div>

          {/* Contacts at this company */}
          {company.contacts.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-label">Contacts <span className="docs-count-badge">{company.contacts.length}</span></div>
              {company.contacts.map((c) => (
                <div key={c.id} className="docs-task-link clickable" onClick={() => navigate(`/contacts?selected=${c.id}`)}>
                  <strong>{c.name}</strong> {c.role && `— ${c.role}`}
                </div>
              ))}
            </div>
          )}

          {/* Linked tasks */}
          {company.tasks.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-label">Tasks <span className="docs-count-badge">{company.tasks.length}</span></div>
              {company.tasks.map((t) => (
                <div key={t.id} className="docs-task-link clickable" onClick={() => navigate(`/tasks?selected=${t.id}`)}>
                  <span className="task-id">{t.display_id}</span> {t.title}
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <div className="detail-section">
            <div className="detail-section-label">Notes</div>
            <div className="docs-markdown" onClick={() => {
              const n = prompt("Notes (markdown):", company.notes || "");
              if (n !== null) updateField("notes", n);
            }} style={{ cursor: "text", minHeight: 40 }}>
              {company.notes ? <Markdown remarkPlugins={[remarkGfm]}>{company.notes}</Markdown> : <span style={{ color: "var(--text-placeholder)" }}>Click to add notes...</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CompanyField({ label, value, onSave, link }: {
  label: string; value: string | null; onSave: (v: string) => void; link?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");
  if (editing) {
    return (
      <div className="contact-field">
        <span className="contact-field-label">{label}</span>
        <input className="contact-field-input" value={val} onChange={(e) => setVal(e.target.value)}
          onBlur={() => { onSave(val); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") { onSave(val); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
          autoFocus />
      </div>
    );
  }
  return (
    <div className="contact-field" onClick={() => { setVal(value || ""); setEditing(true); }}>
      <span className="contact-field-label">{label}</span>
      {value ? (link ? <a className="contact-field-value link" href={link} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>{value}</a> : <span className="contact-field-value">{value}</span>) : <span className="contact-field-value empty">Set...</span>}
    </div>
  );
}
