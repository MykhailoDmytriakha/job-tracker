import os

BASE_URL = os.environ.get("JT_BASE_URL", "http://localhost:8000")
PROJECT_ID = int(os.environ.get("JT_PROJECT_ID", "1"))
