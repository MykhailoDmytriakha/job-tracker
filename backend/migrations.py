"""Idempotent schema migration runner.

Runs on every startup. create_all handles new tables.
ALTER TABLE migrations only needed for SQLite (legacy schema evolution).
PostgreSQL gets correct schema from create_all() on first run.
"""

import logging
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
