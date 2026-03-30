import { useDroppable } from "@dnd-kit/core";
import type { BoardColumn } from "../api";
import { Card } from "./Card";

export function Column({ column, onRefresh }: { column: BoardColumn; onRefresh: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage.id });

  return (
    <div
      ref={setNodeRef}
      className={`column ${isOver ? "column-over" : ""}`}
    >
      <div className="column-header">
        <span className="column-name">{column.stage.name}</span>
        <span className="column-count">{column.tasks.length}</span>
      </div>
      <div className="column-cards">
        {column.tasks.map((task) => (
          <Card key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
