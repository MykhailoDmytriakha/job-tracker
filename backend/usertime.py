"""User-timezone-aware date/time helpers.

All backend code that needs "today" or "now" for user-facing logic
should use these functions instead of date.today() or datetime.now().
"""
from datetime import datetime, timezone, date as date_type
from zoneinfo import ZoneInfo


def user_today(user_tz: str | None) -> date_type:
    """Return today's date in the user's timezone."""
    if user_tz:
        try:
            return datetime.now(ZoneInfo(user_tz)).date()
        except (KeyError, ValueError):
            pass
    return datetime.now(timezone.utc).date()


def user_now(user_tz: str | None) -> datetime:
    """Return current datetime in UTC, but aware of user's timezone for date boundaries."""
    return datetime.now(timezone.utc)
