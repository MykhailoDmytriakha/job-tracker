import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TodayCard, UpcomingCard } from "../pages/Dashboard";
import type { TaskBrief } from "../api";

/**
 * Dashboard cards must name which date they are counting down to: a task can be
 * in Upcoming because its follow-up is near while its due date is months out.
 */

function dateIn(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function makeTask(overrides: Partial<TaskBrief>): TaskBrief {
  return {
    id: 1,
    display_id: "EJS-1",
    title: "Test task",
    status: "open",
    priority: "medium",
    category: "Career/Process",
    due_date: null,
    follow_up_date: null,
    is_blocked: false,
    is_recurring: false,
    ...overrides,
  } as TaskBrief;
}

describe("dashboard date chips", () => {
  it("labels both dates when a task has a due date and a follow-up date", () => {
    render(<UpcomingCard task={makeTask({ due_date: dateIn(79), follow_up_date: dateIn(3) })} onClick={() => {}} />);

    expect(screen.getByText("due").parentElement).toHaveTextContent("due in 79d");
    expect(screen.getByText("follow-up").parentElement).toHaveTextContent("follow-up in 3d");
  });

  it("labels a lone date so it is not mistaken for the other one", () => {
    render(<UpcomingCard task={makeTask({ follow_up_date: dateIn(48) })} onClick={() => {}} />);

    expect(screen.getByText("follow-up").parentElement).toHaveTextContent("follow-up in 48d");
    expect(screen.queryByText("due")).toBeNull();
  });

  it("marks only the passed date as overdue", () => {
    render(<TodayCard task={makeTask({ due_date: dateIn(10), follow_up_date: dateIn(-2) })} onClick={() => {}} />);

    expect(screen.getByText("due").parentElement).not.toHaveClass("overdue");
    expect(screen.getByText("follow-up").parentElement).toHaveClass("overdue");
    expect(screen.getByText("follow-up").parentElement).toHaveTextContent("follow-up 2d overdue");
  });

  it("treats an overdue follow-up as urgent even when the due date is in the future", () => {
    const { container } = render(
      <TodayCard task={makeTask({ due_date: dateIn(10), follow_up_date: dateIn(-2) })} onClick={() => {}} />,
    );

    expect(container.querySelector(".dash-card")).toHaveClass("dash-card-urgent");
  });

  it("exposes the absolute date on hover", () => {
    render(<UpcomingCard task={makeTask({ due_date: "2026-11-01T00:00:00Z" })} onClick={() => {}} />);

    expect(screen.getByText("due").parentElement?.getAttribute("title")).toBe("Due date: Nov 1, 2026");
  });
});
