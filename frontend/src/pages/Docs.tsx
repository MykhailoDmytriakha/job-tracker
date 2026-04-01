import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { documentsApi, searchApi } from "../api";
import type { DocumentBrief, DocumentFull } from "../api";
import { useProject } from "../ProjectContext";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ConfirmModal } from "../components/ConfirmModal";

const DOC_TYPES = ["research", "playbook", "reference", "journal"];

type SortKey = "title" | "updated" | "type";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "updated", label: "Updated"  },
  { key: "title",   label: "Title A→Z"},
  { key: "type",    label: "Type"     },
];

function sortDocs(docs: DocumentBrief[], sortBy: SortKey): DocumentBrief[] {
  return [...docs].sort((a, b) => {
    switch (sortBy) {
      case "title":   return a.title.localeCompare(b.title);
      case "updated": return (b.updated_at || "").localeCompare(a.updated_at || "");
      case "type":    return (a.doc_type || "").localeCompare(b.doc_type || "");
      default:        return 0;
    }
  });
}

export function Docs() {
  const { active: project } = useProject();
  const { docId } = useParams<{ docId?: string }>();
  const navigate = useNavigate();
  const selectedId = docId ? Number(docId) : null;
  const [docs, setDocs] = useState<DocumentBrief[]>([]);
  const [doc, setDoc] = useState<DocumentFull | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; message: string }>({ show: false, message: "" });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchHints, setSearchHints] = useState<Record<string, number>>({});
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editType, setEditType] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const sel = searchParams.get("selected");
    if (sel) {
      navigate(`/docs/${sel}`, { replace: true });
    }
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
        if (g.entity_type !== "document" && g.entity_type !== "activity" && g.count > 0) {
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
    if (typeFilter) params.doc_type = typeFilter;
    documentsApi.list(project.id, params).then(setDocs);
  }, [project, debouncedSearch, typeFilter]);

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
    navigate(`/docs/${created.id}`);
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
    setDeleteConfirm({ show: false, message: "" });
    navigate("/docs");
    loadList();
  }

  return (
    <div className={`docs-layout ${selectedId ? "has-detail" : ""}`}>
      <div className="docs-list-panel">
        <div className="tasks-toolbar">
          <div className="tasks-toolbar-row1">
            <div className="search-wrap">
              <input
                className="filter-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search docs..."
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
            {DOC_TYPES.map((t) => (
              <button
                key={t}
                className={`filter-chip ${typeFilter === t ? "active" : ""}`}
                onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              >
                {t}
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
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Document title..." autoFocus />
            <button type="submit">Create</button>
            <button type="button" onClick={() => setCreating(false)}>Cancel</button>
          </form>
        )}

        <div className="docs-list">
          {sortDocs(docs, sortBy).map((d) => (
            <div
              key={d.id}
              className={`docs-item ${d.id === selectedId ? "selected" : ""}`}
              onClick={() => navigate(`/docs/${d.id}`)}
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
          <div className="detail-header">
            <button className="detail-close" onClick={() => navigate("/docs")} title="Back to list">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                className="detail-delete"
                onClick={() => setDeleteConfirm({ show: true, message: `Delete "${doc.title}"? This cannot be undone.` })}
                title="Delete document"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>

          {!editing ? (
            <div className="docs-view">
              <div className="docs-view-header">
                <h2 className="docs-view-title">{doc.title}</h2>
                {doc.doc_type && <span className={`docs-type-badge type-${doc.doc_type}`}>{doc.doc_type}</span>}
                <button className="docs-edit-btn" onClick={startEdit}>Edit</button>
              </div>
              <div className="docs-markdown">
                <Markdown 
                  remarkPlugins={[remarkGfm]}
                  components={{ a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
                >
                  {doc.content || "*No content yet. Click Edit to add.*"}
                </Markdown>
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

      {deleteConfirm.show && (
        <ConfirmModal
          title="Delete document?"
          message={deleteConfirm.message}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm({ show: false, message: "" })}
        />
      )}
    </div>
  );
}
