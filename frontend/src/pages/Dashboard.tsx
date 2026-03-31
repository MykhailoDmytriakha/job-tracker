import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dashboardApi, tasksApi } from "../api";
import type { DashboardView, TaskBrief } from "../api";
import { useProject } from "../ProjectContext";
import { TaskModal } from "../components/TaskModal";

function daysAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Math.round(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff <= 0) return "today";
  if (diff === 1) return "1d ago";
  return `${diff}d ago`;
}

function daysUntil(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Math.round(
    (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff}d`;
}

function isOverdue(dateStr: string | null): boolean {
  return !!dateStr && new Date(dateStr).getTime() < Date.now();
}

function staleDays(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.round(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function Dashboard() {
  const { active: project } = useProject();
  const [data, setData] = useState<DashboardView | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!project) return;
    dashboardApi.get(project.id).then(setData);
  }, [project]);

  function goToTask(id: number) {
    setSelectedTaskId(id);
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
                await tasksApi.addNote(id, "Progress logged");
                if (project) dashboardApi.get(project.id).then(setData);
              }} />
            ))
          )}
        </div>
      </div>
      
      {selectedTaskId && (
        <TaskModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onNavigate={(id) => navigate(`/tasks/${id}`)}
          onOpenFull={() => navigate(`/tasks/${selectedTaskId}`)}
          onUpdate={() => {
            if (project) dashboardApi.get(project.id).then(setData);
          }}
          onDelete={() => {
            setSelectedTaskId(null);
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
