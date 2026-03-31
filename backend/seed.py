from .database import SessionLocal
from . import models


def seed_default_stages():
    db = SessionLocal()

    if db.query(models.Stage).first():
        db.close()
        return

    default_stages = [
        ("INBOX", 0),
        ("TRIAGED", 1),
        ("TO APPLY", 2),
        ("SUBMITTED", 3),
        ("HUMAN LANE", 4),
        ("WAITING", 5),
        ("RESPONSE", 6),
        ("INTERVIEW", 7),
        ("OFFER", 8),
        ("ACCEPTED", 9),
        ("CLOSED", 10),
    ]

    for name, position in default_stages:
        db.add(models.Stage(name=name, position=position, is_default=True))

    db.commit()
    db.close()
