import os
import json
from pathlib import Path

CONFIG_DIR = Path.home() / ".config" / "jt"
CONFIG_FILE = CONFIG_DIR / "config.json"

_DEFAULTS = {
    "url": "http://localhost:8000",
    "project_id": 1,
    "token": "",
}


def _load_file() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_file(data: dict):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(data, indent=2) + "\n")


def get(key: str):
    """Get config value. Priority: env var > config file > default."""
    env_map = {"url": "JT_BASE_URL", "project_id": "JT_PROJECT_ID", "token": "JT_TOKEN"}
    env_key = env_map.get(key)
    if env_key and os.environ.get(env_key):
        val = os.environ[env_key]
        if key == "project_id":
            return int(val)
        return val
    file_data = _load_file()
    if key in file_data:
        return file_data[key]
    return _DEFAULTS.get(key)


def set_value(key: str, value: str):
    """Set config value in file."""
    data = _load_file()
    if key == "project_id":
        data[key] = int(value)
    else:
        data[key] = value
    _save_file(data)


def get_all() -> dict:
    """Get all config values with source info."""
    result = {}
    for key in _DEFAULTS:
        val = get(key)
        if key == "token" and val:
            val = val[:10] + "..." + val[-4:] if len(val) > 14 else "***"
        result[key] = val
    return result


# Backward compatibility
BASE_URL = property(lambda self: get("url"))
PROJECT_ID = property(lambda self: get("project_id"))
