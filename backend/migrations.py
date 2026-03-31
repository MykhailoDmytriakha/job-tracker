"""Idempotent schema migration runner for SQLite.

Runs on every startup. create_all handles new tables.
This handles adding columns to existing tables (ALTER TABLE).
"""

from sqlalchemy import inspect, text


def run_migrations(engine):
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    # Tasks table migrations (for existing DBs missing new columns)
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
        ]
        with engine.begin() as conn:
            for col_name, col_type in migrations:
                if col_name not in existing:
                    conn.execute(
                        text(f"ALTER TABLE tasks ADD COLUMN {col_name} {col_type}")
                    )
