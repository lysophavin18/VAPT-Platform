"""
NoovaStack VAPT Platform - API Token Routes
"""
import secrets
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_password_hash, require_user
from database import get_db
from database.models import APIToken, User

router = APIRouter()


class APITokenCreate(BaseModel):
    name: str
    scopes: list[str] = ["read"]
    expires_days: Optional[int] = None


class APITokenResponse(BaseModel):
    id: UUID
    name: str
    token_prefix: str
    scopes: list[str]
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    is_active: bool
    created_at: Optional[datetime]
    model_config = {"from_attributes": True}


class APITokenCreated(APITokenResponse):
    token: str  # only returned once on creation


@router.post("/auth/tokens", response_model=APITokenCreated, status_code=201)
async def create_token(
    request: APITokenCreate,
    current_user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    raw = secrets.token_urlsafe(32)
    prefix = raw[:8]
    token_hash = get_password_hash(raw)

    expires_at = None
    if request.expires_days:
        from datetime import timedelta
        expires_at = datetime.utcnow() + timedelta(days=request.expires_days)

    token = APIToken(
        user_id=current_user.id,
        name=request.name,
        token_prefix=prefix,
        token_hash=token_hash,
        scopes=request.scopes,
        expires_at=expires_at,
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)

    return APITokenCreated(
        id=token.id,
        name=token.name,
        token_prefix=token.token_prefix,
        scopes=token.scopes,
        last_used_at=token.last_used_at,
        expires_at=token.expires_at,
        is_active=token.is_active,
        created_at=token.created_at,
        token=raw,
    )


@router.get("/auth/tokens", response_model=list[APITokenResponse])
async def list_tokens(
    current_user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(APIToken)
        .where(APIToken.user_id == current_user.id, APIToken.is_active == True)
        .order_by(APIToken.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/auth/tokens/{token_id}", status_code=204)
async def revoke_token(
    token_id: UUID,
    current_user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(APIToken).where(APIToken.id == token_id, APIToken.user_id == current_user.id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    token.is_active = False
    await db.commit()
