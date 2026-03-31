import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

export function Pipeline() {
  const { active: project } = useProject();
  const navigate = useNavigate();
  const [board, setBoard] = useState<BoardView | null>(null);

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

  return (
    <div className="board-page">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="board">
          {board.columns.map((col) => (
            <Column key={col.stage.id} column={col} onSelectTask={(id) => navigate(`/tasks?selected=${id}`)} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
