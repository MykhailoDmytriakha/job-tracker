import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { companiesApi, searchApi } from "../api";
import type { CompanyBrief, CompanyFull } from "../api";
import { useProject } from "../ProjectContext";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type SortKey = "name" | "domain" | "updated" | "lane";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name",    label: "Name A→Z" },
  { key: "domain",  label: "Domain"   },
  { key: "updated", label: "Updated"  },
  { key: "lane",    label: "Lane"     },
];

function sortCompanies(companies: CompanyBrief[], sortBy: SortKey): CompanyBrief[] {
  return [...companies].sort((a, b) => {
    switch (sortBy) {
      case "name":    return (a.short_name || a.name).localeCompare(b.short_name || b.name);
      case "domain":  return (a.domain || "").localeCompare(b.domain || "");
      case "updated": return (b.updated_at || "").localeCompare(a.updated_at || "");
      case "lane":    return (a.strategic_lane || "").localeCompare(b.strategic_lane || "");
      default:        return 0;
    }
  });
}

export function Companies() {
  const { active: project } = useProject();
  const { companyId } = useParams<{ companyId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedId = companyId ? Number(companyId) : null;

  const [companies, setCompanies] = useState<CompanyBrief[]>([]);
  const [company, setCompany] = useState<CompanyFull | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchHints, setSearchHints] = useState<Record<string, number>>({});
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  // Backward compat: ?selected= → /companies/:id
  useEffect(() => {
    const sel = searchParams.get("selected");
    if (sel) navigate(`/companies/${sel}`, { replace: true });
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
        if (g.entity_type !== "company" && g.entity_type !== "activity" && g.count > 0) {
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
    companiesApi.list(project.id, params).then(setCompanies);
  }, [project, debouncedSearch]);

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
    navigate(`/companies/${co.id}`);
  }

  async function updateField(field: string, value: unknown) {
    if (!company) return;
    await companiesApi.update(company.id, { [field]: value } as any);
    companiesApi.get(company.id).then(setCompany);
    loadList();
  }

  const sorted = sortCompanies(companies, sortBy);

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
                placeholder="Search companies..."
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
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Company name" autoFocus />
            <button type="submit">Add</button>
            <button type="button" onClick={() => setCreating(false)}>Cancel</button>
          </form>
        )}

        <div className="docs-list">
          {sorted.map((co) => (
            <div
              key={co.id}
              className={`contacts-item ${co.id === selectedId ? "selected" : ""}`}
              onClick={() => navigate(`/companies/${co.id}`)}
            >
              <div className="contacts-item-info">
                <span className="contacts-item-name">{co.short_name || co.name}</span>
                {co.domain && <span className="contacts-item-company">{co.domain}</span>}
              </div>
              {co.strategic_lane && <span className="company-lane-badge">{co.strategic_lane}</span>}
            </div>
          ))}
          {sorted.length === 0 && <div className="docs-empty">No companies yet</div>}
        </div>
      </div>

      {selectedId && company && (
        <div className="contacts-detail-panel">
          <div className="docs-detail-header">
            <button className="detail-close" onClick={() => navigate("/companies")} title="Back to list">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
            <button className="detail-delete" onClick={async () => { await companiesApi.delete(company.id); loadList(); navigate("/companies"); }}>Delete</button>
          </div>

          <h2 className="contacts-detail-name">{company.name}</h2>

          <div className="contacts-fields">
            <CompanyField label="Type" value={company.company_type} onSave={(v) => updateField("company_type", v)} />
            <CompanyField label="Domain" value={company.domain} onSave={(v) => updateField("domain", v)} />
            <CompanyField label="Lane" value={company.strategic_lane} onSave={(v) => updateField("strategic_lane", v)} hint="Comma-separated, e.g. Healthcare IT, Payer" />
            <CompanyField label="Location" value={company.location} onSave={(v) => updateField("location", v)} />
            <CompanyField label="Website" value={company.website} onSave={(v) => updateField("website", v)} link={company.website || undefined} />
          </div>

          {company.contacts.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-label">Contacts <span className="docs-count-badge">{company.contacts.length}</span></div>
              {company.contacts.map((c) => (
                <div key={c.id} className="docs-task-link clickable" onClick={() => navigate(`/contacts/${c.id}`)}>
                  <strong>{c.name}</strong> {c.role && `— ${c.role}`}
                </div>
              ))}
            </div>
          )}

          {company.tasks.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-label">Tasks <span className="docs-count-badge">{company.tasks.length}</span></div>
              {company.tasks.map((t) => (
                <div key={t.id} className="docs-task-link clickable" onClick={() => navigate(`/tasks/${t.id}`)}>
                  <span className="task-id">{t.display_id}</span> {t.title}
                </div>
              ))}
            </div>
          )}

          <div className="detail-section">
            <div className="detail-section-label">Notes</div>
            <div className="docs-markdown" onClick={() => {
              const n = prompt("Notes (markdown):", company.notes || "");
              if (n !== null) updateField("notes", n);
            }} style={{ cursor: "text", minHeight: 40 }}>
              {company.notes
                ? <Markdown remarkPlugins={[remarkGfm]} components={{ a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>{company.notes}</Markdown>
                : <span style={{ color: "var(--text-placeholder)" }}>Click to add notes...</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CompanyField({ label, value, onSave, link, hint }: {
  label: string; value: string | null; onSave: (v: string) => void; link?: string; hint?: string;
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
      <span className="contact-field-label">
        {label}
        {hint && <span className="field-hint-icon" title={hint}>&#9432;</span>}
      </span>
      {value ? (link ? <a className="contact-field-value link" href={link} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>{value}</a> : <span className="contact-field-value">{value}</span>) : <span className="contact-field-value empty">Set...</span>}
    </div>
  );
}
