from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional


# --- Project ---


class ProjectCreate(BaseModel):
    name: str
    short_key: str
    description: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    short_key: str
    description: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Stage ---


class StageBase(BaseModel):
    name: str
    parent_id: Optional[int] = None
    position: int = 0
    description: str = ""


class StageCreate(StageBase):
    pass


class StageUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None
    position: Optional[int] = None
    description: Optional[str] = None


class StageOut(StageBase):
    id: int
    is_default: bool
    description: str = ""
    children: list["StageOut"] = []

    class Config:
        from_attributes = True


# --- Activity ---


class ActivityOut(BaseModel):
    id: int
    task_id: int
    action: str
    detail: str
    timestamp: datetime

    class Config:
        from_attributes = True


class ActivityJournalItem(BaseModel):
    id: int
    task_id: int
    display_id: str
    task_title: str
    action: str
    detail: str
    timestamp: datetime

    class Config:
        from_attributes = True


class ActivityJournalPage(BaseModel):
    items: list[ActivityJournalItem]
    total: int


# --- Checklist ---


class ChecklistItemCreate(BaseModel):
    text: str
    position: int = 0


class ChecklistItemUpdate(BaseModel):
    text: Optional[str] = None
    is_done: Optional[bool] = None
    position: Optional[int] = None


class ChecklistItemOut(BaseModel):
    id: int
    task_id: int
    text: str
    is_done: bool
    position: int

    class Config:
        from_attributes = True


# --- SubtaskItem ---


class SubtaskItemCreate(BaseModel):
    title: str
    description: str = ""
    position: int = 0


class SubtaskItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_done: Optional[bool] = None
    position: Optional[int] = None


class SubtaskItemOut(BaseModel):
    id: int
    task_id: int
    title: str
    description: str
    is_done: bool
    position: int

    class Config:
        from_attributes = True


# --- Meeting ---


class MeetingCreate(BaseModel):
    meeting_type: str
    scheduled_at: Optional[datetime] = None
    interviewer: Optional[str] = None
    platform: Optional[str] = None
    join_url: Optional[str] = None
    status: str = "scheduled"
    result: Optional[str] = None
    brief_doc_id: Optional[int] = None
    notes_doc_id: Optional[int] = None
    notes: Optional[str] = None
    position: int = 0


class MeetingUpdate(BaseModel):
    meeting_type: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    interviewer: Optional[str] = None
    platform: Optional[str] = None
    join_url: Optional[str] = None
    status: Optional[str] = None
    result: Optional[str] = None
    brief_doc_id: Optional[int] = None
    notes_doc_id: Optional[int] = None
    notes: Optional[str] = None
    position: Optional[int] = None


class MeetingOut(BaseModel):
    id: int
    task_id: int
    meeting_type: str
    scheduled_at: Optional[datetime] = None
    interviewer: Optional[str] = None
    platform: Optional[str] = None
    join_url: Optional[str] = None
    status: str
    result: Optional[str] = None
    brief_doc_id: Optional[int] = None
    notes_doc_id: Optional[int] = None
    notes: Optional[str] = None
    position: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Dependency ---


class DependencyCreate(BaseModel):
    depends_on_id: int


class TaskDependencyBrief(BaseModel):
    id: int
    title: str
    status: str
    display_id: str = ""

    class Config:
        from_attributes = True


# --- Category ---


class CategoryCreate(BaseModel):
    name: str
    color: Optional[str] = None


class CategoryOut(BaseModel):
    id: int
    project_id: int
    name: str
    color: Optional[str] = None
    position: int = 0

    class Config:
        from_attributes = True


# --- Company ---


class CompanyCreate(BaseModel):
    name: str
    short_name: Optional[str] = None
    company_type: Optional[str] = None
    domain: Optional[str] = None
    website: Optional[str] = None
    location: Optional[str] = None
    strategic_lane: Optional[str] = None
    notes: str = ""


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    short_name: Optional[str] = None
    company_type: Optional[str] = None
    domain: Optional[str] = None
    website: Optional[str] = None
    location: Optional[str] = None
    strategic_lane: Optional[str] = None
    notes: Optional[str] = None


class CompanyBrief(BaseModel):
    id: int
    project_id: int
    name: str
    short_name: Optional[str] = None
    company_type: Optional[str] = None
    domain: Optional[str] = None
    strategic_lane: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CompanyOut(CompanyBrief):
    website: Optional[str] = None
    location: Optional[str] = None
    notes: str = ""
    created_at: datetime
    contacts: list["ContactBrief"] = []
    tasks: list["TaskBrief"] = []

    class Config:
        from_attributes = True


class CompanyLinkRequest(BaseModel):
    company_id: int


# --- Interaction ---


class InteractionCreate(BaseModel):
    date: Optional[datetime] = None
    channel: Optional[str] = None
    direction: Optional[str] = None
    summary: str = ""


class InteractionOut(BaseModel):
    id: int
    contact_id: int
    date: datetime
    channel: Optional[str] = None
    direction: Optional[str] = None
    summary: str

    class Config:
        from_attributes = True


# --- Contact ---


class ContactCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    contact_type: Optional[str] = None
    notes: str = ""


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    contact_type: Optional[str] = None
    notes: Optional[str] = None


class ContactBrief(BaseModel):
    id: int
    project_id: int
    name: str
    company: Optional[str] = None
    role: Optional[str] = None
    contact_type: Optional[str] = None
    email: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ContactOut(BaseModel):
    id: int
    project_id: int
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    contact_type: Optional[str] = None
    notes: str = ""
    created_at: datetime
    updated_at: Optional[datetime] = None
    tasks: list["TaskBrief"] = []
    interactions: list[InteractionOut] = []

    class Config:
        from_attributes = True


class ContactLinkRequest(BaseModel):
    contact_id: int


# --- Document ---


class DocumentCreate(BaseModel):
    title: str
    content: str = ""
    doc_type: Optional[str] = None


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    doc_type: Optional[str] = None


class DocumentBrief(BaseModel):
    id: int
    project_id: int
    title: str
    doc_type: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DocumentOut(BaseModel):
    id: int
    project_id: int
    title: str
    content: str
    doc_type: Optional[str] = None
    source_path: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    tasks: list["TaskBrief"] = []

    class Config:
        from_attributes = True


class DocumentLinkRequest(BaseModel):
    document_id: int


# --- Task ---


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    status: str = "open"
    priority: str = "medium"
    category: Optional[str] = None
    stage_id: Optional[int] = None
    parent_id: Optional[int] = None
    follow_up_date: Optional[date] = None
    due_date: Optional[date] = None
    is_recurring: bool = False
    cadence: Optional[str] = None
    next_checkpoint: Optional[date] = None
    pipeline_heat: Optional[str] = None
    lead_source: Optional[str] = None
    posting_url: Optional[str] = None
    applied_at: Optional[date] = None
    compensation: Optional[str] = None
    outreach_status: Optional[str] = None
    close_reason: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    stage_id: Optional[int] = None
    parent_id: Optional[int] = None
    follow_up_date: Optional[date] = None
    due_date: Optional[date] = None
    is_recurring: Optional[bool] = None
    cadence: Optional[str] = None
    next_checkpoint: Optional[date] = None
    pipeline_heat: Optional[str] = None
    lead_source: Optional[str] = None
    posting_url: Optional[str] = None
    applied_at: Optional[date] = None
    compensation: Optional[str] = None
    outreach_status: Optional[str] = None
    close_reason: Optional[str] = None


class TaskBrief(BaseModel):
    id: int
    display_id: str = ""
    project_id: int = 0
    title: str
    status: str
    priority: str
    category: Optional[str] = None
    stage_id: Optional[int] = None
    parent_id: Optional[int] = None
    follow_up_date: Optional[date] = None
    due_date: Optional[date] = None
    is_recurring: bool = False
    cadence: Optional[str] = None
    next_checkpoint: Optional[date] = None
    pipeline_heat: Optional[str] = None
    lead_source: Optional[str] = None
    posting_url: Optional[str] = None
    applied_at: Optional[date] = None
    compensation: Optional[str] = None
    outreach_status: Optional[str] = None
    close_reason: Optional[str] = None
    is_blocked: bool = False
    subtask_count: int = 0
    subtask_done: int = 0
    checklist_total: int = 0
    checklist_done: int = 0
    meetings_total: int = 0
    meetings_upcoming: int = 0
    last_activity_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TaskOut(BaseModel):  # noqa: F811
    id: int
    display_id: str = ""
    project_id: int = 0
    title: str
    description: str
    meetings: list[MeetingOut] = []
    status: str
    priority: str
    category: Optional[str] = None
    stage_id: Optional[int] = None
    parent_id: Optional[int] = None
    follow_up_date: Optional[date] = None
    due_date: Optional[date] = None
    is_recurring: bool = False
    cadence: Optional[str] = None
    next_checkpoint: Optional[date] = None
    pipeline_heat: Optional[str] = None
    lead_source: Optional[str] = None
    posting_url: Optional[str] = None
    applied_at: Optional[date] = None
    compensation: Optional[str] = None
    outreach_status: Optional[str] = None
    close_reason: Optional[str] = None
    is_blocked: bool = False
    created_at: datetime
    updated_at: datetime
    subtask_count: int = 0
    subtask_done: int = 0
    checklist_total: int = 0
    checklist_done: int = 0
    meetings_total: int = 0
    meetings_upcoming: int = 0
    last_activity_at: Optional[datetime] = None
    subtask_items: list[SubtaskItemOut] = []
    activities: list[ActivityOut] = []
    checklist_items: list[ChecklistItemOut] = []
    blocked_by: list[TaskDependencyBrief] = []
    blocks: list[TaskDependencyBrief] = []
    documents: list[DocumentBrief] = []
    contacts: list[ContactBrief] = []
    companies: list[CompanyBrief] = []

    class Config:
        from_attributes = True


# --- Board ---


class BoardColumn(BaseModel):
    stage: StageOut
    tasks: list[TaskBrief] = []


class BoardView(BaseModel):
    columns: list[BoardColumn] = []


# --- Global Search ---


class SearchHit(BaseModel):
    entity_type: str          # "task" | "contact" | "company" | "document" | "activity" | "interaction"
    id: int
    title: str                # Primary display text
    subtitle: Optional[str] = None
    matched_fields: list[str] = []
    display_id: Optional[str] = None   # task display_id e.g. "EJS-42"
    task_id: Optional[int] = None      # activity → owning task
    contact_id: Optional[int] = None   # interaction → owning contact
    linked_task_ids: list[int] = []    # contact/company/document → linked task ids


class SearchResultGroup(BaseModel):
    entity_type: str
    count: int
    hits: list[SearchHit]


class SearchResponse(BaseModel):
    query: str
    total: int
    groups: list[SearchResultGroup]


# --- Dashboard ---


class DashboardStats(BaseModel):
    total_open: int = 0
    waiting: int = 0
    overdue: int = 0
    blocked: int = 0
    recurring: int = 0
    attention: int = 0


class DashboardView(BaseModel):
    stats: DashboardStats
    today: list[TaskBrief] = []
    upcoming: list[TaskBrief] = []
    recurring: list[TaskBrief] = []
