from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine
from . import models
from .seed import seed_default_stages
from .api import stages, tasks, board


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    seed_default_stages()
    yield


app = FastAPI(title="Job Tracker", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stages.router)
app.include_router(tasks.router)
app.include_router(board.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
