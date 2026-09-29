"""
Simple in-memory rate limiter for auth endpoints.
"""
import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

_store: dict[str, list[float]] = defaultdict(list)
WINDOW = 60
MAX_REQUESTS = 10


async def check_auth_rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    _store[client_ip] = [t for t in _store[client_ip] if now - t < WINDOW]
    if len(_store[client_ip]) >= MAX_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
    _store[client_ip].append(now)
