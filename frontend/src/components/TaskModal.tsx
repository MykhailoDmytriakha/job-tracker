import { useEffect } from "react";
import { TaskDetail } from "./TaskDetail";

interface TaskModalNavItem {
  id: number;
  display_id: string;
  title: string;
}

interface TaskModalProps {
  taskId: number;
  onClose: () => void;
  onSelectTask?: (id: number) => void;
  onNavigate: (id: number) => void;
  onUpdate: () => void;
  onOpenFull: () => void;
  onDelete: () => void;
  navigationItems?: TaskModalNavItem[];
}

function isFormTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    target.isContentEditable ||
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.closest("[role='textbox']") !== null
  );
}

function TaskModalSwitcher({
  current,
  currentIndex,
  next,
  onSelectTask,
  previous,
  total,
}: {
  current: TaskModalNavItem;
  currentIndex: number;
  next: TaskModalNavItem | null;
  onSelectTask: (id: number) => void;
  previous: TaskModalNavItem | null;
  total: number;
}) {
  return (
    <div className="task-modal-switcher" aria-label="Task navigation">
      <button
        type="button"
        className="task-modal-switcher-btn"
        onClick={() => previous && onSelectTask(previous.id)}
        disabled={!previous}
        title={previous ? `Previous: ${previous.display_id} ${previous.title} (←)` : "No previous task"}
        aria-label={previous ? `Open previous task ${previous.display_id}` : "No previous task"}
      >
        <span className="task-modal-switcher-arrow" aria-hidden="true">‹</span>
        {previous && <span className="task-modal-switcher-id">{previous.display_id}</span>}
      </button>

      <div className="task-modal-switcher-current" title={`${current.display_id} ${current.title}`}>
        <span className="task-modal-switcher-current-id">{current.display_id}</span>
      </div>

      <button
        type="button"
        className="task-modal-switcher-btn task-modal-switcher-btn--next"
        onClick={() => next && onSelectTask(next.id)}
        disabled={!next}
        title={next ? `Next: ${next.display_id} ${next.title} (→)` : "No next task"}
        aria-label={next ? `Open next task ${next.display_id}` : "No next task"}
      >
        {next && <span className="task-modal-switcher-id">{next.display_id}</span>}
        <span className="task-modal-switcher-arrow" aria-hidden="true">›</span>
      </button>
    </div>
  );
}

export function TaskModal({
  taskId,
  onClose,
  onDelete,
  onNavigate,
  onOpenFull,
  onSelectTask,
  onUpdate,
  navigationItems,
}: TaskModalProps) {
  const currentIndex = navigationItems?.findIndex((item) => item.id === taskId) ?? -1;
  const currentTask = currentIndex >= 0 && navigationItems ? navigationItems[currentIndex] : null;
  const previousTask = currentIndex > 0 && navigationItems ? navigationItems[currentIndex - 1] : null;
  const nextTask =
    currentIndex >= 0 && navigationItems && currentIndex < navigationItems.length - 1
      ? navigationItems[currentIndex + 1]
      : null;
  const hasNavigation = Boolean(onSelectTask && currentTask && navigationItems && navigationItems.length > 1);

  useEffect(() => {
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!hasNavigation || !onSelectTask || isFormTarget(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft" && previousTask) {
        e.preventDefault();
        onSelectTask(previousTask.id);
      }
      if (e.key === "ArrowRight" && nextTask) {
        e.preventDefault();
        onSelectTask(nextTask.id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = origOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasNavigation, nextTask, onClose, onSelectTask, previousTask]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="task-modal-overlay" onMouseDown={handleOverlayClick}>
      <div className="task-modal-content">
        <TaskDetail
          taskId={taskId}
          onClose={onClose}
          onNavigate={onNavigate}
          onUpdate={onUpdate}
          onOpenFull={onOpenFull}
          onDelete={onDelete}
          modalPosition={
            hasNavigation ? (
              <span className="task-modal-position">{currentIndex + 1}<span className="task-modal-position-sep">/</span>{navigationItems!.length}</span>
            ) : undefined
          }
          modalSwitcher={
            hasNavigation && currentTask && onSelectTask ? (
              <TaskModalSwitcher
                current={currentTask}
                currentIndex={currentIndex}
                next={nextTask}
                onSelectTask={onSelectTask}
                previous={previousTask}
                total={navigationItems!.length}
              />
            ) : undefined
          }
          isModal
        />
      </div>
    </div>
  );
}
