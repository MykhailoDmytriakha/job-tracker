import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { BoardColumn } from "../api";
import { Card } from "./Card";
import { HintBubble } from "./HintBubble";

export function Column({ column, onSelectTask, isHorizontal }: { column: BoardColumn; onSelectTask?: (id: number) => void; isHorizontal?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage.id });
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div
      ref={setNodeRef}
      className={`column ${isHorizontal ? "column-horizontal" : ""} ${isOver ? "column-over" : ""} ${isCollapsed ? "column-collapsed" : ""}`}
    >
      <div
        className="column-header"
        onClick={() => isHorizontal && setIsCollapsed(!isCollapsed)}
        style={{ cursor: isHorizontal ? "pointer" : "default" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span className="column-name">{column.stage.name}</span>
          {isHorizontal && (
            <span style={{ fontSize: "10px", color: "var(--text-faint)", transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
              ▼
            </span>
          )}
          {column.stage.description && (
            <HintBubble text={column.stage.description} />
          )}
        </div>
        <span className="column-count">{column.tasks.length}</span>
      </div>
      {!isCollapsed && (
        <div className={`column-cards ${isHorizontal ? "column-cards-horizontal" : ""}`}>
          {[...column.tasks]
            .sort((a, b) => {
              const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
              const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
              return tb - ta;
            })
            .map((task) => (
              <Card key={task.id} task={task} onSelect={onSelectTask} />
            ))}
        </div>
      )}
    </div>
  );
}
