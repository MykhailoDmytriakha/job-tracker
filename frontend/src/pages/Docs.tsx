import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { documentsApi } from "../api";
import type { DocumentBrief, DocumentFull } from "../api";
import { useProject } from "../ProjectContext";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const DOC_TYPES = ["research", "playbook", "reference", "journal"];

export function Docs() {
  const { active: project } = useProject();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentBrief[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [doc, setDoc] = useState<DocumentFull | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editType, setEditType] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

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
    if (typeFilter) params.doc_type = typeFilter;
    documentsApi.list(project.id, params).then(setDocs);
  }, [project, search, typeFilter]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (selectedId) {
      documentsApi.get(selectedId).then(setDoc);
      setEditing(false);
    } else {
      setDoc(null);
    }
  }, [selectedId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !project) return;
    const created = await documentsApi.create(project.id, { title: newTitle.trim() });
    setNewTitle("");
    setCreating(false);
    loadList();
    setSelectedId(created.id);
    setEditing(true);
  }

  function startEdit() {
    if (!doc) return;
    setEditTitle(doc.title);
    setEditContent(doc.content);
    setEditType(doc.doc_type || "");
    setEditing(true);
  }

  async function saveEdit() {
    if (!doc) return;
    await documentsApi.update(doc.id, {
      title: editTitle,
      content: editContent,
      doc_type: editType || null,
    });
    const updated = await documentsApi.get(doc.id);
    setDoc(updated);
    setEditing(false);
    loadList();
  }

  async function handleDelete() {
    if (!doc) return;
    await documentsApi.delete(doc.id);
    setSelectedId(null);
    loadList();
  }

  return (
    <div className={`docs-layout ${selectedId ? "has-detail" : ""}`}>
      <div className="docs-list-panel">
        <div className="docs-toolbar">
          <input
            className="filter-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search docs..."
          />
          <button className="docs-new-btn" onClick={() => setCreating(true)}>+ New</button>
        </div>

        <div className="docs-type-filter">
          {DOC_TYPES.map((t) => (
            <button
              key={t}
              className={`filter-chip ${typeFilter === t ? "active" : ""}`}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>

        {creating && (
          <form className="docs-create-form" onSubmit={handleCreate}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Document title..." autoFocus />
            <button type="submit">Create</button>
            <button type="button" onClick={() => setCreating(false)}>Cancel</button>
          </form>
        )}

        <div className="docs-list">
          {docs.map((d) => (
            <div
              key={d.id}
              className={`docs-item ${d.id === selectedId ? "selected" : ""}`}
              onClick={() => setSelectedId(d.id)}
            >
              <span className="docs-item-title">{d.title}</span>
              {d.doc_type && <span className={`docs-type-badge type-${d.doc_type}`}>{d.doc_type}</span>}
            </div>
          ))}
          {docs.length === 0 && <div className="docs-empty">No documents yet</div>}
        </div>
      </div>

      {selectedId && doc && (
        <div className="docs-detail-panel">
          <div className="docs-detail-header">
            <button className="detail-delete" onClick={handleDelete}>Delete</button>
            <button className="detail-close" onClick={() => setSelectedId(null)}>&times;</button>
          </div>

          {!editing ? (
            <div className="docs-view">
              <div className="docs-view-header">
                <h2 className="docs-view-title">{doc.title}</h2>
                {doc.doc_type && <span className={`docs-type-badge type-${doc.doc_type}`}>{doc.doc_type}</span>}
                <button className="docs-edit-btn" onClick={startEdit}>Edit</button>
              </div>
              <div className="docs-markdown">
                <Markdown remarkPlugins={[remarkGfm]}>{doc.content || "*No content yet. Click Edit to add.*"}</Markdown>
              </div>
              {doc.tasks.length > 0 && (
                <div className="docs-linked-tasks">
                  <div className="detail-section-label">Linked Tasks</div>
                  {doc.tasks.map((t) => (
                    <div key={t.id} className="docs-task-link clickable" onClick={() => navigate(`/tasks/${t.id}`)} title="Open task">
                      <span className="task-id">{t.display_id}</span> {t.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="docs-editor">
              <div className="docs-editor-toolbar">
                <input
                  className="docs-editor-title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
                <select value={editType} onChange={(e) => setEditType(e.target.value)} className="docs-editor-type">
                  <option value="">No type</option>
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button className="docs-save-btn" onClick={saveEdit}>Save</button>
                <button className="docs-cancel-btn" onClick={() => setEditing(false)}>Cancel</button>
              </div>
              <textarea
                className="docs-editor-content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Write markdown..."
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
