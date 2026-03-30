import { useEffect, useState } from "react";
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

export function Pipeline() {
  const [board, setBoard] = useState<BoardView | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = () => boardApi.get().then(setBoard);

  useEffect(() => { load(); }, []);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const taskId = Number(active.id);
    const newStageId = Number(over.id);

    await tasksApi.update(taskId, { stage_id: newStageId } as any);
    load();
  }

  if (!board) return <div className="loading">Loading board...</div>;

  return (
    <div className="board-page">
      <h1>Pipeline</h1>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="board">
          {board.columns.map((col) => (
            <Column key={col.stage.id} column={col} onRefresh={load} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
