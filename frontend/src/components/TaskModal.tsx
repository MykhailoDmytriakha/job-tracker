import { useEffect } from "react";
import { TaskDetail } from "./TaskDetail";

interface TaskModalProps {
  taskId: number;
  onClose: () => void;
  onNavigate: (id: number) => void;
  onUpdate: () => void;
  onOpenFull: () => void;
  onDelete: () => void;
}

export function TaskModal({ taskId, onClose, onNavigate, onUpdate, onOpenFull, onDelete }: TaskModalProps) {
  useEffect(() => {
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = origOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

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
          isModal
        />
      </div>
    </div>
  );
}
