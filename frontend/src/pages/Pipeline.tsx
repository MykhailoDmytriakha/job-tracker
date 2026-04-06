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

const boardCache = new Map<number, BoardView>();

function getLoadMessage(hasFallbackData: boolean): string {
  if (hasFallbackData) {
    return "Couldn't refresh pipeline. Showing the last loaded snapshot.";
  }
  return "Pipeline couldn't load. Retry the request.";
}

function getColumnTasksForTask(board: BoardView, taskId: number): ModalTaskItem[] {
  const col = board.columns.find((c) => c.tasks.some((t) => t.id === taskId));
  if (!col) return [];
  return col.tasks.map(({ id, display_id, title }) => ({ id, display_id, title }));
}

export function Pipeline() {
  const { active: project } = useProject();
  const projectId = project?.id ?? null;
  const navigate = useNavigate();
  const [board, setBoard] = useState<BoardView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalTasks, setModalTasks] = useState<ModalTaskItem[]>([]);
  const activeStageRef = useRef<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadRequestIdRef = useRef(0);

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

  useEffect(() => {
    const requestId = ++loadRequestIdRef.current;
    if (!projectId) {
      setBoard(null);
      setError(null);
      setLoading(false);
      return;
    }

    const activeProjectId = projectId;
    const cached = boardCache.get(activeProjectId) ?? null;
    setBoard(cached);
    setError(null);
    setLoading(!cached);

    async function load() {
      try {
        const next = await boardApi.get(activeProjectId);
        if (requestId !== loadRequestIdRef.current) return;
        boardCache.set(activeProjectId, next);
        setBoard(next);
        setError(null);
      } catch {
        if (requestId !== loadRequestIdRef.current) return;
        setError(getLoadMessage(Boolean(cached)));
        if (!cached) setBoard(null);
      } finally {
        if (requestId === loadRequestIdRef.current) {
          setLoading(false);
        }
      }
    }

    void load();
  }, [projectId, reloadKey]);

  function retryLoad() {
    setReloadKey((value) => value + 1);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    await tasksApi.update(Number(active.id), { stage_id: Number(over.id) } as any);
    retryLoad();
  }

  if (!board) {
    if (loading) return <div className="loading">Loading board...</div>;
    return (
      <div className="route-load-error">
        <div className="route-load-error-title">Pipeline unavailable</div>
        <div className="route-load-error-body">{error || "Pipeline couldn't load."}</div>
        <button type="button" className="route-load-error-btn" onClick={retryLoad}>Retry</button>
      </div>
    );
  }

  const activeColumns = board.columns.filter((col) => col.stage.name.toLowerCase() !== "closed");
  const closedColumns = board.columns.filter((col) => col.stage.name.toLowerCase() === "closed");

  return (
    <div className="board-page">
      {error && (
        <div className="route-sync-banner">
          <span>{error}</span>
          <button type="button" className="route-sync-banner-btn" onClick={retryLoad}>Retry</button>
        </div>
      )}
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
          onUpdate={retryLoad}
          onDelete={() => {
            clearSelection();
            retryLoad();
          }}
        />
      )}
    </div>
  );
}
