import logging

from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_BLOCKED_IDS_SQL = text(
    """
    SELECT DISTINCT td.task_id
    FROM task_dependencies td
    JOIN tasks blocked ON blocked.id = td.task_id
    JOIN tasks blocker ON blocker.id = td.depends_on_id
    WHERE blocker.status NOT IN ('done', 'closed')
      AND (:project_id IS NULL OR blocked.project_id = :project_id)
      AND (
        :user_id IS NULL
        OR (
          EXISTS (
            SELECT 1
            FROM projects p
            WHERE p.id = blocked.project_id AND p.user_id = :user_id
          )
          AND EXISTS (
            SELECT 1
            FROM projects p
            WHERE p.id = blocker.project_id AND p.user_id = :user_id
          )
        )
      )
    """
)

_TASK_BLOCKED_SQL = text(
    """
    SELECT 1
    FROM task_dependencies td
    JOIN tasks blocked ON blocked.id = td.task_id
    JOIN tasks blocker ON blocker.id = td.depends_on_id
    WHERE td.task_id = :tid AND blocker.status NOT IN ('done', 'closed')
      AND (
        :user_id IS NULL
        OR (
          EXISTS (
            SELECT 1
            FROM projects p
            WHERE p.id = blocked.project_id AND p.user_id = :user_id
          )
          AND EXISTS (
            SELECT 1
            FROM projects p
            WHERE p.id = blocker.project_id AND p.user_id = :user_id
          )
        )
      )
    LIMIT 1
    """
)

_DEPENDENCY_TABLE_MARKER = "task_dependencies"
_SCHEMA_OBJECT_MARKERS = (
    "task_dependencies",
    "depends_on_id",
    "task_id",
    "status",
)
_SCHEMA_ERROR_MARKERS = (
    "undefined table",
    "undefined column",
    "no such table",
    "no such column",
    "does not exist",
)


def _is_dependency_schema_error(exc: Exception) -> bool:
    message = str(getattr(exc, "orig", exc)).lower()
    return (
        _DEPENDENCY_TABLE_MARKER in message
        and any(marker in message for marker in _SCHEMA_ERROR_MARKERS)
        and any(marker in message for marker in _SCHEMA_OBJECT_MARKERS)
    )


def _handle_dependency_schema_error(db: Session, exc: Exception, operation: str) -> bool:
    if not _is_dependency_schema_error(exc):
        return False
    db.rollback()
    logger.warning(
        "Dependency schema unavailable during %s; treating tasks as unblocked until migrations catch up",
        operation,
        exc_info=exc,
    )
    return True


def get_unresolved_blocked_ids(
    db: Session,
    project_id: int | None = None,
    user_id: int | None = None,
) -> set[int]:
    try:
        rows = db.execute(
            _BLOCKED_IDS_SQL,
            {"project_id": project_id, "user_id": user_id},
        ).fetchall()
    except (OperationalError, ProgrammingError) as exc:
        if not _handle_dependency_schema_error(db, exc, "blocked ID lookup"):
            raise
        return set()
    return {r[0] for r in rows}


def is_task_blocked(
    db: Session,
    task_id: int,
    user_id: int | None = None,
) -> bool:
    try:
        row = db.execute(
            _TASK_BLOCKED_SQL,
            {"tid": task_id, "user_id": user_id},
        ).fetchone()
    except (OperationalError, ProgrammingError) as exc:
        if not _handle_dependency_schema_error(db, exc, f"blocked lookup for task {task_id}"):
            raise
        return False
    return row is not None
