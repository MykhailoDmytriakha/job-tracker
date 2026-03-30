from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/board", tags=["board"])


@router.get("/", response_model=schemas.BoardView)
def get_board(db: Session = Depends(get_db)):
    main_stages = (
        db.query(models.Stage)
        .filter(models.Stage.parent_id.is_(None))
        .order_by(models.Stage.position)
        .all()
    )

    columns = []
    for stage in main_stages:
        stage_ids = [stage.id] + [c.id for c in stage.children]

        tasks = (
            db.query(models.Task)
            .filter(models.Task.stage_id.in_(stage_ids))
            .filter(models.Task.parent_id.is_(None))
            .order_by(models.Task.updated_at.desc())
            .all()
        )

        columns.append(
            schemas.BoardColumn(
                stage=schemas.StageOut(
                    id=stage.id,
                    name=stage.name,
                    parent_id=stage.parent_id,
                    position=stage.position,
                    is_default=stage.is_default,
                    children=[
                        schemas.StageOut(
                            id=c.id,
                            name=c.name,
                            parent_id=c.parent_id,
                            position=c.position,
                            is_default=c.is_default,
                        )
                        for c in sorted(stage.children, key=lambda x: x.position)
                    ],
                ),
                tasks=[
                    schemas.TaskBrief(
                        id=t.id,
                        title=t.title,
                        status=t.status,
                        priority=t.priority,
                        stage_id=t.stage_id,
                        parent_id=t.parent_id,
                        follow_up_date=t.follow_up_date,
                        subtask_count=len(t.subtasks),
                        subtask_done=sum(1 for s in t.subtasks if s.status == "done"),
                    )
                    for t in tasks
                ],
            )
        )

    return schemas.BoardView(columns=columns)
