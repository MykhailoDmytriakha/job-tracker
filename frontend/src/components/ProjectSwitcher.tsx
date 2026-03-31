import { useState, useRef, useEffect } from "react";
import { useProject } from "../ProjectContext";
import { projectsApi } from "../api";

export function ProjectSwitcher() {
  const { projects, active, setActiveId, reload } = useProject();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !key.trim()) return;
    const p = await projectsApi.create({ name: name.trim(), short_key: key.trim().toUpperCase() });
    setName("");
    setKey("");
    setCreating(false);
    setOpen(false);
    reload();
    setActiveId(p.id);
  }

  if (!active) return null;

  return (
    <div className="project-switcher" ref={ref}>
      <button className="project-trigger" onClick={() => setOpen(!open)}>
        <span className="project-key">{active.short_key}</span>
        <span className="project-name">{active.name}</span>
        <svg className="project-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="project-dropdown">
          {projects.map((p) => (
            <button
              key={p.id}
              className={`project-option ${p.id === active.id ? "active" : ""}`}
              onClick={() => { setActiveId(p.id); setOpen(false); }}
            >
              <span className="project-option-key">{p.short_key}</span>
              <span className="project-option-name">{p.name}</span>
            </button>
          ))}

          <div className="project-dropdown-divider" />

          {!creating ? (
            <button className="project-option new" onClick={() => setCreating(true)}>
              + New project
            </button>
          ) : (
            <form className="project-inline-create" onSubmit={handleCreate}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus />
              <input value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="KEY" maxLength={5} style={{ width: 50, textTransform: "uppercase" }} />
              <button type="submit">OK</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
