import sys
import httpx
from .output import print_error

# Endpoints that require project_id as a query param
_PROJECT_SCOPED_PATHS = {
    "/api/tasks/",
    "/api/documents/",
    "/api/contacts/",
    "/api/companies/",
    "/api/categories/",
    "/api/search/",
    "/api/activities/",
    "/api/dashboard/",
    "/api/board/",
}

# Hint messages for common errors
_HINTS = {
    404: "Check the ID. Use 'jt ls' to see available tasks, 'jt contact ls' for contacts, 'jt company ls' for companies.",
    409: "Conflict: duplicate title or blocked by open dependencies.",
    422: "Validation error. Check field names and values. Run 'jt --help' for field reference.",
    400: "Bad request. Check for circular dependencies or invalid operations.",
    500: "Server error. Check backend logs: tail -50 /tmp/jt-backend.log",
}

_CONN_HINT = (
    "Backend not running at {url}. "
    "Start with: cd /Users/mykhailo/MyProjects/job-tracker && ./run_dev.sh"
)

_TIMEOUT_HINT = (
    "Request timed out after {timeout}s. The backend may be overloaded or the query too broad. "
    "Try narrowing with --stage, --status, or --search filters."
)


def _exit_code(status: int) -> int:
    return {200: 0, 201: 0, 404: 1, 422: 2, 409: 3, 400: 4, 500: 6}.get(status, 6)


def _hint(status: int, detail: str, path: str = "") -> str:
    dl = detail.lower()

    # 422: context-specific validation hints
    if status == 422:
        if "waiting" in dl:
            return "Status 'waiting' requires follow_up_date. Add: follow_up_date=YYYY-MM-DD"
        if "follow_up" in dl or "due_date" in dl:
            return "Date format: YYYY-MM-DD (e.g. 2026-04-15)"
        if "field required" in dl or "missing" in dl:
            return "Required field missing. Run 'jt --help' for field reference."
        return _HINTS[422]

    # 409: context-specific conflict hints
    if status == 409:
        if "dep" in dl or "blocker" in dl or "complete" in dl:
            return "Task has open blockers. Complete them first ('jt up <blocker_id> status=done'), or remove: 'jt unblock <id> <blocker_id>'."
        if "duplicate" in dl:
            return "A task with this title already exists. Use --force to create anyway, or 'jt ls --search=\"...\"' to find the existing one."
        if "subtask" in dl:
            return "Complete all subtasks first: 'jt sub ls <id>' to see them, 'jt sub done <id> <item_id>' to complete."
        if "checklist" in dl:
            return "Check off all checklist items first: 'jt check ls <id>' to see them, 'jt check done <id> <item_id>' to check."
        return _HINTS[409]

    # 404: context-specific not-found hints
    if status == 404:
        if "contact" in path:
            return "Contact not found. Use 'jt contact ls' to list contacts."
        if "company" in path or "companies" in path:
            return "Company not found. Use 'jt company ls' to list companies."
        if "document" in path:
            return "Document not found. Use 'jt doc ls' to list documents."
        if "meeting" in path:
            return "Meeting not found. Use 'jt meeting ls <task_id>' to list meetings."
        if "checklist" in path:
            return "Checklist item not found. Use 'jt check ls <task_id>' to list items."
        if "subtask" in path:
            return "Subtask not found. Use 'jt sub ls <task_id>' to list subtasks."
        return _HINTS[404]

    return _HINTS.get(status, "")


class JTClient:
    def __init__(self, base_url: str, project_id: int):
        self.base_url = base_url.rstrip("/")
        self.project_id = project_id
        self._http = httpx.Client(base_url=self.base_url, timeout=10.0)

    def _inject_pid(self, path: str, params: dict) -> dict:
        """Inject project_id into params if this endpoint requires it."""
        norm = path if path.startswith("/") else f"/{path}"
        needs_pid = any(norm == p or norm.startswith(p) for p in _PROJECT_SCOPED_PATHS)
        if needs_pid and "project_id" not in params:
            params = {**params, "project_id": self.project_id}
        return params

    def _handle(self, response: httpx.Response, path: str = ""):
        """Parse response or exit with error."""
        if response.is_success:
            try:
                return response.json()
            except Exception:
                return {"ok": True}

        status = response.status_code
        try:
            body = response.json()
            detail = body.get("detail", str(body))
            if isinstance(detail, list):  # Pydantic validation errors
                detail = "; ".join(
                    f"{'.'.join(str(x) for x in e.get('loc', []))}: {e.get('msg', '')}"
                    for e in detail
                )
        except Exception:
            detail = response.text or f"HTTP {status}"

        hint = _hint(status, str(detail), path)
        print_error(status, str(detail), hint)
        sys.exit(_exit_code(status))

    def _request(self, method: str, path: str, **kwargs):
        """Execute HTTP request with unified error handling."""
        params = kwargs.pop("params", None) or {}
        params = self._inject_pid(path, params)
        try:
            r = self._http.request(method, path, params=params, **kwargs)
        except httpx.ConnectError:
            print_error(0, "Connection refused", _CONN_HINT.format(url=self.base_url))
            sys.exit(5)
        except httpx.ReadTimeout:
            print_error(0, "Request timed out", _TIMEOUT_HINT.format(timeout=self._http.timeout.read))
            sys.exit(5)
        return self._handle(r, path)

    def get(self, path: str, params: dict = None) -> dict | list:
        return self._request("GET", path, params=params)

    def post(self, path: str, json: dict = None, params: dict = None) -> dict:
        return self._request("POST", path, json=json or {}, params=params)

    def put(self, path: str, json: dict) -> dict:
        return self._request("PUT", path, json=json)

    def delete(self, path: str, params: dict = None) -> dict:
        return self._request("DELETE", path, params=params)
