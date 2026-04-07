import { useNavigate } from "react-router-dom";
import type { MeetingWithContext } from "../api";

/**
 * Dashboard tile for meetings. Same dimensions as sibling stat cards
 * (Open / Overdue / Waiting / Blocked / Recurring / Attention).
 *
 * Shows count of upcoming meetings in next 7 days. Border color signals
 * urgency of the closest one at a glance. Click navigates to /meetings
 * where the full breakdown lives.
 */

interface Props {
  count: number;
  next?: MeetingWithContext | null;
}

function severityFor(scheduledAt: string | null): string {
  if (!scheduledAt) return "";
  const delta = new Date(scheduledAt).getTime() - Date.now();
  if (delta < 0) return "stale";
  if (delta <= 60 * 60 * 1000) return "urgent";
  if (delta <= 24 * 60 * 60 * 1000) return "warning";
  return "";
}

export function DashboardMeetingsTile({ count, next }: Props) {
  const navigate = useNavigate();
  const severity = next?.scheduled_at ? severityFor(next.scheduled_at) : "";
  const tooltip = next
    ? `Next: ${next.task_display_id} ${next.task_title}`
    : "Open meetings page";

  return (
    <button
      className={`stat-card meetings-tile ${severity ? `meetings-tile--${severity}` : ""}`}
      onClick={() => navigate("/meetings")}
      title={tooltip}
    >
      <span
        className={`stat-value ${severity === "urgent" ? "danger" : severity === "warning" ? "warning" : ""}`}
      >
        {count}
      </span>
      <span className="stat-label">Meetings</span>
    </button>
  );
}
