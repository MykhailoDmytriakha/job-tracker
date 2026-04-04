from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Date, ForeignKey, Boolean, Table,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    picture = Column(String, nullable=True)
    google_id = Column(String, unique=True, nullable=True, index=True)
    timezone = Column(String, nullable=True)  # IANA tz, e.g. "America/Los_Angeles"
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_login = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    projects = relationship("Project", back_populates="owner")
    api_tokens = relationship("ApiToken", back_populates="user", cascade="all, delete-orphan")


class ApiToken(Base):
    __tablename__ = "api_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    token_hash = Column(String, nullable=False, index=True)
    token_prefix = Column(String(10), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_used_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="api_tokens")


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


task_companies = Table(
    "task_companies",
    Base.metadata,
    Column("task_id", Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("company_id", Integer, ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True),
)

task_contacts = Table(
    "task_contacts",
    Base.metadata,
    Column("task_id", Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("contact_id", Integer, ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True),
)

task_documents = Table(
    "task_documents",
    Base.metadata,
    Column(
        "task_id",
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "document_id",
        Integer,
        ForeignKey("documents.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)
    short_key = Column(String(5), nullable=False, unique=True)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="projects")
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String, nullable=False)
    color = Column(String, nullable=True)
    position = Column(Integer, default=0)

    project = relationship("Project", backref="categories")


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String, nullable=False)
    short_name = Column(String, nullable=True)
    company_type = Column(String, nullable=True)
    domain = Column(String, nullable=True)
    website = Column(String, nullable=True)
    location = Column(String, nullable=True)
    strategic_lane = Column(String, nullable=True)
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", backref="companies")
    contacts = relationship("Contact", back_populates="company_rel", foreign_keys="Contact.company_id")
    tasks = relationship("Task", secondary=task_companies, back_populates="companies")


class Stage(Base):
    __tablename__ = "stages"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    parent_id = Column(Integer, ForeignKey("stages.id"), nullable=True)
    position = Column(Integer, default=0)
    is_default = Column(Boolean, default=False)
    description = Column(Text, default="")

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
    follow_up_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    is_recurring = Column(Boolean, default=False)
    cadence = Column(String, nullable=True)
    next_checkpoint = Column(Date, nullable=True)
    # Pipeline fields (visible when stage_id is set)
    pipeline_heat = Column(String, nullable=True)  # hot, warm, cold, archived
    lead_source = Column(String, nullable=True)  # job_board, linkedin, referral, direct, cold_outreach
    posting_url = Column(String, nullable=True)
    applied_at = Column(Date, nullable=True)
    compensation = Column(String, nullable=True)
    outreach_status = Column(String, nullable=True)  # not_started, searching, contacted, replied, connected, dead_end
    close_reason = Column(String, nullable=True)  # skipped, not_a_fit, rejected, ghosted, withdrawn, duplicate
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
    subtask_items = relationship(
        "SubtaskItem",
        back_populates="task",
        order_by="SubtaskItem.position",
        cascade="all, delete-orphan",
    )
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
    meetings = relationship(
        "Meeting",
        back_populates="task",
        order_by="Meeting.position",
        cascade="all, delete-orphan",
    )
    documents = relationship("Document", secondary=task_documents, back_populates="tasks")
    contacts = relationship("Contact", secondary=task_contacts, back_populates="tasks")
    companies = relationship("Company", secondary=task_companies, back_populates="tasks")
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


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    title = Column(String, nullable=False)
    content = Column(Text, default="")
    doc_type = Column(String, nullable=True)  # research, playbook, reference, journal
    source_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", backref="documents")
    tasks = relationship("Task", secondary=task_documents, back_populates="documents")


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    linkedin = Column(String, nullable=True)
    company = Column(String, nullable=True)  # legacy string, kept for display
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    role = Column(String, nullable=True)
    department = Column(String, nullable=True)
    location = Column(String, nullable=True)
    contact_type = Column(String, nullable=True)
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", backref="contacts")
    company_rel = relationship("Company", back_populates="contacts", foreign_keys=[company_id])
    tasks = relationship("Task", secondary=task_contacts, back_populates="contacts")
    interactions = relationship(
        "Interaction", back_populates="contact",
        order_by="Interaction.date.desc()",
        cascade="all, delete-orphan",
    )


class Interaction(Base):
    __tablename__ = "interactions"

    id = Column(Integer, primary_key=True, index=True)
    contact_id = Column(Integer, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False)
    date = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    channel = Column(String, nullable=True)
    direction = Column(String, nullable=True)
    summary = Column(Text, default="")

    contact = relationship("Contact", back_populates="interactions")


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


class SubtaskItem(Base):
    __tablename__ = "subtask_items"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    is_done = Column(Boolean, default=False)
    position = Column(Integer, default=0)

    task = relationship("Task", back_populates="subtask_items")


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    meeting_type = Column(String, nullable=False)  # phone_screen | technical | behavioral | panel | onsite | other
    scheduled_at = Column(DateTime, nullable=True)
    interviewer = Column(String, nullable=True)
    platform = Column(String, nullable=True)  # teams | zoom | phone | onsite | other
    join_url = Column(String, nullable=True)
    status = Column(String, default="scheduled")  # scheduled | completed | cancelled | rescheduled | no_show
    result = Column(String, nullable=True)  # passed | failed | pending | unknown
    brief_doc_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    notes_doc_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    position = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    task = relationship("Task", back_populates="meetings")
    cockpit_sections = relationship(
        "CockpitSection",
        back_populates="meeting",
        order_by="CockpitSection.position",
        cascade="all, delete-orphan",
    )


class CockpitSection(Base):
    __tablename__ = "cockpit_sections"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)
    section_key = Column(String, nullable=False)  # pitch | rescue_phrases | quick_facts | story_cards | questions | closing | post_call
    content = Column(Text, default="")
    position = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    meeting = relationship("Meeting", back_populates="cockpit_sections")


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    action = Column(String, nullable=False)
    detail = Column(Text, default="")
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    task = relationship("Task", back_populates="activities")
