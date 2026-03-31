import { useState, useEffect } from "react";
import { categoriesApi, ApiError } from "../api";
import type { Category } from "../api";
import { useProject } from "../ProjectContext";
import { ConfirmModal } from "../components/ConfirmModal";

type WeekStart = "monday" | "sunday";

function getSetting<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`jt_${key}`);
    return v !== null ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function setSetting(key: string, value: unknown) {
  localStorage.setItem(`jt_${key}`, JSON.stringify(value));
}

export function getWeekStart(): WeekStart {
  return getSetting<WeekStart>("weekStart", "monday");
}

export function Settings() {
  const { active: project } = useProject();
  const [weekStart, setWeekStart] = useState<WeekStart>(() => getSetting("weekStart", "monday"));
  const [saved, setSaved] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCat, setNewCat] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; cat: Category | null; message: string }>({ show: false, cat: null, message: "" });

  function handleWeekStart(value: WeekStart) {
    setWeekStart(value);
    setSetting("weekStart", value);
    flashSaved();
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function loadCategories() {
    if (project) categoriesApi.list(project.id).then(setCategories);
  }

  useEffect(() => { loadCategories(); }, [project]);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCat.trim() || !project) return;
    await categoriesApi.create(project.id, { name: newCat.trim() });
    setNewCat("");
    loadCategories();
  }

  function startRename(cat: Category) {
    setEditingId(cat.id);
    setEditName(cat.name);
  }

  async function saveRename(id: number) {
    if (!editName.trim()) return;
    await categoriesApi.rename(id, { name: editName.trim() });
    setEditingId(null);
    loadCategories();
    flashSaved();
  }

  async function handleDelete(cat: Category) {
    try {
      await categoriesApi.delete(cat.id);
      loadCategories();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        let msg = `Category "${cat.name}" is used by tasks.`;
        try { msg = JSON.parse(e.body).detail; } catch {}
        setDeleteConfirm({ show: true, cat, message: msg });
      }
    }
  }

  async function forceDelete() {
    if (!deleteConfirm.cat) return;
    await categoriesApi.delete(deleteConfirm.cat.id, true);
    setDeleteConfirm({ show: false, cat: null, message: "" });
    loadCategories();
  }

  return (
    <div className="settings-page">
      <h2 className="settings-title">Settings</h2>

      {/* Categories */}
      <div className="settings-section">
        <div className="settings-section-label">Categories</div>
        <div className="settings-categories">
          {categories.map((c) => (
            <div key={c.id} className="settings-cat-item">
              {editingId === c.id ? (
                <input
                  className="settings-cat-rename"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => saveRename(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename(c.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                />
              ) : (
                <span className="settings-cat-name" onClick={() => startRename(c)} title="Click to rename">
                  {c.name}
                </span>
              )}
              <span className="settings-cat-count" title={`${c.task_count} task(s) use this category`}>
                {c.task_count}
              </span>
              <button
                className="settings-cat-delete"
                onClick={() => handleDelete(c)}
                title="Delete category"
              >
                &times;
              </button>
            </div>
          ))}
          {categories.length === 0 && (
            <div className="settings-cat-empty">No categories yet</div>
          )}
          <form className="settings-cat-form" onSubmit={addCategory}>
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="New category..."
            />
            <button type="submit">Add</button>
          </form>
        </div>
      </div>

      {/* Date & Calendar */}
      <div className="settings-section">
        <div className="settings-section-label">Date & Calendar</div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Week starts on</div>
            <div className="settings-row-desc">Choose which day begins your week</div>
          </div>
          <div className="settings-row-control">
            <button
              className={`settings-toggle-btn ${weekStart === "monday" ? "active" : ""}`}
              onClick={() => handleWeekStart("monday")}
            >
              Monday
            </button>
            <button
              className={`settings-toggle-btn ${weekStart === "sunday" ? "active" : ""}`}
              onClick={() => handleWeekStart("sunday")}
            >
              Sunday
            </button>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="settings-section">
        <div className="settings-section-label">About</div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Job Tracker</div>
            <div className="settings-row-desc">Task management with dependencies, documents, and pipeline tracking.</div>
          </div>
        </div>
      </div>

      {saved && <div className="settings-saved">Saved</div>}

      {deleteConfirm.show && (
        <ConfirmModal
          title="Delete category?"
          message={deleteConfirm.message + " Tasks will have their category cleared."}
          confirmLabel="Delete anyway"
          danger
          onConfirm={forceDelete}
          onCancel={() => setDeleteConfirm({ show: false, cat: null, message: "" })}
        />
      )}
    </div>
  );
}
