const BASE = "http://localhost:8000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// --- Types ---

export interface Stage {
  id: number;
  name: string;
  parent_id: number | null;
  position: number;
  is_default: boolean;
  children: Stage[];
}

export interface TaskBrief {
  id: number;
  title: string;
  status: string;
  priority: string;
  stage_id: number | null;
  parent_id: number | null;
  follow_up_date: string | null;
  subtask_count: number;
  subtask_done: number;
}

export interface Activity {
  id: number;
  task_id: number;
  action: string;
  detail: string;
  timestamp: string;
}

export interface TaskFull extends TaskBrief {
  description: string;
  created_at: string;
  updated_at: string;
  subtasks: TaskBrief[];
  activities: Activity[];
}

export interface BoardColumn {
  stage: Stage;
  tasks: TaskBrief[];
}

export interface BoardView {
  columns: BoardColumn[];
}

// --- Board ---

export const boardApi = {
  get: () => request<BoardView>("/board/"),
};

// --- Tasks ---

export const tasksApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<TaskBrief[]>(`/tasks/${qs}`);
  },
  get: (id: number) => request<TaskFull>(`/tasks/${id}`),
  create: (data: Partial<TaskFull>) =>
    request<TaskFull>("/tasks/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<TaskFull>) =>
    request<TaskFull>(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ ok: boolean }>(`/tasks/${id}`, { method: "DELETE" }),
  addNote: (id: number, text: string) =>
    request<{ ok: boolean }>(`/tasks/${id}/note`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
};

// --- Stages ---

export const stagesApi = {
  list: () => request<Stage[]>("/stages/"),
  create: (data: Partial<Stage>) =>
    request<Stage>("/stages/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Stage>) =>
    request<Stage>(`/stages/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ ok: boolean }>(`/stages/${id}`, { method: "DELETE" }),
};
