from pydantic import BaseModel
from datetime import datetime
from typing import Optional


# --- Stage ---


class StageBase(BaseModel):
    name: str
    parent_id: Optional[int] = None
    position: int = 0


class StageCreate(StageBase):
    pass


class StageUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None
    position: Optional[int] = None


class StageOut(StageBase):
    id: int
    is_default: bool
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


# --- Task ---


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    status: str = "open"
    priority: str = "medium"
    stage_id: Optional[int] = None
    parent_id: Optional[int] = None
    follow_up_date: Optional[datetime] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    stage_id: Optional[int] = None
    parent_id: Optional[int] = None
    follow_up_date: Optional[datetime] = None


class TaskBrief(BaseModel):
    id: int
    title: str
    status: str
    priority: str
    stage_id: Optional[int] = None
    parent_id: Optional[int] = None
    follow_up_date: Optional[datetime] = None
    subtask_count: int = 0
    subtask_done: int = 0

    class Config:
        from_attributes = True


class TaskOut(BaseModel):
    id: int
    title: str
    description: str
    status: str
    priority: str
    stage_id: Optional[int] = None
    parent_id: Optional[int] = None
    follow_up_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    subtasks: list["TaskBrief"] = []
    activities: list[ActivityOut] = []

    class Config:
        from_attributes = True


# --- Board ---


class BoardColumn(BaseModel):
    stage: StageOut
    tasks: list[TaskBrief] = []


class BoardView(BaseModel):
    columns: list[BoardColumn] = []
