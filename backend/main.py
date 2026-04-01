from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine
from . import models
from .seed import seed_default_stages
from .migrations import run_migrations
from .api import stages, tasks, board, dashboard, projects, documents, categories, contacts, companies, search, activities


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    run_migrations(engine)
    seed_default_stages()
    yield


app = FastAPI(title="Job Tracker", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(stages.router)
app.include_router(tasks.router)
app.include_router(board.router)
app.include_router(dashboard.router)
app.include_router(documents.router)
app.include_router(categories.router)
app.include_router(contacts.router)
app.include_router(companies.router)
app.include_router(search.router)
app.include_router(activities.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
