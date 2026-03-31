from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Table,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from .database import Base


task_dependencies = Table(
    "task_dependencies",
    Base.metadata,
    Column(
        "task_id",
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "depends_on_id",
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    short_key = Column(String(5), nullable=False, unique=True)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")


class Stage(Base):
    __tablename__ = "stages"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    parent_id = Column(Integer, ForeignKey("stages.id"), nullable=True)
    position = Column(Integer, default=0)
    is_default = Column(Boolean, default=False)

    parent = relationship("Stage", remote_side=[id], backref="children")
    tasks = relationship("Task", back_populates="stage")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    sequence_num = Column(Integer, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    status = Column(String, default="open")  # open, in_progress, waiting, done, closed
    priority = Column(String, default="medium")  # high, medium, low
    category = Column(String, nullable=True)
    stage_id = Column(Integer, ForeignKey("stages.id"), nullable=True)
    parent_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    follow_up_date = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    is_recurring = Column(Boolean, default=False)
    cadence = Column(String, nullable=True)
    next_checkpoint = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("project_id", "sequence_num", name="uq_project_sequence"),
    )

    project = relationship("Project", back_populates="tasks")
    stage = relationship("Stage", back_populates="tasks")
    parent = relationship("Task", remote_side=[id], backref="subtasks")
    activities = relationship(
        "Activity", back_populates="task", order_by="Activity.timestamp.desc()",
        cascade="all, delete-orphan",
    )
    checklist_items = relationship(
        "ChecklistItem",
        back_populates="task",
        order_by="ChecklistItem.position",
        cascade="all, delete-orphan",
    )
    blocked_by = relationship(
        "Task",
        secondary=task_dependencies,
        primaryjoin="Task.id == task_dependencies.c.task_id",
        secondaryjoin="Task.id == task_dependencies.c.depends_on_id",
        backref="blocks",
    )

    @property
    def display_id(self) -> str:
        return f"{self.project.short_key}-{self.sequence_num}"


class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    text = Column(String, nullable=False)
    is_done = Column(Boolean, default=False)
    position = Column(Integer, default=0)

    task = relationship("Task", back_populates="checklist_items")


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    action = Column(String, nullable=False)
    detail = Column(Text, default="")
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    task = relationship("Task", back_populates="activities")
