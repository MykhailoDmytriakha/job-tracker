from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload, subqueryload
from sqlalchemy import text
from typing import Optional

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/board", tags=["board"])


@router.get("/", response_model=schemas.BoardView)
def get_board(project_id: Optional[int] = None, db: Session = Depends(get_db)):
    blocked_rows = db.execute(
        text("""
            SELECT DISTINCT td.task_id
            FROM task_dependencies td
            JOIN tasks t ON t.id = td.depends_on_id
            WHERE t.status NOT IN ('done', 'closed')
        """)
    ).fetchall()
    blocked_ids = {r[0] for r in blocked_rows}

    main_stages = (
        db.query(models.Stage)
        .filter(models.Stage.parent_id.is_(None))
        .order_by(models.Stage.position)
        .all()
    )

    columns = []
    for stage in main_stages:
        stage_ids = [stage.id] + [c.id for c in stage.children]

        q = (
            db.query(models.Task)
            .options(
                subqueryload(models.Task.subtask_items),
                subqueryload(models.Task.checklist_items),
                joinedload(models.Task.project),
            )
            .filter(models.Task.stage_id.in_(stage_ids))
            .filter(models.Task.parent_id.is_(None))
        )
        if project_id is not None:
            q = q.filter(models.Task.project_id == project_id)
        tasks = q.order_by(models.Task.updated_at.desc()).all()

        columns.append(
            schemas.BoardColumn(
                stage=schemas.StageOut(
                    id=stage.id, name=stage.name,
                    parent_id=stage.parent_id, position=stage.position,
                    is_default=stage.is_default, description=stage.description or "",
                    children=[
                        schemas.StageOut(
                            id=c.id, name=c.name, parent_id=c.parent_id,
                            position=c.position, is_default=c.is_default,
                            description=c.description or "",
                        )
                        for c in sorted(stage.children, key=lambda x: x.position)
                    ],
                ),
                tasks=[
                    schemas.TaskBrief(
                        id=t.id, display_id=t.display_id, project_id=t.project_id,
                        title=t.title, status=t.status, priority=t.priority,
                        category=t.category, stage_id=t.stage_id, parent_id=t.parent_id,
                        follow_up_date=t.follow_up_date, due_date=t.due_date,
                        is_recurring=t.is_recurring, cadence=t.cadence,
                        next_checkpoint=t.next_checkpoint,
                        pipeline_heat=t.pipeline_heat, lead_source=t.lead_source,
                        posting_url=t.posting_url, applied_at=t.applied_at,
                        compensation=t.compensation,
                        outreach_status=t.outreach_status,
                        close_reason=t.close_reason,
                        is_blocked=t.id in blocked_ids,
                        subtask_count=len(t.subtask_items),
                        subtask_done=sum(1 for s in t.subtask_items if s.is_done),
                        checklist_total=len(t.checklist_items),
                        checklist_done=sum(1 for c in t.checklist_items if c.is_done),
                    )
                    for t in tasks
                ],
            )
        )

    return schemas.BoardView(columns=columns)
