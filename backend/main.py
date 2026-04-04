import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine
from . import models
from .seed import seed_default_stages
from .migrations import run_migrations
from .api import (
    auth, stages, tasks, board, dashboard, projects,
    documents, categories, contacts, companies, search, activities,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    run_migrations(engine)
    seed_default_stages()
    yield


app = FastAPI(title="Job Tracker", version="0.2.0", lifespan=lifespan)

# CORS: allow local dev + Vercel preview/production URLs
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
]
# In production, add the Vercel domain
vercel_url = os.environ.get("VERCEL_URL")
if vercel_url:
    allowed_origins.append(f"https://{vercel_url}")
frontend_url = os.environ.get("FRONTEND_URL")
if frontend_url:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
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
