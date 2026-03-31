import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { companiesApi } from "../api";
import type { CompanyBrief } from "../api";
import { highlight } from "../utils/highlight";

export function TaskCompanies({
  taskId, companies, projectId, onUpdate, searchTerm = "",
}: {
  taskId: number; companies: CompanyBrief[]; projectId: number; onUpdate: () => void; searchTerm?: string;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"idle" | "link" | "create">("idle");
  const [search, setSearch] = useState("");
  const [allCompanies, setAllCompanies] = useState<CompanyBrief[]>([]);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMode("idle");
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function openLinkPicker() {
    setAllCompanies(await companiesApi.list(projectId));
    setMode("link"); setSearch("");
  }

  const linkedIds = new Set(companies.map(c => c.id));
  const filtered = allCompanies.filter(c => !linkedIds.has(c.id)).filter(c => !search.trim() || c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10);

  return (
    <div className="detail-section" ref={ref}>
      <div className="detail-section-label">
        Companies
        {companies.length > 0 && <span className="docs-count-badge">{companies.length}</span>}
      </div>
      {companies.length > 0 && (
        <div className="task-contacts-list">
          {companies.map(co => (
            <div key={co.id} className="task-contact-item">
              <span className="task-contact-name" onClick={() => navigate(`/companies?selected=${co.id}`)}>{highlight(co.name, searchTerm)}</span>
              {co.domain && <span className="task-contact-company">{co.domain}</span>}
              <button className="task-doc-unlink" onClick={async () => { await companiesApi.unlinkFromTask(taskId, co.id); onUpdate(); }}>&times;</button>
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
          <input className="dep-search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..." autoFocus />
          <div className="dep-picker">
            {filtered.length === 0 ? <div className="dep-picker-empty">No matching companies</div> : filtered.map(co => (
              <div key={co.id} className="dep-picker-item" onClick={async () => { await companiesApi.linkToTask(taskId, co.id); setMode("idle"); onUpdate(); }}>
                <span className="dep-picker-title">{co.name}</span>
                {co.domain && <span className="dep-picker-status">{co.domain}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {mode === "create" && (
        <form className="task-docs-create" onSubmit={async e => {
          e.preventDefault(); if (!newName.trim()) return;
          const co = await companiesApi.create(projectId, { name: newName.trim() });
          await companiesApi.linkToTask(taskId, co.id);
          setNewName(""); setMode("idle"); onUpdate();
        }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Company name" autoFocus />
          <button type="submit">Create</button>
          <button type="button" onClick={() => setMode("idle")}>Cancel</button>
        </form>
      )}
    </div>
  );
}
