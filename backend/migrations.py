"""Idempotent schema migration runner.

Runs on every startup. create_all handles new tables.
ALTER TABLE migrations only needed for SQLite (legacy schema evolution).
PostgreSQL gets correct schema from create_all() on first run.
"""

from sqlalchemy import inspect, text
from .database import is_sqlite


def run_migrations(engine):
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    if not is_sqlite:
        # PostgreSQL: create_all() handles everything. Only add user_id if missing.
        if "projects" in tables:
            project_cols = {col["name"] for col in inspector.get_columns("projects")}
            if "user_id" not in project_cols:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE projects ADD COLUMN user_id INTEGER REFERENCES users(id)"))
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
