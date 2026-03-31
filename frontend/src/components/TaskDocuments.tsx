import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { documentsApi } from "../api";
import type { DocumentBrief } from "../api";
import { highlight } from "../utils/highlight";

export function TaskDocuments({
  taskId,
  documents,
  projectId,
  onUpdate,
  searchTerm = "",
}: {
  taskId: number;
  documents: DocumentBrief[];
  projectId: number;
  onUpdate: () => void;
  searchTerm?: string;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"idle" | "link" | "create">("idle");
  const [search, setSearch] = useState("");
  const [allDocs, setAllDocs] = useState<DocumentBrief[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMode("idle");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function openLinkPicker() {
    const docs = await documentsApi.list(projectId);
    setAllDocs(docs);
    setMode("link");
    setSearch("");
  }

  const linkedIds = new Set(documents.map((d) => d.id));
  const filtered = allDocs
    .filter((d) => !linkedIds.has(d.id))
    .filter((d) => !search.trim() || d.title.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 10);

  async function linkDoc(docId: number) {
    await documentsApi.linkToTask(taskId, docId);
    setMode("idle");
    onUpdate();
  }

  async function unlinkDoc(docId: number) {
    await documentsApi.unlinkFromTask(taskId, docId);
    onUpdate();
  }

  async function createAndLink(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const doc = await documentsApi.create(projectId, {
      title: newTitle.trim(),
      content: newContent,
      doc_type: newType || undefined,
    });
    await documentsApi.linkToTask(taskId, doc.id);
    setNewTitle("");
    setNewContent("");
    setNewType("");
    setMode("idle");
    onUpdate();
    // Navigate to the new doc for editing
    navigate(`/docs?selected=${doc.id}`);
  }

  return (
    <div className="detail-section" ref={ref}>
      <div className="detail-section-label">
        Documents
        {documents.length > 0 && (
          <span className="docs-count-badge">{documents.length}</span>
        )}
      </div>

      {/* Linked documents list */}
      {documents.length > 0 && (
        <div className="task-docs-list">
          {documents.map((d) => (
            <div key={d.id} className="task-doc-item">
              <span
                className="task-doc-title"
                onClick={() => navigate(`/docs?selected=${d.id}`)}
                title="Open document"
              >
                {highlight(d.title, searchTerm)}
              </span>
              {d.doc_type && (
                <span className={`docs-type-badge type-${d.doc_type}`}>{d.doc_type}</span>
              )}
              <button
                className="task-doc-unlink"
                onClick={() => unlinkDoc(d.id)}
                title="Unlink document"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {mode === "idle" && (
        <div className="task-docs-actions">
          <button className="task-docs-btn" onClick={openLinkPicker}>
            Link existing...
          </button>
          <button className="task-docs-btn" onClick={() => setMode("create")}>
            + Create new
          </button>
        </div>
      )}

      {/* Link picker */}
      {mode === "link" && (
        <div className="task-docs-picker">
          <input
            className="dep-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            autoFocus
          />
          <div className="dep-picker">
            {filtered.length === 0 ? (
              <div className="dep-picker-empty">No matching documents</div>
            ) : (
              filtered.map((d) => (
                <div key={d.id} className="dep-picker-item" onClick={() => linkDoc(d.id)}>
                  <span className="dep-picker-title">{d.title}</span>
                  {d.doc_type && (
                    <span className={`docs-type-badge type-${d.doc_type}`}>{d.doc_type}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Create new document inline */}
      {mode === "create" && (
        <form className="task-docs-create" onSubmit={createAndLink}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Document title..."
            autoFocus
          />
          <select value={newType} onChange={(e) => setNewType(e.target.value)}>
            <option value="">Type...</option>
            <option value="research">Research</option>
            <option value="playbook">Playbook</option>
            <option value="reference">Reference</option>
            <option value="journal">Journal</option>
          </select>
          <button type="submit">Create</button>
          <button type="button" onClick={() => setMode("idle")}>Cancel</button>
        </form>
      )}
    </div>
  );
}
