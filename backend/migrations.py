"""Idempotent schema migration runner.

Runs on every startup. create_all handles new tables.
ALTER TABLE migrations only needed for SQLite (legacy schema evolution).
PostgreSQL gets correct schema from create_all() on first run.
"""

import logging
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import inspect, text
from .database import is_sqlite

logger = logging.getLogger(__name__)


def run_migrations(engine):
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    if not is_sqlite:
        # PostgreSQL: create_all() handles new tables. Add missing columns here.
        if "projects" in tables:
            project_cols = {col["name"] for col in inspector.get_columns("projects")}
            if "user_id" not in project_cols:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE projects ADD COLUMN user_id INTEGER REFERENCES users(id)"))
        if "users" in tables:
            user_cols = {col["name"] for col in inspector.get_columns("users")}
            if "timezone" not in user_cols:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE users ADD COLUMN timezone VARCHAR"))
        _backfill_legacy_project_owner(engine)
        _remove_cross_owner_dependencies(engine)
        _remove_cross_project_links(engine)
        _migrate_meetings_to_utc(engine, inspector, tables)
        return

    # --- SQLite-only migrations below ---

    if "contacts" in tables:
        contact_cols = {col["name"] for col in inspector.get_columns("contacts")}
        if "company_id" not in contact_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE contacts ADD COLUMN company_id INTEGER REFERENCES companies(id)"))

    if "tasks" in tables:
        existing = {col["name"] for col in inspector.get_columns("tasks")}
        migrations = [
            ("category", "TEXT"),
            ("due_date", "DATETIME"),
            ("is_recurring", "BOOLEAN DEFAULT 0"),
            ("cadence", "TEXT"),
            ("next_checkpoint", "DATETIME"),
            ("project_id", "INTEGER"),
            ("sequence_num", "INTEGER DEFAULT 0"),
            ("temperature", "TEXT"),
            ("source", "TEXT"),
            ("job_url", "TEXT"),
            ("applied_date", "DATETIME"),
            ("salary_range", "TEXT"),
            ("human_lane_status", "TEXT"),
            ("pipeline_heat", "TEXT"),
            ("lead_source", "TEXT"),
            ("posting_url", "TEXT"),
            ("applied_at", "DATETIME"),
            ("compensation", "TEXT"),
            ("outreach_status", "TEXT"),
            ("close_reason", "TEXT"),
        ]
        with engine.begin() as conn:
            for col_name, col_type in migrations:
                if col_name not in existing:
                    conn.execute(
                        text(f"ALTER TABLE tasks ADD COLUMN {col_name} {col_type}")
                    )

    if "projects" in tables:
        project_cols = {col["name"] for col in inspector.get_columns("projects")}
        if "user_id" not in project_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE projects ADD COLUMN user_id INTEGER REFERENCES users(id)"))

    _backfill_legacy_project_owner(engine)
    _remove_cross_owner_dependencies(engine)
    _remove_cross_project_links(engine)

    # Date normalization: SQLite stores dates as strings
    if "tasks" in tables:
        date_columns = ["follow_up_date", "due_date", "next_checkpoint", "applied_at"]
        with engine.begin() as conn:
            for col in date_columns:
                conn.execute(text(
                    f"UPDATE tasks SET {col} = substr({col}, 1, 10)"
                    f" WHERE {col} IS NOT NULL AND length({col}) > 10"
                ))

    _migrate_meetings_to_utc(engine, inspect(engine), inspect(engine).get_table_names())


# Legacy timezone for one-time migration of pre-fix meeting rows.
# Mykhailo (sole user at the time of fix) was in America/Los_Angeles when the
# affected rows were created. ZoneInfo handles DST automatically per-row.
_LEGACY_MEETING_TZ = ZoneInfo("America/Los_Angeles")


def _backfill_legacy_project_owner(engine):
    """Assign pre-auth projects only when an explicit legacy owner is configured.

    Before multi-user scoping, projects were global and had no owner. There is
    no per-row signal that can reconstruct ownership. Guessing the owner can
    leak data, so unauthenticated legacy rows stay inaccessible unless the
    deployment names the intended owner explicitly.
    """
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "projects" not in tables or "users" not in tables:
        return

    project_cols = {col["name"] for col in inspector.get_columns("projects")}
    if "user_id" not in project_cols:
        return

    try:
        with engine.begin() as conn:
            owner_id = os.environ.get("LEGACY_PROJECT_OWNER_ID", "").strip()
            owner_email = os.environ.get("LEGACY_PROJECT_OWNER_EMAIL", "").strip().lower()
            if owner_id:
                try:
                    owner_id_int = int(owner_id)
                except ValueError:
                    logger.error("LEGACY_PROJECT_OWNER_ID must be an integer")
                    return
                owner = conn.execute(
                    text("SELECT id FROM users WHERE id = :id"),
                    {"id": owner_id_int},
                ).fetchone()
            elif owner_email:
                owner = conn.execute(
                    text("SELECT id FROM users WHERE lower(email) = :email"),
                    {"email": owner_email},
                ).fetchone()
            else:
                unowned_count = conn.execute(
                    text("SELECT count(*) FROM projects WHERE user_id IS NULL")
                ).scalar() or 0
                if unowned_count:
                    logger.warning(
                        "%d legacy unowned project(s) remain inaccessible; set LEGACY_PROJECT_OWNER_EMAIL or LEGACY_PROJECT_OWNER_ID to claim them",
                        unowned_count,
                    )
                return
            if owner is None:
                return
            result = conn.execute(
                text("UPDATE projects SET user_id = :user_id WHERE user_id IS NULL"),
                {"user_id": owner[0]},
            )
            rowcount = result.rowcount if result.rowcount and result.rowcount > 0 else 0
            if rowcount:
                logger.warning(
                    "Assigned %d legacy unowned project(s) to user id %s",
                    rowcount,
                    owner[0],
                )
    except Exception as exc:
        logger.error("legacy project owner backfill failed: %s", exc)


def _remove_cross_owner_dependencies(engine):
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if not {"task_dependencies", "tasks", "projects"}.issubset(tables):
        return

    project_cols = {col["name"] for col in inspector.get_columns("projects")}
    if "user_id" not in project_cols:
        return

    owner_mismatch = "blocked_project.user_id IS NOT blocker_project.user_id"
    if not is_sqlite:
        owner_mismatch = "blocked_project.user_id IS DISTINCT FROM blocker_project.user_id"

    try:
        with engine.begin() as conn:
            result = conn.execute(text(f"""
                DELETE FROM task_dependencies
                WHERE EXISTS (
                    SELECT 1
                    FROM tasks blocked
                    JOIN projects blocked_project ON blocked_project.id = blocked.project_id
                    JOIN tasks blocker ON blocker.id = task_dependencies.depends_on_id
                    JOIN projects blocker_project ON blocker_project.id = blocker.project_id
                    WHERE blocked.id = task_dependencies.task_id
                      AND {owner_mismatch}
                )
            """))
            rowcount = result.rowcount if result.rowcount and result.rowcount > 0 else 0
            if rowcount:
                logger.warning("Removed %d cross-owner dependency edge(s)", rowcount)
    except Exception as exc:
        logger.error("cross-owner dependency cleanup failed: %s", exc)


def _remove_cross_project_links(engine):
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    cleanup_statements: list[tuple[str, str]] = []
    if {"task_documents", "tasks", "documents"}.issubset(tables):
        cleanup_statements.append((
            "task-document",
            """
            DELETE FROM task_documents
            WHERE EXISTS (
                SELECT 1
                FROM tasks t
                JOIN documents d ON d.id = task_documents.document_id
                WHERE t.id = task_documents.task_id
                  AND t.project_id != d.project_id
            )
            """,
        ))
    if {"task_contacts", "tasks", "contacts"}.issubset(tables):
        cleanup_statements.append((
            "task-contact",
            """
            DELETE FROM task_contacts
            WHERE EXISTS (
                SELECT 1
                FROM tasks t
                JOIN contacts c ON c.id = task_contacts.contact_id
                WHERE t.id = task_contacts.task_id
                  AND t.project_id != c.project_id
            )
            """,
        ))
    if {"task_companies", "tasks", "companies"}.issubset(tables):
        cleanup_statements.append((
            "task-company",
            """
            DELETE FROM task_companies
            WHERE EXISTS (
                SELECT 1
                FROM tasks t
                JOIN companies c ON c.id = task_companies.company_id
                WHERE t.id = task_companies.task_id
                  AND t.project_id != c.project_id
            )
            """,
        ))
    if {"contacts", "companies"}.issubset(tables):
        cleanup_statements.append((
            "contact-company",
            """
            UPDATE contacts
            SET company_id = NULL
            WHERE company_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM companies c
                WHERE c.id = contacts.company_id
                  AND c.project_id != contacts.project_id
              )
            """,
        ))
    if {"meetings", "tasks", "documents"}.issubset(tables):
        meeting_cols = {col["name"] for col in inspector.get_columns("meetings")}
        if "brief_doc_id" in meeting_cols:
            cleanup_statements.append((
                "meeting-brief-doc",
                """
                UPDATE meetings
                SET brief_doc_id = NULL
                WHERE brief_doc_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM tasks t
                    JOIN documents d ON d.id = meetings.brief_doc_id
                    WHERE t.id = meetings.task_id
                      AND t.project_id != d.project_id
                  )
                """,
            ))
        if "notes_doc_id" in meeting_cols:
            cleanup_statements.append((
                "meeting-notes-doc",
                """
                UPDATE meetings
                SET notes_doc_id = NULL
                WHERE notes_doc_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM tasks t
                    JOIN documents d ON d.id = meetings.notes_doc_id
                    WHERE t.id = meetings.task_id
                      AND t.project_id != d.project_id
                  )
                """,
            ))

    if not cleanup_statements:
        return

    try:
        with engine.begin() as conn:
            for label, statement in cleanup_statements:
                result = conn.execute(text(statement))
                rowcount = result.rowcount if result.rowcount and result.rowcount > 0 else 0
                if rowcount:
                    logger.warning("Cleaned %d invalid %s link(s)", rowcount, label)
    except Exception as exc:
        logger.error("cross-project link cleanup failed: %s", exc)


def _migrate_meetings_to_utc(engine, inspector, tables):
    """One-time conversion: meetings.scheduled_at from naive local-PDT to naive UTC.

    Idempotent via per-row marker column `scheduled_at_tz_migrated`.
    Safe under concurrent serverless cold starts:
      - ALTER TABLE uses IF NOT EXISTS where supported, or check-then-add otherwise.
      - Each row UPDATE is atomic; the WHERE NOT scheduled_at_tz_migrated guard
        prevents double-conversion if two instances race.
    """
    if "meetings" not in tables:
        return

    meeting_cols = {col["name"] for col in inspector.get_columns("meetings")}

    # Step 1: ensure marker column exists.
    if "scheduled_at_tz_migrated" not in meeting_cols:
        try:
            with engine.begin() as conn:
                if is_sqlite:
                    conn.execute(text(
                        "ALTER TABLE meetings ADD COLUMN scheduled_at_tz_migrated "
                        "BOOLEAN NOT NULL DEFAULT 0"
                    ))
                else:
                    conn.execute(text(
                        "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS "
                        "scheduled_at_tz_migrated BOOLEAN NOT NULL DEFAULT FALSE"
                    ))
        except Exception as exc:
            # Another instance may have added it concurrently. Verify and continue.
            logger.warning("meetings tz migration: ALTER race or error: %s", exc)
            fresh_cols = {col["name"] for col in inspect(engine).get_columns("meetings")}
            if "scheduled_at_tz_migrated" not in fresh_cols:
                logger.error("meetings tz migration: marker column still missing, deferring")
                return

    # Step 2: convert all unmigrated rows.
    try:
        with engine.begin() as conn:
            rows = conn.execute(text(
                "SELECT id, scheduled_at FROM meetings "
                "WHERE NOT scheduled_at_tz_migrated"
            )).fetchall()

            converted = 0
            for row in rows:
                mid = row[0]
                stored = row[1]
                if stored is None:
                    conn.execute(
                        text("UPDATE meetings SET scheduled_at_tz_migrated = TRUE WHERE id = :id"),
                        {"id": mid},
                    )
                    continue
                if isinstance(stored, str):
                    stored = datetime.fromisoformat(stored)
                if stored.tzinfo is not None:
                    # Already aware (unlikely for legacy data); just normalize.
                    naive_utc = stored.astimezone(timezone.utc).replace(tzinfo=None)
                else:
                    aware_local = stored.replace(tzinfo=_LEGACY_MEETING_TZ)
                    naive_utc = aware_local.astimezone(timezone.utc).replace(tzinfo=None)
                conn.execute(
                    text(
                        "UPDATE meetings SET scheduled_at = :v, "
                        "scheduled_at_tz_migrated = TRUE WHERE id = :id"
                    ),
                    {"v": naive_utc, "id": mid},
                )
                converted += 1
            if converted:
                logger.info("meetings tz migration: converted %d row(s) to naive UTC", converted)
    except Exception as exc:
        logger.error("meetings tz migration: conversion failed: %s", exc)
