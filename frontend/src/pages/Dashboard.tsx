import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { dashboardApi, tasksApi } from "../api";
import type { DashboardView, TaskBrief } from "../api";
import { useProject } from "../ProjectContext";
import { TaskModal } from "../components/TaskModal";

import { calculateDaysDiff, isDateOverdue } from "../utils/date";

function daysAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = calculateDaysDiff(dateStr);
  if (diff >= 0) return "today";
  if (diff === -1) return "1d ago";
  return `${Math.abs(diff)}d ago`;
}

function daysUntil(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = calculateDaysDiff(dateStr);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff}d`;
}

function isOverdue(dateStr: string | null): boolean {
  return isDateOverdue(dateStr);
}

function staleDays(dateStr: string | null): number {
  if (!dateStr) return 999;
  return -calculateDaysDiff(dateStr);
}

export function Dashboard() {
  const { active: project } = useProject();
  const [data, setData] = useState<DashboardView | null>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedTaskId = searchParams.get("task") ? Number(searchParams.get("task")) : null;

  useEffect(() => {
    if (!project) return;
    dashboardApi.get(project.id).then(setData);
  }, [project]);

  function goToTask(id: number) {
    setSearchParams({ task: String(id) });
  }

  function closeTask() {
    setSearchParams({});
  }

  function goToFiltered(filter: string) {
    navigate(`/tasks?filter=${filter}`);
  }

  if (!data) return <div className="loading">Loading...</div>;

  const { stats } = data;

  return (
    <div className="dashboard">
      {/* Stat cards - clickable */}
      <div className="dash-stats">
        <button className="stat-card" onClick={() => goToFiltered("open")} title="View all open tasks">
          <span className="stat-value">{stats.total_open}</span>
          <span className="stat-label">Open</span>
        </button>
        <button className="stat-card" onClick={() => goToFiltered("overdue")} title="View overdue tasks">
          <span className={`stat-value ${stats.overdue > 0 ? "danger" : ""}`}>{stats.overdue}</span>
          <span className="stat-label">Overdue</span>
        </button>
        <button className="stat-card" onClick={() => goToFiltered("waiting")} title="View waiting tasks">
          <span className={`stat-value ${stats.waiting > 0 ? "warning" : ""}`}>{stats.waiting}</span>
          <span className="stat-label">Waiting</span>
        </button>
        <button className="stat-card" onClick={() => goToFiltered("blocked")} title="View blocked tasks">
          <span className="stat-value">{stats.blocked}</span>
          <span className="stat-label">Blocked</span>
        </button>
        <button className="stat-card" onClick={() => goToFiltered("recurring")} title="View recurring tasks">
          <span className="stat-value">{stats.recurring}</span>
          <span className="stat-label">Recurring</span>
        </button>
        <AttentionCard count={stats.attention} onNavigate={() => goToFiltered("attention")} />
      </div>

      {/* 3-column layout */}
      <div className="dash-columns">
        {/* TODAY */}
        <div className="dash-column">
          <div className="dash-column-header">
            <span className="dash-column-title">Today</span>
            <span className="dash-column-count">{data.today.length}</span>
          </div>
          {data.today.length === 0 ? (
            <div className="dash-column-empty">Nothing due today</div>
          ) : (
            data.today.map((t) => (
              <TodayCard key={t.id} task={t} onClick={() => goToTask(t.id)} />
            ))
          )}
        </div>

        {/* UPCOMING */}
        <div className="dash-column">
          <div className="dash-column-header">
            <span className="dash-column-title">Upcoming</span>
            <span className="dash-column-count">{data.upcoming.length}</span>
          </div>
          {data.upcoming.length === 0 ? (
            <div className="dash-column-empty">Nothing upcoming</div>
          ) : (
            data.upcoming.map((t) => (
              <UpcomingCard key={t.id} task={t} onClick={() => goToTask(t.id)} />
            ))
          )}
        </div>

        {/* RECURRING */}
        <div className="dash-column">
          <div className="dash-column-header">
            <span className="dash-column-title">Recurring</span>
            <span className="dash-column-count">{data.recurring.length}</span>
          </div>
          {data.recurring.length === 0 ? (
            <div className="dash-column-empty">No recurring tasks</div>
          ) : (
            data.recurring.map((t) => (
              <RecurringCard key={t.id} task={t} onClick={() => goToTask(t.id)} onLogProgress={async (id) => {
                await tasksApi.addLog(id, "Progress logged");
                if (project) dashboardApi.get(project.id).then(setData);
              }} />
            ))
          )}
        </div>
      </div>
      
      {selectedTaskId && (
        <TaskModal
          taskId={selectedTaskId}
          onClose={closeTask}
          onNavigate={(id) => navigate(`/tasks/${id}`)}
          onOpenFull={() => navigate(`/tasks/${selectedTaskId}`)}
          onUpdate={() => {
            if (project) dashboardApi.get(project.id).then(setData);
          }}
          onDelete={() => {
            closeTask();
            if (project) dashboardApi.get(project.id).then(setData);
          }}
        />
      )}
    </div>
  );
}

/* === Card components per column === */

function TodayCard({ task, onClick }: { task: TaskBrief; onClick: () => void }) {
  const dateStr = task.due_date || task.follow_up_date;
  const overdue = isOverdue(dateStr);

  return (
    <div className={`dash-card ${overdue ? "dash-card-urgent" : ""}`} onClick={onClick} title="Click to open">
      <div className="dash-card-top">
        {task.priority === "high" && <span className="dash-card-dot danger" title="High priority" />}
        <span className="dash-card-title"><span className="dash-card-id">{task.display_id}</span> {task.title}</span>
      </div>
      <div className="dash-card-bottom">
        {task.category && <span className="dash-card-meta">{task.category}</span>}
        {dateStr && (
          <span className={`dash-card-date ${overdue ? "overdue" : ""}`}>
            {daysUntil(dateStr)}
          </span>
        )}
        {task.is_blocked && <span className="dash-card-tag blocked">Blocked</span>}
        {task.status === "waiting" && <span className="dash-card-tag waiting">Waiting</span>}
      </div>
    </div>
  );
}

function UpcomingCard({ task, onClick }: { task: TaskBrief; onClick: () => void }) {
  const dateStr = task.due_date || task.follow_up_date;

  return (
    <div className="dash-card" onClick={onClick} title="Click to open">
      <div className="dash-card-top">
        {task.priority === "high" && <span className="dash-card-dot danger" title="High priority" />}
        <span className="dash-card-title"><span className="dash-card-id">{task.display_id}</span> {task.title}</span>
      </div>
      <div className="dash-card-bottom">
        {task.category && <span className="dash-card-meta">{task.category}</span>}
        {dateStr && <span className="dash-card-date">{daysUntil(dateStr)}</span>}
        {task.status === "waiting" && <span className="dash-card-tag waiting">Waiting</span>}
      </div>
    </div>
  );
}

const CADENCE_DAYS: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };

function RecurringCard({ task, onClick, onLogProgress }: { task: TaskBrief; onClick: () => void; onLogProgress: (id: number) => void }) {
  const stale = staleDays(task.last_activity_at);
  const threshold = CADENCE_DAYS[task.cadence || "daily"] || 1;
  const isStale = stale >= threshold;

  return (
    <div className={`dash-card ${isStale ? "dash-card-stale" : ""}`} onClick={onClick} title="Click to open">
      <div className="dash-card-top">
        <span className="dash-card-title"><span className="dash-card-id">{task.display_id}</span> {task.title}</span>
      </div>
      <div className="dash-card-bottom">
        {task.cadence && <span className="dash-card-meta">{task.cadence}</span>}
        <span className={`dash-card-activity ${isStale ? "stale" : "fresh"}`} title="Last activity">
          {daysAgo(task.last_activity_at)}
        </span>
        <button
          className="dash-log-btn"
          onClick={(e) => { e.stopPropagation(); onLogProgress(task.id); }}
          title="Log progress for today"
        >
          &#10003;
        </button>
      </div>
    </div>
  );
}

/* === Attention stat card with info popover === */

const ATTENTION_CONDITIONS = [
  { icon: "📅", label: "No dates set", desc: "Active task with no due date and no follow-up date" },
  { icon: "🔁", label: "Stale recurring", desc: "Recurring task with no activity for 3+ full cycles" },
  { icon: "⏰", label: "Missed follow-up", desc: "Waiting task whose follow-up date has already passed" },
  { icon: "🧊", label: "Frozen in-progress", desc: "In-progress task with no activity for 14+ days" },
  { icon: "🔥", label: "High priority, no deadline", desc: "High-priority task without a due date set" },
  { icon: "🔒", label: "Blocked, no movement", desc: "Blocked task with no activity for 7+ days" },
  { icon: "👻", label: "Never touched", desc: "Open task created 10+ days ago with no updates" },
];

const ATTENTION_POPOVER_WIDTH = 300;
const ATTENTION_POPOVER_MARGIN = 10;

function AttentionCard({ count, onNavigate }: { count: number; onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function openInfo(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      // Horizontal: align to card left, clamp so it doesn't overflow right edge
      let left = rect.left;
      const maxLeft = window.innerWidth - ATTENTION_POPOVER_WIDTH - ATTENTION_POPOVER_MARGIN;
      left = Math.max(ATTENTION_POPOVER_MARGIN, Math.min(left, maxLeft));
      // Vertical: below card by default; estimate height ~320px, flip above if needed
      const estimatedHeight = 340;
      let top = rect.bottom + 6;
      if (top + estimatedHeight > window.innerHeight - ATTENTION_POPOVER_MARGIN) {
        top = rect.top - estimatedHeight - 6;
      }
      setPos({ top, left });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handleClick() { setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={cardRef} className={`stat-card attention-card ${open ? "attention-card-open" : ""}`}>
      <button className="attention-info-btn" onClick={openInfo} title="What triggers Attention?">ⓘ</button>
      <button className="attention-main" onClick={onNavigate}>
        <span className={`stat-value ${count > 0 ? "warning" : ""}`}>{count}</span>
        <span className="stat-label">Attention</span>
      </button>
      {open && createPortal(
        <div
          className="attention-popover"
          style={{ top: pos.top, left: pos.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="attention-popover-header">
            <span className="attention-popover-title">⚡ Needs Attention</span>
            <span className="attention-popover-subtitle">Tasks matching any condition below</span>
          </div>
          <ul className="attention-conditions">
            {ATTENTION_CONDITIONS.map((c) => (
              <li key={c.label} className="attention-condition">
                <span className="attention-condition-icon">{c.icon}</span>
                <div>
                  <div className="attention-condition-label">{c.label}</div>
                  <div className="attention-condition-desc">{c.desc}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="attention-popover-footer">Click the card to view all affected tasks →</div>
        </div>,
        document.body
      )}
    </div>
  );
}
