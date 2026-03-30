from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from .database import Base


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
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    status = Column(String, default="open")  # open, in_progress, done, closed
    priority = Column(String, default="medium")  # high, medium, low
    stage_id = Column(Integer, ForeignKey("stages.id"), nullable=True)
    parent_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    follow_up_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    stage = relationship("Stage", back_populates="tasks")
    parent = relationship("Task", remote_side=[id], backref="subtasks")
    activities = relationship(
        "Activity", back_populates="task", order_by="Activity.timestamp.desc()"
    )


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    action = Column(String, nullable=False)
    detail = Column(Text, default="")
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    task = relationship("Task", back_populates="activities")
