import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { boardApi, tasksApi } from "../api";
import type { BoardView } from "../api";
import { Column } from "../components/Column";
import { useProject } from "../ProjectContext";
import { TaskModal } from "../components/TaskModal";

type ModalTaskItem = {
  id: number;
  display_id: string;
  title: string;
};

function getColumnTasksForTask(board: BoardView, taskId: number): ModalTaskItem[] {
  const col = board.columns.find((c) => c.tasks.some((t) => t.id === taskId));
  if (!col) return [];
  return col.tasks.map(({ id, display_id, title }) => ({ id, display_id, title }));
}

export function Pipeline() {
  const { active: project } = useProject();
  const navigate = useNavigate();
  const [board, setBoard] = useState<BoardView | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalTasks, setModalTasks] = useState<ModalTaskItem[]>([]);
  const activeStageRef = useRef<number | null>(null);

  const selectedTaskId = searchParams.get("task") ? Number(searchParams.get("task")) : null;

  function selectTask(id: number) {
    if (board) {
      const col = board.columns.find((c) => c.tasks.some((t) => t.id === id));
      if (col && col.stage.id !== activeStageRef.current) {
        activeStageRef.current = col.stage.id;
        setModalTasks(getColumnTasksForTask(board, id));
      }
    }
    setSearchParams({ task: String(id) });
  }

  function clearSelection() {
    setSearchParams({});
    setModalTasks([]);
    activeStageRef.current = null;
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = () => {
    if (project) boardApi.get(project.id).then(setBoard);
  };

  useEffect(() => { load(); }, [project]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    await tasksApi.update(Number(active.id), { stage_id: Number(over.id) } as any);
    load();
  }

  if (!board) return <div className="loading">Loading board...</div>;

  const activeColumns = board.columns.filter((col) => col.stage.name.toLowerCase() !== "closed");
  const closedColumns = board.columns.filter((col) => col.stage.name.toLowerCase() === "closed");

  return (
    <div className="board-page">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="board-active-area">
          <div className="board">
            {activeColumns.map((col) => (
              <Column key={col.stage.id} column={col} onSelectTask={(id) => selectTask(id)} />
            ))}
          </div>
        </div>
        {closedColumns.length > 0 && (
          <div className="board-closed-area">
            {closedColumns.map((col) => (
              <Column key={col.stage.id} column={col} onSelectTask={(id) => selectTask(id)} isHorizontal />
            ))}
          </div>
        )}
      </DndContext>
      
      {selectedTaskId && (
        <TaskModal
          taskId={selectedTaskId}
          onClose={clearSelection}
          onSelectTask={(id) => selectTask(id)}
          onNavigate={(id) => navigate(`/tasks/${id}`)}
          onOpenFull={() => navigate(`/tasks/${selectedTaskId}`)}
          navigationItems={modalTasks}
          onUpdate={load}
          onDelete={() => {
            clearSelection();
            load();
          }}
        />
      )}
    </div>
  );
}
