import { useState } from "react";
import { projectsApi } from "../api";
import { useProject } from "../ProjectContext";

export function Welcome() {
  const { reload, setActiveId } = useProject();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !key.trim()) return;
    setError("");
    try {
      const p = await projectsApi.create({
        name: name.trim(),
        short_key: key.trim().toUpperCase(),
      });
      setActiveId(p.id);
      reload();
    } catch (err: any) {
      setError(err?.body ? JSON.parse(err.body).detail : "Failed to create project");
    }
  }

  // Auto-generate key from name
  function handleNameChange(v: string) {
    setName(v);
    if (!key || key === autoKey(name)) {
      setKey(autoKey(v));
    }
  }

  function autoKey(n: string): string {
    return n.trim().split(/\s+/).map(w => w[0] || "").join("").toUpperCase().slice(0, 5);
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1 className="welcome-title">Welcome to Job Tracker</h1>
        <p className="welcome-desc">
          Create your first project to get started. A project groups related tasks
          together — like a job search, career track, or specific goal.
        </p>

        <form className="welcome-form" onSubmit={handleCreate}>
          <div className="welcome-field">
            <label>Project Name</label>
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. ELEKS Job Search 2026"
              autoFocus
            />
          </div>
          <div className="welcome-field">
            <label>Short Key <span className="welcome-hint">2-5 letters, used as task prefix</span></label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              placeholder="e.g. ELK"
              maxLength={5}
              style={{ textTransform: "uppercase", width: 120 }}
            />
          </div>
          {key && name && (
            <div className="welcome-preview">
              Tasks will be numbered: <strong>{key.toUpperCase()}-1</strong>, <strong>{key.toUpperCase()}-2</strong>, ...
            </div>
          )}
          {error && <div className="welcome-error">{error}</div>}
          <button type="submit" className="welcome-btn" disabled={!name.trim() || !key.trim()}>
            Create Project
          </button>
        </form>

        <p className="welcome-future">
          In the future, you'll be able to choose from templates with pre-built task lists.
        </p>
      </div>
    </div>
  );
}
