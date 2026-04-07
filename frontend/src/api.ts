const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, statusText: string, body: string) {
    super(`${status} ${statusText}`);
    this.status = status;
    this.body = body;
  }
}

export function getAuthToken(): string | null {
  return localStorage.getItem("token");
}

export function setAuthToken(token: string) {
  localStorage.setItem("token", token);
}

export function clearAuthToken() {
  localStorage.removeItem("token");
}

const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Timezone": browserTimezone,
  };
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
  });
  if (res.status === 401) {
    clearAuthToken();
    window.location.href = "/login";
    throw new ApiError(401, "Unauthorized", "Session expired");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, res.statusText, body);
  }
  return res.json();
}

// --- Auth API ---

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  timezone: string | null;
  created_at: string;
}

export interface ApiToken {
  id: number;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiTokenCreated extends ApiToken {
  token: string; // full token, shown once
}

export const authApi = {
  googleLogin: (credential: string) =>
    request<{ access_token: string; token_type: string }>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),
  me: () => request<AuthUser>("/auth/me"),
  listTokens: () => request<ApiToken[]>("/auth/tokens"),
  createToken: (name: string) =>
    request<ApiTokenCreated>("/auth/tokens", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteToken: (id: number) =>
    request<{ detail: string }>(`/auth/tokens/${id}`, { method: "DELETE" }),
};

// --- Types ---

export interface Stage {
  id: number;
  name: string;
  parent_id: number | null;
  position: number;
  is_default: boolean;
  description: string;
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
  meetings_total: number;
  meetings_upcoming: number;
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

export interface SubtaskItem {
  id: number;
  task_id: number;
  title: string;
  description: string;
  is_done: boolean;
  position: number;
}

export interface CockpitSection {
  id: number;
  meeting_id: number;
  section_key: string;
  content: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: number;
  task_id: number;
  meeting_type: string;
  scheduled_at: string | null;
  interviewer: string | null;
  platform: string | null;
  join_url: string | null;
  status: string;
  result: string | null;
  brief_doc_id: number | null;
  notes_doc_id: number | null;
  notes: string | null;
  position: number;
  cockpit_sections: CockpitSection[];
  created_at: string;
  updated_at: string;
}

export interface MeetingWithContext {
  id: number;
  task_id: number;
  task_display_id: string;
  task_title: string;
  task_status: string;
  task_stage_id: number | null;
  task_pipeline_heat: string | null;
  meeting_type: string;
  scheduled_at: string | null;
  interviewer: string | null;
  platform: string | null;
  join_url: string | null;
  status: string;
  result: string | null;
  brief_doc_id: number | null;
  notes_doc_id: number | null;
  notes: string | null;
  position: number;
  cockpit_section_count: number;
  created_at: string;
  updated_at: string;
}

export interface TaskFull extends TaskBrief {
  description: string;
  meetings: Meeting[];
  meetings_total: number;
  meetings_upcoming: number;
  created_at: string;
  updated_at: string;
  subtask_items: SubtaskItem[];
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
  attention: number;
  meetings_this_week: number;
}

export interface DashboardView {
  stats: DashboardStats;
  today: TaskBrief[];
  upcoming: TaskBrief[];
  recurring: TaskBrief[];
  meetings_next: MeetingWithContext[];
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
  addLog: (id: number, text: string) =>
    request<{ ok: boolean }>(`/tasks/${id}/log`, {
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

  // Subtask Items
  addSubtaskItem: (taskId: number, title: string, description?: string) =>
    request<SubtaskItem>(`/tasks/${taskId}/subtask-items`, {
      method: "POST",
      body: JSON.stringify({ title, description: description ?? "" }),
    }),
  updateSubtaskItem: (taskId: number, itemId: number, data: Partial<SubtaskItem>) =>
    request<SubtaskItem>(`/tasks/${taskId}/subtask-items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteSubtaskItem: (taskId: number, itemId: number) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/subtask-items/${itemId}`, {
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

// --- Meetings ---

export interface MeetingsAggregatedQuery {
  projectId?: number;
  status?: string;
  meetingType?: string;
  since?: string;     // ISO-8601
  until?: string;     // ISO-8601
  days?: number;      // convenience window from now
  includePast?: boolean;
  includeUnscheduled?: boolean;
  limit?: number;
}

export const meetingsApi = {
  list: (taskId: number) =>
    request<Meeting[]>(`/tasks/${taskId}/meetings`),
  listAggregated: (q: MeetingsAggregatedQuery = {}) => {
    const p = new URLSearchParams();
    if (q.projectId !== undefined) p.set("project_id", String(q.projectId));
    if (q.status) p.set("status", q.status);
    if (q.meetingType) p.set("meeting_type", q.meetingType);
    if (q.since) p.set("since", q.since);
    if (q.until) p.set("until", q.until);
    if (q.days !== undefined) p.set("days", String(q.days));
    if (q.includePast) p.set("include_past", "true");
    if (q.includeUnscheduled === false) p.set("include_unscheduled", "false");
    if (q.limit !== undefined) p.set("limit", String(q.limit));
    const qs = p.toString();
    return request<MeetingWithContext[]>(`/meetings${qs ? `?${qs}` : ""}`);
  },
  add: (taskId: number, data: Partial<Meeting>) =>
    request<Meeting>(`/tasks/${taskId}/meetings`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (taskId: number, meetingId: number, data: Partial<Meeting>) =>
    request<Meeting>(`/tasks/${taskId}/meetings/${meetingId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (taskId: number, meetingId: number) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/meetings/${meetingId}`, {
      method: "DELETE",
    }),
  getCockpit: (taskId: number, meetingId: number) =>
    request<CockpitSection[]>(`/tasks/${taskId}/meetings/${meetingId}/cockpit`),
  saveCockpit: (taskId: number, meetingId: number, sections: { section_key: string; content: string; position: number }[]) =>
    request<CockpitSection[]>(`/tasks/${taskId}/meetings/${meetingId}/cockpit`, {
      method: "PUT",
      body: JSON.stringify(sections),
    }),
  saveCockpitSection: (taskId: number, meetingId: number, sectionKey: string, content: string) =>
    request<CockpitSection>(`/tasks/${taskId}/meetings/${meetingId}/cockpit/${sectionKey}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
};

// --- Global Search ---

export interface SearchHit {
  entity_type: string;
  id: number;
  title: string;
  subtitle: string | null;
  matched_fields: string[];
  display_id: string | null;
  task_id: number | null;
  contact_id: number | null;
  linked_task_ids: number[];
}

export interface SearchResultGroup {
  entity_type: string;
  count: number;
  hits: SearchHit[];
}

export interface SearchResponse {
  query: string;
  total: number;
  groups: SearchResultGroup[];
}

export const searchApi = {
  search: (projectId: number, q: string) =>
    request<SearchResponse>(`/search/?project_id=${projectId}&q=${encodeURIComponent(q)}`),
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
