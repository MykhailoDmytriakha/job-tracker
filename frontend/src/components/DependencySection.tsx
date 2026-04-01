import { useState, useRef, useEffect } from "react";
import { tasksApi } from "../api";
import type { TaskDependencyBrief, TaskBrief, GraphNode } from "../api";

type ViewMode = "tree" | "graph" | "list";

export function DependencySection({
  taskId,
  blockedBy,
  blocks,
  onUpdate,
  onNavigate,
}: {
  taskId: number;
  blockedBy: TaskDependencyBrief[];
  blocks: TaskDependencyBrief[];
  onUpdate: () => void;
  onNavigate: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [allTasks, setAllTasks] = useState<TaskBrief[]>([]);
  const [pickerMode, setPickerMode] = useState<"blocked-by" | "blocking" | null>(null);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<[number, number][]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tasksApi.getChain(taskId).then((data) => {
      setGraphNodes(data.nodes);
      setGraphEdges(data.edges);
    });
  }, [taskId, blockedBy, blocks]);

  async function openPicker(mode: "blocked-by" | "blocking") {
    if (allTasks.length === 0) {
      const tasks = await tasksApi.list({ root_only: "true" });
      setAllTasks(tasks);
    }
    setPickerMode(mode);
    setSearch("");
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPickerMode(null);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const linkedIds = new Set([taskId, ...blockedBy.map(d => d.id), ...blocks.map(d => d.id)]);
  const filtered = allTasks
    .filter((t) => !linkedIds.has(t.id))
    .filter((t) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase().replace(/^#/, "");
      return (
        t.title.toLowerCase().includes(q) ||
        t.id.toString().includes(q) ||
        (t.display_id && t.display_id.toLowerCase().includes(q))
      );
    })
    .slice(0, 50);

  async function addFromPicker(otherId: number) {
    if (pickerMode === "blocked-by") {
      // This task is blocked by other
      await tasksApi.addDependency(taskId, otherId);
    } else {
      // Other task is blocked by this task
      await tasksApi.addDependency(otherId, taskId);
    }
    onUpdate();
  }

  async function removeDep(e: React.MouseEvent, depId: number) {
    e.stopPropagation();
    await tasksApi.removeDependency(taskId, depId);
    onUpdate();
  }

  const isResolved = (s: string) => s === "done" || s === "closed";
  const hasGraph = graphNodes.length > 0;

  return (
    <div className="detail-section">
      <div className="detail-section-label">
        Dependencies
        {blockedBy.length > 0 && (
          <span className="dep-summary">
            {blockedBy.filter(d => !isResolved(d.status)).length} blocking
          </span>
        )}
        {hasGraph && (
          <div className="dep-view-toggle">
            <button
              className={`dep-view-btn ${viewMode === "tree" ? "active" : ""}`}
              onClick={() => setViewMode("tree")}
              title="Tree view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M4 2v4M4 6h4M8 6v2M4 6v4M4 10h4M8 10v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              className={`dep-view-btn ${viewMode === "graph" ? "active" : ""}`}
              onClick={() => setViewMode("graph")}
              title="Graph view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="3" cy="3" r="2" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="11" cy="3" r="2" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="7" cy="11" r="2" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M4.5 4.5L6 9.5M9.5 4.5L8 9.5" stroke="currentColor" strokeWidth="1"/>
              </svg>
            </button>
            <button
              className={`dep-view-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 3h10M2 7h10M2 11h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* TREE VIEW */}
      {hasGraph && viewMode === "tree" && (
        <DepTree
          nodes={graphNodes}
          edges={graphEdges}
          currentId={taskId}
          blockedByIds={new Set(blockedBy.map(d => d.id))}
          onNavigate={onNavigate}
          onRemoveDep={removeDep}
        />
      )}

      {/* GRAPH VIEW */}
      {hasGraph && viewMode === "graph" && (
        <DagGraph
          nodes={graphNodes}
          edges={graphEdges}
          blockedByIds={new Set(blockedBy.map(d => d.id))}
          onNavigate={onNavigate}
          onRemoveDep={removeDep}
        />
      )}

      {/* LIST VIEW (or fallback when no graph) */}
      {(viewMode === "list" || !hasGraph) && (
        <>
          {blockedBy.length > 0 && (
            <>
              <div className="dep-group-label">Blocked by</div>
              <div className="dep-list">
                {blockedBy.map((dep) => {
                  const resolved = isResolved(dep.status);
                  return (
                    <div key={dep.id} className={`dep-item clickable ${resolved ? "resolved" : "unresolved"}`} onClick={() => onNavigate(dep.id)} title={`Click to open #${dep.id}`}>
                      <span className="dep-title">#{dep.id} {dep.title}</span>
                      <span className={`dep-status ${resolved ? "resolved" : "unresolved"}`}>{dep.status}</span>
                      <button className="dep-remove" onClick={(e) => removeDep(e, dep.id)} title="Remove">&times;</button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {blocks.length > 0 && (
            <>
              <div className="dep-group-label" style={{ marginTop: 8 }}>Blocks</div>
              <div className="dep-list">
                {blocks.map((dep) => {
                  const resolved = isResolved(dep.status);
                  return (
                    <div key={dep.id} className={`dep-item clickable ${resolved ? "resolved" : "unresolved"}`} onClick={() => onNavigate(dep.id)} title={`Click to open #${dep.id}`}>
                      <span className="dep-title">#{dep.id} {dep.title}</span>
                      <span className={`dep-status ${resolved ? "resolved" : "unresolved"}`}>{dep.status}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Add dependency: two directions */}
      <div className="dep-add" ref={containerRef}>
        {!pickerMode ? (
          <div className="dep-add-buttons">
            <button
              className="dep-add-btn"
              onClick={() => openPicker("blocked-by")}
              title="Add a task that must be done BEFORE this one (parent)"
            >
              <svg className="dep-btn-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M4 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Blocked by...
            </button>
            <button
              className="dep-add-btn"
              onClick={() => openPicker("blocking")}
              title="Add a task that can't start UNTIL this one is done (child)"
            >
              Blocking...
              <svg className="dep-btn-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M4 9l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        ) : (
          <>
            <div className="dep-picker-label">
              {pickerMode === "blocked-by"
                ? "Select a task that must finish BEFORE this one:"
                : "Select a task that can't start UNTIL this one is done:"}
            </div>
            <input
              className="dep-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter tasks..."
              autoFocus
            />
            <div className="dep-picker">
              {filtered.length === 0 ? (
                <div className="dep-picker-empty">No matching tasks</div>
              ) : (
                filtered.map((t) => (
                  <div key={t.id} className="dep-picker-item" onClick={() => addFromPicker(t.id)}>
                    <span className="dep-picker-id">#{t.id}</span>
                    <span className="dep-picker-title">{t.title}</span>
                    <span className={`dep-picker-status ${isResolved(t.status) ? "resolved" : ""}`}>{t.status}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* === Tree Renderer — Decomposition view
   Top = end goal (close last), children = prerequisites (close first)
   ============================================================ */

function DepTree({
  nodes,
  edges,
  currentId,
  blockedByIds,
  onNavigate,
  onRemoveDep,
}: {
  nodes: GraphNode[];
  edges: [number, number][];
  currentId: number;
  blockedByIds: Set<number>;
  onNavigate: (id: number) => void;
  onRemoveDep: (e: React.MouseEvent, id: number) => void;
}) {
  // edges: [from, to] means "from blocks to" (from must finish before to)
  // Decomposition view: "to" is the goal, "from" is prerequisite (child in tree)
  const childrenOf: Map<number, number[]> = new Map(); // downstream
  for (const [from, to] of edges) {
    const arr = childrenOf.get(from) || [];
    arr.push(to);
    childrenOf.set(from, arr);
  }

  // Decomposition: tree top = end goal, children = prerequisites
  // edges: [from, to] = from blocks to. In tree: to is parent, from is child.
  // "prereqsOf" = for a given goal, what must be done first (= its blockers)
  const prereqsOf: Map<number, number[]> = new Map();
  for (const [from, to] of edges) {
    const arr = prereqsOf.get(to) || [];
    arr.push(from);
    prereqsOf.set(to, arr);
  }

  // Tree roots = end goals (nodes that block nothing downstream)
  const goals = nodes.filter(n => !childrenOf.get(n.id)?.length);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const isResolved = (s: string) => s === "done" || s === "closed";
  const visited = new Set<number>();

  function renderNode(nodeId: number, depth: number, isLast: boolean, prefix: string): React.ReactNode {
    const node = nodeMap.get(nodeId);
    if (!node) return null;
    const done = isResolved(node.status);
    const current = node.id === currentId;
    const isBlocker = blockedByIds.has(node.id);
    const prereqs = prereqsOf.get(nodeId) || [];
    const connector = depth === 0 ? "" : isLast ? "\u2514\u2500 " : "\u251C\u2500 ";

    // Already shown: reference link
    if (visited.has(nodeId)) {
      return (
        <div key={`${nodeId}-ref-${depth}`}>
          <div className={`dep-tree-node ref`} onClick={() => { if (!current) onNavigate(node.id); }}>
            <span className="dep-tree-prefix">{prefix}{connector}</span>
            <span className="dep-tree-label ref-label">{"\u2197"} {node.title}</span>
            <span className="dep-tree-status">see above</span>
          </div>
        </div>
      );
    }
    visited.add(nodeId);

    return (
      <div key={nodeId}>
        <div
          className={`dep-tree-node ${current ? "current" : ""} ${done ? "done" : ""}`}
          onClick={() => { if (!current) onNavigate(node.id); }}
          title={current ? "Current task" : `Click to open #${node.id}`}
        >
          <span className="dep-tree-prefix">{prefix}{connector}</span>
          <span className="dep-tree-label">{done ? "\u2713 " : ""}{node.title}</span>
          <span className={`dep-tree-status ${done ? "done" : ""}`}>{current ? "current" : node.status}</span>
          {isBlocker && !done && (
            <button className="dep-tree-remove" onClick={(e) => onRemoveDep(e, node.id)} title="Remove dependency">&times;</button>
          )}
        </div>
        {prereqs.map((pid, i) => {
          const childIsLast = i === prereqs.length - 1;
          const childPrefix = depth === 0 ? "" : prefix + (isLast ? "   " : "\u2502  ");
          return renderNode(pid, depth + 1, childIsLast, childPrefix);
        })}
      </div>
    );
  }

  return (
    <div className="dep-tree">
      {goals.map((g, i) => renderNode(g.id, 0, i === goals.length - 1, ""))}
    </div>
  );
}


/* === DAG Graph Renderer === */

const NODE_W = 120;
const NODE_H = 44;
const LAYER_GAP = 60;
const NODE_GAP = 16;

function DagGraph({
  nodes,
  edges,
  blockedByIds,
  onNavigate,
  onRemoveDep,
}: {
  nodes: GraphNode[];
  edges: [number, number][];
  blockedByIds: Set<number>;
  onNavigate: (id: number) => void;
  onRemoveDep: (e: React.MouseEvent, id: number) => void;
}) {
  // Group nodes by layer
  const layers: Map<number, GraphNode[]> = new Map();
  for (const n of nodes) {
    const arr = layers.get(n.layer) || [];
    arr.push(n);
    layers.set(n.layer, arr);
  }
  const maxLayer = Math.max(...nodes.map(n => n.layer));
  const maxPerLayer = Math.max(...Array.from(layers.values()).map(l => l.length));

  // Position each node
  const positions: Map<number, { x: number; y: number }> = new Map();
  for (let layer = 0; layer <= maxLayer; layer++) {
    const layerNodes = layers.get(layer) || [];
    const totalHeight = layerNodes.length * NODE_H + (layerNodes.length - 1) * NODE_GAP;
    const startY = (maxPerLayer * (NODE_H + NODE_GAP) - NODE_GAP - totalHeight) / 2;
    layerNodes.forEach((n, i) => {
      positions.set(n.id, {
        x: layer * (NODE_W + LAYER_GAP),
        y: startY + i * (NODE_H + NODE_GAP),
      });
    });
  }

  const svgW = (maxLayer + 1) * (NODE_W + LAYER_GAP) - LAYER_GAP + 16;
  const svgH = maxPerLayer * (NODE_H + NODE_GAP) - NODE_GAP + 16;

  const isResolved = (s: string) => s === "done" || s === "closed";

  return (
    <div className="dag-container">
      <svg width={svgW} height={svgH} className="dag-svg">
        {/* Edges with arrows */}
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6" fill="var(--text-faint)" />
          </marker>
          <marker id="arrowhead-done" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6" fill="var(--green)" />
          </marker>
        </defs>
        {edges.map(([fromId, toId], i) => {
          const from = positions.get(fromId);
          const to = positions.get(toId);
          if (!from || !to) return null;
          const fromNode = nodes.find(n => n.id === fromId);
          const done = fromNode && isResolved(fromNode.status);
          return (
            <line
              key={i}
              x1={from.x + NODE_W + 8}
              y1={from.y + NODE_H / 2 + 8}
              x2={to.x + 8 - 2}
              y2={to.y + NODE_H / 2 + 8}
              stroke={done ? "var(--green)" : "var(--border-strong)"}
              strokeWidth="1.5"
              markerEnd={done ? "url(#arrowhead-done)" : "url(#arrowhead)"}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const done = isResolved(node.status);
          const current = node.is_current;
          const isBlocker = blockedByIds.has(node.id);

          return (
            <g key={node.id}>
              <rect
                x={pos.x + 8}
                y={pos.y + 8}
                width={NODE_W}
                height={NODE_H}
                rx="6"
                fill={current ? "var(--accent-soft)" : done ? "var(--green-soft)" : "var(--bg-card)"}
                stroke={current ? "var(--accent)" : done ? "var(--green)" : "var(--border)"}
                strokeWidth={current ? "2" : "1"}
                style={{ cursor: current ? "default" : "pointer" }}
                onClick={() => { if (!current) onNavigate(node.id); }}
              />
              <text
                x={pos.x + 8 + NODE_W / 2}
                y={pos.y + 8 + 18}
                textAnchor="middle"
                fontSize="11"
                fontWeight={current ? "700" : "500"}
                fill={current ? "var(--accent)" : done ? "var(--green)" : "var(--text)"}
                style={{ cursor: current ? "default" : "pointer", pointerEvents: "none" }}
              >
                {node.title.length > 14 ? node.title.slice(0, 13) + "..." : node.title}
              </text>
              <text
                x={pos.x + 8 + NODE_W / 2}
                y={pos.y + 8 + 34}
                textAnchor="middle"
                fontSize="9"
                fill="var(--text-faint)"
                style={{ pointerEvents: "none", textTransform: "uppercase", letterSpacing: "0.3px" }}
              >
                {current ? "you are here" : node.status}
              </text>
              {/* Remove button for direct blockers */}
              {isBlocker && !done && (
                <g
                  style={{ cursor: "pointer" }}
                  onClick={(e: any) => onRemoveDep(e, node.id)}
                >
                  <circle cx={pos.x + 8 + NODE_W - 2} cy={pos.y + 10} r="7" fill="var(--red)" />
                  <text x={pos.x + 8 + NODE_W - 2} y={pos.y + 14} textAnchor="middle" fontSize="10" fill="white" fontWeight="700" style={{ pointerEvents: "none" }}>x</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
