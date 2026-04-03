# Job Tracker - Agent Instructions

## Project
Task management app. FastAPI + React + TypeScript + SQLite.
Backend: `/backend/`. Frontend: `/frontend/src/`.

## Key Files
- `VISION.md` - architecture, data model, roadmap, philosophy
- `features.md` - how every feature works (spec)
- `learnings.md` - self-education log (bugs, corrections, design insights)

## Self-Learning Protocol

**Read `learnings.md` at session start.** It contains every past mistake and user correction. Do not repeat them.

**Write to `learnings.md` whenever:**
1. A bug is found that was not caught before shipping
2. The user corrects your approach or design ("not user-friendly", "doesn't work", "not what I meant")
3. A non-obvious technical insight is discovered (cascade behavior, CORS gotchas, etc.)
4. A design principle is validated or invalidated by real usage

**Format per entry:**
```
### LXXX: Short title
**Context:** What happened
**Root cause:** Why it happened
**Fix:** What was done
**Rule:** Generalized principle for the future
```

**Before implementing any feature:** check `features.md` for spec. If the feature isn't documented, document it first, then implement.

**After implementing any feature:** update `features.md` with actual behavior.

**If the user says something unexpected or reports a bug:** this means the agent needs to learn. Add entry to `learnings.md` before fixing.

## Code Rules
- Backend: FastAPI, SQLAlchemy ORM, Pydantic schemas, SQLite
- Frontend: React 19, TypeScript strict, custom CSS (no framework), CSS custom properties for theming
- Dark mode must work for all new components
- Destructive actions (delete, bulk operations) require user confirmation
- Status enforcement: "waiting" requires follow_up_date, "done"/"closed" blocked by unresolved dependencies
- Every state change logged as Activity
- No badge spam: use color (left borders, backgrounds) as the primary signal, not text badges

## Running
```bash
./run_dev.sh
# Backend: http://localhost:8000 (Swagger: /docs)
# Frontend: http://localhost:5173 (or next available port)
```

## Testing
```bash
# Backend: via FastAPI TestClient
source .venv/bin/activate
python -c "from backend.main import app; from fastapi.testclient import TestClient; ..."

# Frontend: TypeScript check
npx --prefix frontend tsc --noEmit --project frontend/tsconfig.app.json
```
