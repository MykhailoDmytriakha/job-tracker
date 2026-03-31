const BASE = "http://localhost:8000/api";

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, statusText: string, body: string) {
    super(`${status} ${statusText}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, res.statusText, body);
  }
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
  display_id: string;
  project_id: number;
  title: string;
  status: string;
  priority: string;
  category: string | null;
  stage_id: number | null;
  parent_id: number | null;
  follow_up_date: string | null;
  due_date: string | null;
  is_recurring: boolean;
  cadence: string | null;
  next_checkpoint: string | null;
  pipeline_heat: string | null;
  lead_source: string | null;
  posting_url: string | null;
  applied_at: string | null;
  compensation: string | null;
  outreach_status: string | null;
  close_reason: string | null;
  is_blocked: boolean;
  subtask_count: number;
  subtask_done: number;
  checklist_total: number;
  checklist_done: number;
  last_activity_at: string | null;
}

export interface Activity {
  id: number;
  task_id: number;
  action: string;
  detail: string;
  timestamp: string;
}

export interface ChecklistItem {
  id: number;
  task_id: number;
  text: string;
  is_done: boolean;
  position: number;
}

export interface TaskDependencyBrief {
  id: number;
  title: string;
  status: string;
  display_id: string;
}

export interface TaskFull extends TaskBrief {
  description: string;
  created_at: string;
  updated_at: string;
  subtasks: TaskBrief[];
  activities: Activity[];
  checklist_items: ChecklistItem[];
  blocked_by: TaskDependencyBrief[];
  blocks: TaskDependencyBrief[];
  documents: DocumentBrief[];
  contacts: ContactBrief[];
  companies: CompanyBrief[];
}

export interface BoardColumn {
  stage: Stage;
  tasks: TaskBrief[];
}

export interface BoardView {
  columns: BoardColumn[];
}

export interface GraphNode {
  id: number;
  title: string;
  status: string;
  is_current: boolean;
  layer: number;
}

export interface GraphView {
  nodes: GraphNode[];
  edges: [number, number][];  // [from_id, to_id]
  total: number;
}

// --- Document ---

export interface DocumentBrief {
  id: number;
  project_id: number;
  title: string;
  doc_type: string | null;
  updated_at: string | null;
}

export interface DocumentFull extends DocumentBrief {
  content: string;
  source_path: string | null;
  created_at: string;
  tasks: TaskBrief[];
}

export const documentsApi = {
  list: (projectId: number, params?: Record<string, string>) => {
    const p = new URLSearchParams({ project_id: String(projectId), ...params });
    return request<DocumentBrief[]>(`/documents/?${p}`);
  },
  get: (id: number) => request<DocumentFull>(`/documents/${id}`),
  create: (projectId: number, data: { title: string; content?: string; doc_type?: string }) =>
    request<DocumentFull>(`/documents/?project_id=${projectId}`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<DocumentFull>) =>
    request<DocumentFull>(`/documents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ ok: boolean }>(`/documents/${id}`, { method: "DELETE" }),
  linkToTask: (taskId: number, documentId: number) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/documents`, { method: "POST", body: JSON.stringify({ document_id: documentId }) }),
  unlinkFromTask: (taskId: number, docId: number) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/documents/${docId}`, { method: "DELETE" }),
};

// --- Company ---

export interface CompanyBrief {
  id: number;
  project_id: number;
  name: string;
  short_name: string | null;
  company_type: string | null;
  domain: string | null;
  strategic_lane: string | null;
  updated_at: string | null;
}

export interface CompanyFull extends CompanyBrief {
  website: string | null;
  location: string | null;
  notes: string;
  created_at: string;
  contacts: ContactBrief[];
  tasks: TaskBrief[];
}

export const companiesApi = {
  list: (projectId: number, params?: Record<string, string>) => {
    const p = new URLSearchParams({ project_id: String(projectId), ...params });
    return request<CompanyBrief[]>(`/companies/?${p}`);
  },
  get: (id: number) => request<CompanyFull>(`/companies/${id}`),
  create: (projectId: number, data: Partial<CompanyFull>) =>
    request<CompanyFull>(`/companies/?project_id=${projectId}`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<CompanyFull>) =>
    request<CompanyFull>(`/companies/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) => request<{ ok: boolean }>(`/companies/${id}`, { method: "DELETE" }),
  linkToTask: (taskId: number, companyId: number) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/companies`, { method: "POST", body: JSON.stringify({ company_id: companyId }) }),
  unlinkFromTask: (taskId: number, companyId: number) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/companies/${companyId}`, { method: "DELETE" }),
};

// --- Contact ---

export interface ContactBrief {
  id: number;
  project_id: number;
  name: string;
  company: string | null;
  role: string | null;
  contact_type: string | null;
  email: string | null;
  updated_at: string | null;
}

export interface Interaction {
  id: number;
  contact_id: number;
  date: string;
  channel: string | null;
  direction: string | null;
  summary: string;
}

export interface ContactFull extends ContactBrief {
  phone: string | null;
  linkedin: string | null;
  department: string | null;
  location: string | null;
  notes: string;
  created_at: string;
  tasks: TaskBrief[];
  interactions: Interaction[];
}

export const contactsApi = {
  list: (projectId: number, params?: Record<string, string>) => {
    const p = new URLSearchParams({ project_id: String(projectId), ...params });
    return request<ContactBrief[]>(`/contacts/?${p}`);
  },
  get: (id: number) => request<ContactFull>(`/contacts/${id}`),
  create: (projectId: number, data: Partial<ContactFull>) =>
    request<ContactFull>(`/contacts/?project_id=${projectId}`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ContactFull>) =>
    request<ContactFull>(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) => request<{ ok: boolean }>(`/contacts/${id}`, { method: "DELETE" }),
  addInteraction: (contactId: number, data: { summary: string; channel?: string; direction?: string }) =>
    request<Interaction>(`/contacts/${contactId}/interactions`, { method: "POST", body: JSON.stringify(data) }),
  linkToTask: (taskId: number, contactId: number) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/contacts`, { method: "POST", body: JSON.stringify({ contact_id: contactId }) }),
  unlinkFromTask: (taskId: number, contactId: number) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/contacts/${contactId}`, { method: "DELETE" }),
};

// --- Category ---

export interface Category {
  id: number;
  project_id: number;
  name: string;
  color: string | null;
  position: number;
  task_count: number;
}

export const categoriesApi = {
  list: (projectId: number) => request<Category[]>(`/categories/?project_id=${projectId}`),
  create: (projectId: number, data: { name: string; color?: string }) =>
    request<Category>(`/categories/?project_id=${projectId}`, { method: "POST", body: JSON.stringify(data) }),
  rename: (id: number, data: { name: string }) =>
    request<Category>(`/categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number, force = false) =>
    request<{ ok: boolean }>(`/categories/${id}${force ? "?force=true" : ""}`, { method: "DELETE" }),
};

// --- Project ---

export interface Project {
  id: number;
  name: string;
  short_key: string;
  description: string;
  created_at: string;
}

export const projectsApi = {
  list: () => request<Project[]>("/projects/"),
  create: (data: { name: string; short_key: string; description?: string }) =>
    request<Project>("/projects/", { method: "POST", body: JSON.stringify(data) }),
  get: (id: number) => request<Project>(`/projects/${id}`),
  update: (id: number, data: Partial<Project>) =>
    request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),
};

export interface DashboardStats {
  total_open: number;
  waiting: number;
  overdue: number;
  blocked: number;
  recurring: number;
}

export interface DashboardView {
  stats: DashboardStats;
  today: TaskBrief[];
  upcoming: TaskBrief[];
  recurring: TaskBrief[];
}

// --- Board ---

export const boardApi = {
  get: (projectId?: number) => request<BoardView>(`/board/${projectId ? `?project_id=${projectId}` : ""}`),
};

// --- Dashboard ---

export const dashboardApi = {
  get: (projectId?: number) => request<DashboardView>(`/dashboard/${projectId ? `?project_id=${projectId}` : ""}`),
};

// --- Tasks ---

export const tasksApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<TaskBrief[]>(`/tasks/${qs}`);
  },
  get: (id: number) => request<TaskFull>(`/tasks/${id}`),
  create: (data: Partial<TaskFull>, projectId: number) =>
    request<TaskFull>(`/tasks/?project_id=${projectId}`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<TaskFull>) =>
    request<TaskFull>(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number, force = false) =>
    request<{ ok: boolean }>(`/tasks/${id}${force ? "?force=true" : ""}`, { method: "DELETE" }),
  addNote: (id: number, text: string) =>
    request<{ ok: boolean }>(`/tasks/${id}/note`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  // Dependencies & Chain
  getChain: (id: number) => request<GraphView>(`/tasks/${id}/chain`),
  getDependencies: (id: number) =>
    request<{ blocked_by: TaskDependencyBrief[]; blocks: TaskDependencyBrief[] }>(
      `/tasks/${id}/dependencies`
    ),
  addDependency: (id: number, dependsOnId: number) =>
    request<{ ok: boolean }>(`/tasks/${id}/dependencies`, {
      method: "POST",
      body: JSON.stringify({ depends_on_id: dependsOnId }),
    }),
  removeDependency: (id: number, depId: number) =>
    request<{ ok: boolean }>(`/tasks/${id}/dependencies/${depId}`, {
      method: "DELETE",
    }),

  // Checklist
  addChecklistItem: (taskId: number, text: string, position?: number) =>
    request<ChecklistItem>(`/tasks/${taskId}/checklist`, {
      method: "POST",
      body: JSON.stringify({ text, position: position ?? 0 }),
    }),
  updateChecklistItem: (
    taskId: number,
    itemId: number,
    data: Partial<ChecklistItem>
  ) =>
    request<ChecklistItem>(`/tasks/${taskId}/checklist/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteChecklistItem: (taskId: number, itemId: number) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/checklist/${itemId}`, {
      method: "DELETE",
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
  reorder: (ids: number[]) =>
    request<{ ok: boolean }>("/stages/reorder", {
      method: "POST",
      body: JSON.stringify(ids.map((id, i) => ({ id, position: i }))),
    }),
};
