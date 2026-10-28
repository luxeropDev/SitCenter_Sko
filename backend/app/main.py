from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles

from app.core.config import APP_VERSION, get_settings
from app.core.database import init_db
from app.core.errors import AppError
from app.core.ratelimit import SlidingWindowLimiter
from app.routers import admin, alerts, analytics, auth, events, health, simulator, stations, telemetry
from app.simulator.engine import simulator as embedded_simulator

settings = get_settings()
logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("urpaq")

login_limiter = SlidingWindowLimiter(settings.login_rate_limit_per_minute, 60.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.is_production:
        # Schema is managed by Alembic in production: run `alembic upgrade head` before starting.
        log.info("production mode: skipping create_all, expecting Alembic-managed schema")
    else:
        init_db()
    if settings.seed_on_startup and settings.app_env != "test":
        from app.seed import seed

        seed(verbose=False)
    if settings.simulator_mode == "embedded" and settings.app_env != "test":
        if settings.simulator_autostart:
            from app.core.database import SessionLocal
            from app.simulator.engine import get_state

            with SessionLocal() as db:
                st = get_state(db)
                st.state = "running"
                db.commit()
        await embedded_simulator.start()
    if not settings.is_production and settings.secret_key.startswith("dev-only"):
        log.warning("Using the insecure development SECRET_KEY — set SECRET_KEY in .env before any real deployment.")
    log.info("%s v%s started (env=%s, simulator_mode=%s, docs=%s)", settings.app_name, APP_VERSION, settings.app_env, settings.simulator_mode, settings.docs_enabled)
    try:
        yield
    finally:
        await embedded_simulator.stop()
        log.info("shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version=APP_VERSION,
    description="Учебный прототип платформы раннего выявления паводков. Все данные синтетические. "
                "Оценка риска — демонстрационная эвристика, не валидированный прогноз.",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.docs_enabled else None,
    redoc_url="/api/redoc" if settings.docs_enabled else None,
    openapi_url="/api/openapi.json" if settings.docs_enabled else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Ingest-Key", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)


def _client_ip(request: Request) -> str:
    if settings.trust_proxy_headers:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def request_guard(request: Request, call_next):
    """Request-id, body size limit, login rate limit, security headers and access log (no secrets)."""
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > settings.max_request_bytes:
        return JSONResponse(status_code=413, content={"error": {"code": "payload_too_large", "message": "Request body too large", "request_id": rid}})
    if request.method == "POST" and request.url.path == "/api/auth/login" and not login_limiter.hit(_client_ip(request)):
        log.warning("login rate limit hit ip=%s rid=%s", _client_ip(request), rid)
        return JSONResponse(status_code=429, content={"error": {"code": "rate_limited", "message": "Слишком много попыток входа. Повторите через минуту.", "request_id": rid}},
                            headers={"Retry-After": "60"})
    start = time.perf_counter()
    try:
        response = await asyncio.wait_for(call_next(request), timeout=60)
    except asyncio.TimeoutError:
        return JSONResponse(status_code=504, content={"error": {"code": "timeout", "message": "Request timed out", "request_id": rid}})
    dur = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = rid
    if settings.secure_headers:
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
    if not request.url.path.startswith("/api/health"):
        log.info("%s %s -> %s %.1fms rid=%s", request.method, request.url.path, response.status_code, dur, rid)
    return response


def _error(status: int, code: str, message: str, details=None, request: Request | None = None):
    body = {"error": {"code": code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    if request is not None:
        body["error"]["request_id"] = request.headers.get("x-request-id")
    return JSONResponse(status_code=status, content=body)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return _error(exc.status_code, exc.code, exc.message, exc.details, request)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    details = [{"loc": [str(x) for x in e.get("loc", [])], "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()]
    return _error(422, "validation_error", "Некорректные входные данные", details, request)


@app.exception_handler(StarletteHTTPException)
async def http_handler(request: Request, exc: StarletteHTTPException):
    code = {401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
    return _error(exc.status_code, code, str(exc.detail), None, request)


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    # Stack trace goes to the server log only; the client gets a generic message.
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return _error(500, "internal_error", "Внутренняя ошибка сервера", None, request)


API = "/api"
app.include_router(health.router, prefix=API)
app.include_router(auth.router, prefix=API)
app.include_router(stations.router, prefix=API)
app.include_router(telemetry.router, prefix=API)
app.include_router(alerts.router, prefix=API)
app.include_router(analytics.router, prefix=API)
app.include_router(simulator.router, prefix=API)
app.include_router(admin.router, prefix=API)
app.include_router(admin.audit_router, prefix=API)
app.include_router(events.router, prefix=API)


# Optional single-process deployment: serve the built SPA from the API (SERVE_FRONTEND_DIR=/path/to/frontend/dist).
_frontend_dir = settings.serve_frontend_dir
if _frontend_dir and os.path.isdir(_frontend_dir):
    _assets = os.path.join(_frontend_dir, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")
    _index = os.path.join(_frontend_dir, "index.html")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            return _error(404, "not_found", "Not Found")
        candidate = os.path.normpath(os.path.join(_frontend_dir, full_path))
        if full_path and candidate.startswith(_frontend_dir) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(_index)

    log.info("serving frontend from %s", _frontend_dir)
