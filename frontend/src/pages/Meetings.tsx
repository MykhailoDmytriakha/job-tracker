import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { meetingsApi } from "../api";
import type { MeetingWithContext } from "../api";
import { useProject } from "../ProjectContext";
import { TaskModal } from "../components/TaskModal";
import { calculateDaysDiff, formatShortDateUTC } from "../utils/date";

/**
 * First-class meetings page.
 *
 * Design language: matches Tasks/Docs list pages.
 *   - .tasks-layout root
 *   - .tasks-toolbar with two rows (search, then filter chips + sort)
 *   - Flat .task-list with .task-item rows
 *   - Row click opens TaskModal overlay (Pipeline/Dashboard pattern)
 *   - Client-side sort with localStorage persistence
 *   - Filter + selection state in URL searchParams
 *
 * Three filter dimensions (all exclusive inside their dimension):
 *   window:  upcoming | today | week | all       (default: upcoming)
 *   status:  scheduled | completed | cancelled   (default: none = any)
 *   type:    phone_screen | technical | behavioral | panel | onsite  (default: none)
 */

// ─── Types ─────────────────────────────────────────────────────────────────

type WindowFilter = "upcoming" | "today" | "week" | "all";
type StatusFilter = "scheduled" | "completed" | "cancelled" | null;
type TypeFilter =
  | "phone_screen"
  | "technical"
  | "behavioral"
  | "panel"
  | "onsite"
  | null;

type SortKey =
  | "soonest"
  | "latest"
  | "added"
  | "updated"
  | "task"
  | "type";

// ─── Constants ─────────────────────────────────────────────────────────────

const WINDOW_OPTIONS: { key: WindowFilter; label: string }[] = [
  { key: "upcoming", label: "upcoming" },
  { key: "today", label: "today" },
  { key: "week", label: "week" },
  { key: "all", label: "all" },
];

const STATUS_OPTIONS: Exclude<StatusFilter, null>[] = [
  "scheduled",
  "completed",
  "cancelled",
];

const TYPE_OPTIONS: { key: Exclude<TypeFilter, null>; label: string }[] = [
  { key: "phone_screen", label: "phone" },
  { key: "technical", label: "technical" },
  { key: "behavioral", label: "behavioral" },
  { key: "panel", label: "panel" },
  { key: "onsite", label: "onsite" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "soonest", label: "Soonest" },
  { key: "latest", label: "Latest" },
  { key: "added", label: "Added" },
  { key: "updated", label: "Updated" },
  { key: "task", label: "Task A→Z" },
  { key: "type", label: "Type" },
];

const TYPE_LABELS: Record<string, string> = {
  phone_screen: "Phone screen",
  technical: "Technical",
  behavioral: "Behavioral",
  panel: "Panel",
  onsite: "Onsite",
  other: "Other",
};

const PLATFORM_LABELS: Record<string, string> = {
  teams: "Teams",
  zoom: "Zoom",
  phone: "Phone",
  onsite: "Onsite",
  other: "Other",
};

// ─── Sorting ───────────────────────────────────────────────────────────────

function sortMeetings(
  rows: MeetingWithContext[],
  sort: SortKey,
): MeetingWithContext[] {
  const toTime = (s: string | null) =>
    s ? new Date(s).getTime() : Number.MAX_SAFE_INTEGER;
  const sorted = [...rows];
  switch (sort) {
    case "soonest":
      sorted.sort(
        (a, b) =>
          toTime(a.scheduled_at) - toTime(b.scheduled_at) || a.id - b.id,
      );
      break;
    case "latest":
      sorted.sort((a, b) => {
        const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
        const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
        return tb - ta || b.id - a.id;
      });
      break;
    case "added":
      sorted.sort((a, b) => b.id - a.id);
      break;
    case "updated":
      sorted.sort((a, b) =>
        (b.updated_at || "").localeCompare(a.updated_at || ""),
      );
      break;
    case "task":
      sorted.sort(
        (a, b) =>
          a.task_title.localeCompare(b.task_title) ||
          toTime(a.scheduled_at) - toTime(b.scheduled_at),
      );
      break;
    case "type":
      sorted.sort(
        (a, b) =>
          a.meeting_type.localeCompare(b.meeting_type) ||
          toTime(a.scheduled_at) - toTime(b.scheduled_at),
      );
      break;
  }
  return sorted;
}

// ─── Date/time helpers ─────────────────────────────────────────────────────

function formatClockLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateLabel(iso: string): string {
  const diff = calculateDaysDiff(iso);
  if (diff === 0) return "today";
  if (diff === 1) return "tmrw";
  if (diff === -1) return "yday";
  return formatShortDateUTC(iso);
}

interface DeltaInfo {
  text: string;
  urgency: "imminent" | "soon" | "past" | "";
}

function formatDelta(iso: string): DeltaInfo {
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const hrs = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  if (ms < 0) {
    if (abs < 3_600_000) return { text: `${mins}m ago`, urgency: "past" };
    if (abs < 86_400_000) return { text: `${hrs}h ago`, urgency: "past" };
    return { text: `${days}d ago`, urgency: "past" };
  }
  if (ms < 3_600_000) return { text: `in ${mins}m`, urgency: "imminent" };
  if (ms < 86_400_000) return { text: `in ${hrs}h`, urgency: "soon" };
  return { text: `in ${days}d`, urgency: "" };
}

// ─── Filter predicates ─────────────────────────────────────────────────────

function matchWindow(m: MeetingWithContext, w: WindowFilter): boolean {
  if (w === "all") return true;
  if (!m.scheduled_at) return w === "upcoming";
  const now = Date.now();
  const t = new Date(m.scheduled_at).getTime();
  if (w === "upcoming") return t >= now - 60 * 60 * 1000; // keep the in-progress hour visible
  if (w === "today") {
    const d = calculateDaysDiff(m.scheduled_at);
    return d === 0;
  }
  if (w === "week") {
    const d = calculateDaysDiff(m.scheduled_at);
    return d >= 0 && d <= 7;
  }
  return true;
}

function matchSearch(m: MeetingWithContext, q: string): boolean {
  if (!q) return true;
  const hay = [
    m.task_title,
    m.task_display_id,
    m.interviewer,
    m.platform,
    m.meeting_type,
    TYPE_LABELS[m.meeting_type],
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

// ─── URL helpers ───────────────────────────────────────────────────────────

function parseWindowParam(v: string | null): WindowFilter {
  if (v === "today" || v === "week" || v === "all") return v;
  return "upcoming";
}
function parseStatusParam(v: string | null): StatusFilter {
  if (v === "scheduled" || v === "completed" || v === "cancelled") return v;
  return null;
}
function parseTypeParam(v: string | null): TypeFilter {
  if (
    v === "phone_screen" ||
    v === "technical" ||
    v === "behavioral" ||
    v === "panel" ||
    v === "onsite"
  )
    return v;
  return null;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function Meetings() {
  const navigate = useNavigate();
  const { active: project } = useProject();
  const projectId = project?.id ?? null;

  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState<MeetingWithContext[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [windowFilter, setWindowFilter] = useState<WindowFilter>(() =>
    parseWindowParam(searchParams.get("w")),
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() =>
    parseStatusParam(searchParams.get("s")),
  );
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(() =>
    parseTypeParam(searchParams.get("t")),
  );

  const [sortBy, setSortBy] = useState<SortKey>(
    () => (localStorage.getItem("jt_meetings_sort") as SortKey) || "soonest",
  );
  useEffect(() => {
    localStorage.setItem("jt_meetings_sort", sortBy);
  }, [sortBy]);

  const selectedTaskId = searchParams.get("task")
    ? Number(searchParams.get("task"))
    : null;

  // ── Keep filter state reflected in URL ────────────────────────────────
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const task = searchParams.get("task");
    if (windowFilter === "upcoming") next.delete("w");
    else next.set("w", windowFilter);
    if (statusFilter === null) next.delete("s");
    else next.set("s", statusFilter);
    if (typeFilter === null) next.delete("t");
    else next.set("t", typeFilter);
    if (task) next.set("task", task);
    const prev = searchParams.toString();
    if (next.toString() !== prev) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowFilter, statusFilter, typeFilter]);

  // ── Debounce search ────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Data fetch ────────────────────────────────────────────────────────
  // Window + status drive the backend query window; type + search are applied client-side
  // so that chip toggles are instant without refetching.
  const load = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    const needsPast =
      windowFilter === "all" ||
      statusFilter === "completed" ||
      statusFilter === "cancelled";
    const needsCancelled =
      windowFilter === "all" ||
      statusFilter === "cancelled";
    meetingsApi
      .listAggregated({
        projectId,
        includePast: needsPast,
        includeCancelled: needsCancelled,
        limit: 200,
        days: needsPast ? undefined : 60,
      })
      .then((data) => setRows(data))
      .catch((e) => setError(e?.message || "Failed to load meetings"))
      .finally(() => setLoading(false));
  }, [projectId, windowFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh countdowns each minute so "in 5m" doesn't drift
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Client-side filter + sort ─────────────────────────────────────────
  const visible = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const filtered = rows.filter((m) => {
      if (!matchWindow(m, windowFilter)) return false;
      if (statusFilter && m.status !== statusFilter) return false;
      if (typeFilter && m.meeting_type !== typeFilter) return false;
      if (!matchSearch(m, q)) return false;
      return true;
    });
    return sortMeetings(filtered, sortBy);
  }, [rows, windowFilter, statusFilter, typeFilter, debouncedSearch, sortBy]);

  const counts = useMemo(() => {
    let imminent = 0;
    let soon = 0;
    const now = Date.now();
    for (const m of visible) {
      if (m.status !== "scheduled" || !m.scheduled_at) continue;
      const delta = new Date(m.scheduled_at).getTime() - now;
      if (delta < 0) continue;
      if (delta <= 3_600_000) imminent += 1;
      else if (delta <= 86_400_000) soon += 1;
    }
    return { imminent, soon };
  }, [visible]);

  const navigationItems = useMemo(
    () =>
      visible.map((m) => ({
        id: m.task_id,
        display_id: m.task_display_id,
        title: m.task_title,
      })),
    [visible],
  );

  // ── Actions ────────────────────────────────────────────────────────────
  function openTaskModal(taskId: number) {
    const next = new URLSearchParams(searchParams);
    next.set("task", String(taskId));
    setSearchParams(next, { replace: false });
  }
  function closeTaskModal() {
    const next = new URLSearchParams(searchParams);
    next.delete("task");
    setSearchParams(next, { replace: false });
  }
  function openCockpit(m: MeetingWithContext) {
    navigate(`/tasks/${m.task_id}/meeting/${m.id}/cockpit`);
  }
  async function copyJoinUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may be unavailable on older browsers */
    }
  }
  function clearAllFilters() {
    setWindowFilter("upcoming");
    setStatusFilter(null);
    setTypeFilter(null);
    setSearch("");
  }

  const anyFilterActive =
    windowFilter !== "upcoming" ||
    statusFilter !== null ||
    typeFilter !== null ||
    debouncedSearch.trim().length > 0;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="tasks-layout">
      <div className="tasks-list-panel">
        <div className="tasks-toolbar">
          <div className="tasks-toolbar-row1">
            <div className="search-wrap">
              <input
                className="filter-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company, interviewer, platform..."
                style={search ? { paddingRight: 30 } : undefined}
              />
              {search && (
                <button
                  className="search-clear"
                  onClick={() => setSearch("")}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M1 1l8 8M9 1L1 9"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
            </div>
            <div className="meetings-toolbar-count" title="Visible meetings">
              {visible.length}
              {rows.length !== visible.length && (
                <span className="meetings-toolbar-total"> / {rows.length}</span>
              )}
            </div>
          </div>

          <div className="tasks-toolbar-row2">
            {WINDOW_OPTIONS.map((w) => (
              <button
                key={w.key}
                className={`filter-chip ${windowFilter === w.key ? "active" : ""}`}
                onClick={() => setWindowFilter(w.key)}
              >
                {w.label}
              </button>
            ))}
            <div className="toolbar-divider" />

            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                className={`filter-chip ${statusFilter === s ? "active" : ""}`}
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
              >
                {s}
              </button>
            ))}
            <div className="toolbar-divider" />

            {TYPE_OPTIONS.map((t) => (
              <button
                key={t.key}
                className={`filter-chip ${typeFilter === t.key ? "active" : ""}`}
                onClick={() =>
                  setTypeFilter(typeFilter === t.key ? null : t.key)
                }
              >
                {t.label}
              </button>
            ))}

            {anyFilterActive && (
              <button
                className="filter-chip filter-clear"
                onClick={clearAllFilters}
                title="Clear all filters"
              >
                ×
              </button>
            )}

            <div className="toolbar-divider" />
            <div className="sort-control">
              <svg
                className="sort-icon"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
              >
                <path
                  d="M2 3h8M3 6h6M4 9h4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              <select
                className="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(counts.imminent > 0 || counts.soon > 0) && (
            <div className="meetings-urgency-bar">
              {counts.imminent > 0 && (
                <span className="meetings-urgency imminent">
                  {counts.imminent} starting within an hour
                </span>
              )}
              {counts.soon > 0 && (
                <span className="meetings-urgency soon">
                  {counts.soon} within 24 hours
                </span>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="route-sync-banner">
            <span>{error}</span>
            <button
              type="button"
              className="route-sync-banner-btn"
              onClick={load}
            >
              Retry
            </button>
          </div>
        )}

        {loading && rows.length === 0 && (
          <div className="loading">Loading meetings...</div>
        )}

        {!loading && visible.length === 0 && (
          <div className="task-list-divider">
            {rows.length === 0
              ? "No meetings yet"
              : "No meetings match current filters"}
          </div>
        )}

        <div className="task-list">
          {visible.map((m) => (
            <MeetingRow
              key={m.id}
              meeting={m}
              selected={m.task_id === selectedTaskId}
              onOpenTask={() => openTaskModal(m.task_id)}
              onOpenCockpit={() => openCockpit(m)}
              onCopyJoin={copyJoinUrl}
            />
          ))}
        </div>
      </div>

      {selectedTaskId && (
        <TaskModal
          taskId={selectedTaskId}
          onClose={closeTaskModal}
          onSelectTask={openTaskModal}
          onNavigate={(id) => navigate(`/tasks/${id}`)}
          onOpenFull={() => navigate(`/tasks/${selectedTaskId}`)}
          navigationItems={navigationItems}
          onUpdate={load}
          onDelete={() => {
            closeTaskModal();
            load();
          }}
        />
      )}
    </div>
  );
}

// ─── Row ───────────────────────────────────────────────────────────────────

interface RowProps {
  meeting: MeetingWithContext;
  selected: boolean;
  onOpenTask: () => void;
  onOpenCockpit: () => void;
  onCopyJoin: (url: string) => void;
}

function MeetingRow({
  meeting,
  selected,
  onOpenTask,
  onOpenCockpit,
  onCopyJoin,
}: RowProps) {
  const iso = meeting.scheduled_at;
  const delta = iso ? formatDelta(iso) : null;
  const typeLabel = TYPE_LABELS[meeting.meeting_type] || meeting.meeting_type;
  const platformLabel = meeting.platform
    ? PLATFORM_LABELS[meeting.platform] || meeting.platform
    : null;

  // A meeting is "live" (still going to happen) if it's scheduled or
  // rescheduled. Only completed / cancelled / no_show are truly finished and
  // should fade. For live meetings we color by time-delta urgency.
  const isLive =
    meeting.status === "scheduled" || meeting.status === "rescheduled";
  const urgencyClass = !isLive
    ? "meeting-past"
    : delta
      ? delta.urgency === "imminent"
        ? "meeting-imminent"
        : delta.urgency === "soon"
          ? "meeting-soon"
          : delta.urgency === "past"
            ? "meeting-past"
            : ""
      : "";

  const cockpitReady = meeting.cockpit_section_count >= 6;
  // Binary cockpit state: for every meeting that's still going to happen
  // (scheduled or rescheduled), show ✓ or ✗. No hidden/conditional state —
  // either it's there or it isn't. For cancelled/completed/no_show cockpit
  // is no longer actionable so we skip.
  const showCockpitState =
    meeting.status === "scheduled" || meeting.status === "rescheduled";

  return (
    <div
      className={`task-item meetings-row ${selected ? "task-selected" : ""} ${urgencyClass}`}
      onClick={onOpenTask}
      title={`${meeting.task_display_id} ${meeting.task_title}`}
    >
      <div className="meetings-time-col">
        {iso ? (
          <>
            <div className="meetings-time-date">{formatDateLabel(iso)}</div>
            <div className="meetings-time-clock">{formatClockLocal(iso)}</div>
            {delta && (
              <div className={`meetings-time-delta ${delta.urgency}`}>
                {delta.text}
              </div>
            )}
          </>
        ) : (
          <div className="meetings-time-date">unscheduled</div>
        )}
      </div>

      <div className="task-content">
        <span className="task-title">
          {meeting.interviewer && meeting.interviewer.trim() !== "" ? (
            meeting.interviewer
          ) : (
            <>
              <span className="task-id">{meeting.task_display_id}</span>{" "}
              {meeting.task_title}
            </>
          )}
        </span>
        {meeting.interviewer && meeting.interviewer.trim() !== "" && (
          <div className="meetings-task-ref" title={meeting.task_title}>
            <span className="task-id">{meeting.task_display_id}</span>{" "}
            <span className="meetings-task-ref-title">{meeting.task_title}</span>
          </div>
        )}
        <div className="task-meta-row">
          <span className="task-category">{typeLabel}</span>
          {platformLabel && (
            <span className="task-category">{platformLabel}</span>
          )}
          {showCockpitState && (
            cockpitReady ? (
              <span
                className="progress-pill cl"
                title={`Cockpit ready — ${meeting.cockpit_section_count}/7 sections filled`}
              >
                ✓ cockpit
              </span>
            ) : (
              <span
                className="status-tag overdue"
                title={`Cockpit not ready — only ${meeting.cockpit_section_count}/7 sections filled, prep before the call`}
              >
                ✗ cockpit</span>
            )
          )}
          {meeting.status === "completed" && meeting.result && (
            <span
              className={`status-tag ${
                meeting.result === "passed"
                  ? "in-progress"
                  : meeting.result === "failed"
                    ? "overdue"
                    : "blocked"
              }`}
              title={`Result: ${meeting.result}`}
            >
              {meeting.result}
            </span>
          )}
          {(meeting.status === "cancelled" ||
            meeting.status === "no_show" ||
            meeting.status === "rescheduled") && (
            <span className="status-tag blocked">{meeting.status}</span>
          )}
        </div>
      </div>

      <RowActions
        meeting={meeting}
        cockpitReady={cockpitReady}
        onOpenCockpit={onOpenCockpit}
        onCopyJoin={onCopyJoin}
      />
    </div>
  );
}

// ─── Row actions ───────────────────────────────────────────────────────────

interface RowActionsProps {
  meeting: MeetingWithContext;
  cockpitReady: boolean;
  onOpenCockpit: () => void;
  onCopyJoin: (url: string) => void;
}

function RowActions({
  meeting,
  cockpitReady,
  onOpenCockpit,
  onCopyJoin,
}: RowActionsProps) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
  const cockpitTitle = cockpitReady
    ? "Open cockpit"
    : "Open cockpit and finish prep";
  useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!meeting.join_url) return;
    onCopyJoin(meeting.join_url);
    setCopied(true);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="meetings-actions" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`meetings-action-btn meetings-action-btn--cockpit ${cockpitReady ? "ready" : "pending"}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpenCockpit();
        }}
        title={cockpitTitle}
        aria-label={cockpitTitle}
      >
        <span className="meetings-action-btn-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="8" cy="8" r="1.9" fill="currentColor" />
          </svg>
        </span>
        <span className="meetings-action-btn-text">Cockpit</span>
      </button>
      {meeting.join_url && (
        <button
          type="button"
          className={`meetings-action-btn meetings-action-btn--icon ${copied ? "copied" : ""}`}
          onClick={handleCopy}
          title={copied ? "Copied!" : "Copy join URL"}
          aria-label="Copy join URL"
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2.5 7.5L5.5 10.5L11.5 3.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M5.5 8.5L8.5 5.5M6 3.5L8 1.5a2.1 2.1 0 013 3L9 6.5M5 7.5L3 9.5a2.1 2.1 0 003 3l2-2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
