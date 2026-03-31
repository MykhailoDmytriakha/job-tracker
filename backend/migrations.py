"""Idempotent schema migration runner for SQLite.

Runs on every startup. Checks current schema via PRAGMA table_info
and adds missing columns. New tables are handled by create_all.
"""

from sqlalchemy import inspect, text


TASK_COLUMNS = [
    ("category", "TEXT"),
    ("due_date", "DATETIME"),
    ("is_recurring", "BOOLEAN DEFAULT 0"),
    ("cadence", "TEXT"),
    ("next_checkpoint", "DATETIME"),
]


def run_migrations(engine):
    inspector = inspect(engine)
    existing = {col["name"] for col in inspector.get_columns("tasks")}

    with engine.begin() as conn:
        for col_name, col_type in TASK_COLUMNS:
            if col_name not in existing:
                conn.execute(
                    text(f"ALTER TABLE tasks ADD COLUMN {col_name} {col_type}")
                )
