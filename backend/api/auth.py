import os
import secrets
import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import jwt as pyjwt

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 30  # 30 days
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")

TOKEN_PREFIX = "jt_"


def create_access_token(user_id: int, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(None),
) -> models.User | None:
    """Extract user from JWT or PAT token. Returns None if auth not configured (local dev)."""
    if not GOOGLE_CLIENT_ID:
        return None

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.removeprefix("Bearer ")

    # PAT: starts with jt_
    if token.startswith(TOKEN_PREFIX):
        token_hash = _hash_token(token)
        api_token = db.query(models.ApiToken).filter(
            models.ApiToken.token_hash == token_hash
        ).first()
        if not api_token:
            raise HTTPException(status_code=401, detail="Invalid API token")
        api_token.last_used_at = datetime.now(timezone.utc)
        db.commit()
        return api_token.user

    # JWT
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = int(payload["sub"])
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ── Google OAuth ────────────────────────────────────────────────────────────


@router.post("/google", response_model=schemas.TokenResponse)
def google_login(body: schemas.GoogleAuthRequest, db: Session = Depends(get_db)):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    try:
        idinfo = id_token.verify_oauth2_token(
            body.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {e}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification error: {type(e).__name__}: {e}")

    google_id = idinfo["sub"]
    email = idinfo["email"]
    name = idinfo.get("name")
    picture = idinfo.get("picture")

    user = db.query(models.User).filter(models.User.google_id == google_id).first()
    if not user:
        user = db.query(models.User).filter(models.User.email == email).first()

    if user:
        user.last_login = datetime.now(timezone.utc)
        user.name = name or user.name
        user.picture = picture or user.picture
        if not user.google_id:
            user.google_id = google_id
    else:
        user = models.User(
            email=email,
            name=name,
            picture=picture,
            google_id=google_id,
        )
        db.add(user)

    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.email)
    return schemas.TokenResponse(access_token=token)


# ── User profile ────────────────────────────────────────────────────────────


@router.get("/me", response_model=schemas.UserOut)
def get_me(
    user: models.User | None = Depends(get_current_user),
    db: Session = Depends(get_db),
    x_timezone: str | None = Header(None),
):
    if user is None:
        return schemas.UserOut(
            id=0,
            email="dev@localhost",
            name="Local Dev",
            timezone=x_timezone,
            created_at=datetime.now(timezone.utc),
        )
    if x_timezone and x_timezone != user.timezone:
        user.timezone = x_timezone
        db.commit()
    return user


@router.put("/me/timezone", response_model=schemas.UserOut)
def update_timezone(
    body: dict,
    user: models.User | None = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    tz = body.get("timezone", "")
    if tz:
        user.timezone = tz
        db.commit()
        db.refresh(user)
    return user


# ── Personal Access Tokens ──────────────────────────────────────────────────


@router.post("/tokens", response_model=schemas.TokenCreateResponse)
def create_token(
    body: schemas.TokenCreateRequest,
    user: models.User | None = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    raw_token = TOKEN_PREFIX + secrets.token_hex(32)
    token_hash = _hash_token(raw_token)
    token_prefix = raw_token[:10]

    api_token = models.ApiToken(
        user_id=user.id,
        name=body.name.strip(),
        token_hash=token_hash,
        token_prefix=token_prefix,
    )
    db.add(api_token)
    db.commit()
    db.refresh(api_token)

    return schemas.TokenCreateResponse(
        id=api_token.id,
        name=api_token.name,
        token=raw_token,
        token_prefix=token_prefix,
        created_at=api_token.created_at,
    )


@router.get("/tokens", response_model=list[schemas.TokenOut])
def list_tokens(
    user: models.User | None = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return db.query(models.ApiToken).filter(
        models.ApiToken.user_id == user.id
    ).order_by(models.ApiToken.created_at.desc()).all()


@router.delete("/tokens/{token_id}")
def delete_token(
    token_id: int,
    user: models.User | None = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    api_token = db.query(models.ApiToken).filter(
        models.ApiToken.id == token_id,
        models.ApiToken.user_id == user.id,
    ).first()
    if not api_token:
        raise HTTPException(status_code=404, detail="Token not found")
    db.delete(api_token)
    db.commit()
    return {"detail": "Token revoked"}
