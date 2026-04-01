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
    404: "Check the ID. Use 'jt ls' to see available tasks.",
    409: "Conflict: duplicate title or blocked by open dependencies.",
    422: "Validation error. Check field names and values.",
    400: "Bad request. Check for circular dependencies or invalid operations.",
    500: "Server error. Check backend logs.",
}

_WAITING_HINT = "Status 'waiting' requires follow_up_date. Add: follow_up_date=YYYY-MM-DD"
_CONN_HINT = (
    "Backend not running at {url}. "
    "Start with: cd /Users/mykhailo/MyProjects/job-tracker && ./run_dev.sh"
)


def _exit_code(status: int) -> int:
    return {200: 0, 201: 0, 404: 1, 422: 2, 409: 3, 400: 4, 500: 6}.get(status, 6)


def _hint(status: int, detail: str) -> str:
    if status == 422 and "waiting" in detail.lower():
        return _WAITING_HINT
    if status == 409 and "dep" in detail.lower():
        return "Task has open blockers. Complete them first, or use 'jt unblock'."
    return _HINTS.get(status, "")


class JTClient:
    def __init__(self, base_url: str, project_id: int):
        self.base_url = base_url.rstrip("/")
        self.project_id = project_id
        self._http = httpx.Client(base_url=self.base_url, timeout=10.0)

    def _inject_pid(self, path: str, params: dict) -> dict:
        """Inject project_id into params if this endpoint requires it."""
        # Normalise path to check
        norm = path if path.startswith("/") else f"/{path}"
        needs_pid = any(norm == p or norm.startswith(p) for p in _PROJECT_SCOPED_PATHS)
        if needs_pid and "project_id" not in params:
            params = {**params, "project_id": self.project_id}
        return params

    def _handle(self, response: httpx.Response):
        """Parse response or exit with error."""
        if response.is_success:
            try:
                return response.json()
            except Exception:
                return {"ok": True}

        # Error path
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

        hint = _hint(status, str(detail))
        print_error(status, str(detail), hint)
        sys.exit(_exit_code(status))

    def get(self, path: str, params: dict = None) -> dict | list:
        params = self._inject_pid(path, params or {})
        try:
            r = self._http.get(path, params=params)
        except httpx.ConnectError:
            print_error(0, "Connection refused", _CONN_HINT.format(url=self.base_url))
            sys.exit(5)
        return self._handle(r)

    def post(self, path: str, json: dict = None, params: dict = None) -> dict:
        params = self._inject_pid(path, params or {})
        try:
            r = self._http.post(path, json=json or {}, params=params)
        except httpx.ConnectError:
            print_error(0, "Connection refused", _CONN_HINT.format(url=self.base_url))
            sys.exit(5)
        return self._handle(r)

    def put(self, path: str, json: dict) -> dict:
        try:
            r = self._http.put(path, json=json)
        except httpx.ConnectError:
            print_error(0, "Connection refused", _CONN_HINT.format(url=self.base_url))
            sys.exit(5)
        return self._handle(r)

    def delete(self, path: str, params: dict = None) -> dict:
        try:
            r = self._http.delete(path, params=params or {})
        except httpx.ConnectError:
            print_error(0, "Connection refused", _CONN_HINT.format(url=self.base_url))
            sys.exit(5)
        return self._handle(r)
