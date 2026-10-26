import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from .db import build_engine, build_session_factory
from .models import SessionRecord, User
from .seed import DEMO_USERS
from .settings import Settings, get_settings

COOKIE = "ita_session"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

def error_response(code: str, message: str, status: int):
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)

def current_session(request: Request):
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, detail={"code": "UNAUTHENTICATED", "message": "Select a demo identity to continue."})
    with request.app.state.session_factory() as db:
        record = db.get(SessionRecord, hashlib.sha256(token.encode()).hexdigest())
        now = datetime.now(timezone.utc)
        expiry = record.expires_at.replace(tzinfo=timezone.utc) if record and record.expires_at.tzinfo is None else (record.expires_at if record else now)
        if not record or record.revoked_at or expiry <= now:
            raise HTTPException(401, detail={"code": "SESSION_EXPIRED", "message": "Your session has expired. Select a demo identity again."})
        user = db.get(User, record.user_id)
        if not user:
            raise HTTPException(401, detail={"code": "UNAUTHENTICATED", "message": "Session identity is unavailable."})
        return record, user

def require_role(role: str):
    def check(data=Depends(current_session)):
        if data[1].role != role:
            raise HTTPException(403, detail={"code": "FORBIDDEN", "message": "This screen is not available to your role."})
        return data
    return check

def public_user(user):
    return {"id": user.id, "role": user.role, "display_name": user.display_name, "seller_id": user.seller_id}

class DemoLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    demo_user_id: Literal["seller-a", "seller-b", "buyer-one", "buyer-two", "reviewer-one"]

def create_app(settings: Settings | None = None, engine=None):
    config = settings or get_settings()
    app = FastAPI(title="Invoice Trust Agent · ITA-02", version="0.1.0")
    app.state.config = config
    app.state.engine = engine or build_engine(config.database_url)
    app.state.session_factory = build_session_factory(app.state.engine)
    app.add_middleware(CORSMiddleware, allow_origins=config.allowed_origins, allow_credentials=True,
                       allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "X-CSRF-Token"])

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        detail = exc.detail if isinstance(exc.detail, dict) else {"code": "REQUEST_FAILED", "message": str(exc.detail)}
        return JSONResponse({"error": detail}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # Do not return input values or credentials from validation failures.
        return error_response("VALIDATION_ERROR", "Check the request fields and allowed identity.", 422)

    @app.middleware("http")
    async def security_boundary(request: Request, call_next):
        if request.method not in SAFE_METHODS:
            origin = request.headers.get("origin")
            if origin and origin not in config.allowed_origins:
                return error_response("ORIGIN_DENIED", "Request origin is not allowed.", 403)
            if request.url.path == "/api/demo/session":
                if request.headers.get("content-type", "").split(";")[0] != "application/json":
                    return error_response("JSON_REQUIRED", "Use an application/json request.", 415)
            elif request.cookies.get(COOKIE):
                try:
                    record, _ = current_session(request)
                except HTTPException as exc:
                    return JSONResponse({"error": exc.detail}, status_code=exc.status_code)
                supplied = request.headers.get("X-CSRF-Token", "")
                if not secrets.compare_digest(record.csrf_token, supplied):
                    return error_response("CSRF_REQUIRED", "Reload the page and retry with the session CSRF token.", 403)
        try:
            return await call_next(request)
        except SQLAlchemyError:
            return error_response("DATABASE_UNAVAILABLE", "Database unavailable. Run migrations and retry.", 503)
        except Exception:
            # Full exceptions must not be reflected into API responses.
            return error_response("INTERNAL_ERROR", "Request failed. Please retry.", 500)

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "invoice-trust-agent"}

    @app.get("/ready")
    def ready():
        try:
            with app.state.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                conn.execute(text("SELECT id FROM users LIMIT 1"))
                conn.execute(text("SELECT token_hash FROM sessions LIMIT 1"))
            return {"status": "ready", "database": "available", "llm_provider": config.llm_provider}
        except SQLAlchemyError:
            return error_response("NOT_READY", "Database is unavailable or migrations are missing.", 503)

    @app.get("/api/config")
    def public_config():
        return {"demo_mode": config.demo_mode, "app_env": config.app_env, "stage": "ITA-02 foundation", "llm_provider": "fake"}

    @app.get("/api/demo/users")
    def demo_users():
        if not config.demo_mode:
            raise HTTPException(403, detail={"code": "DEMO_DISABLED", "message": "Demo access is disabled."})
        return {"users": [{k: row[k] for k in ("id", "role", "display_name")} for row in DEMO_USERS]}

    @app.post("/api/demo/session")
    def login(body: DemoLogin, request: Request, response: Response):
        if not config.demo_mode:
            raise HTTPException(403, detail={"code": "DEMO_DISABLED", "message": "Demo access is disabled."})
        token, csrf = secrets.token_urlsafe(32), secrets.token_hex(32)
        with app.state.session_factory() as db:
            user = db.get(User, body.demo_user_id)
            if not user:
                raise HTTPException(503, detail={"code": "SEED_REQUIRED", "message": "Run the local demo seed command."})
            previous = request.cookies.get(COOKIE)
            if previous:
                old = db.get(SessionRecord, hashlib.sha256(previous.encode()).hexdigest())
                if old:
                    old.revoked_at = datetime.now(timezone.utc)
            db.add(SessionRecord(token_hash=hashlib.sha256(token.encode()).hexdigest(), user_id=user.id,
                                 csrf_token=csrf, expires_at=datetime.now(timezone.utc)+timedelta(minutes=config.session_ttl_minutes)))
            db.commit()
            result = public_user(user)
        response.set_cookie(COOKIE, token, httponly=True, secure=config.cookie_secure, samesite="lax",
                            max_age=config.session_ttl_minutes*60, path="/")
        return {"user": result, "csrf_token": csrf, "demo": True}

    @app.get("/api/auth/session")
    def session_info(data=Depends(current_session)):
        return {"user": public_user(data[1]), "csrf_token": data[0].csrf_token, "demo": config.demo_mode}

    @app.post("/api/auth/logout", status_code=204)
    def logout(response: Response, data=Depends(current_session)):
        with app.state.session_factory() as db:
            record = db.get(SessionRecord, data[0].token_hash)
            record.revoked_at = datetime.now(timezone.utc)
            db.commit()
        response.delete_cookie(COOKIE, path="/")

    @app.get("/api/seller/workspace")
    def seller_workspace(data=Depends(require_role("SELLER"))):
        return {"user": public_user(data[1]), "invoices": [], "message": "No invoice features implemented yet. ITA-03 is next."}

    @app.get("/api/reviewer/workspace")
    def reviewer_workspace(data=Depends(require_role("REVIEWER"))):
        return {"user": public_user(data[1]), "cases": [], "message": "Reviewer case queue is planned for ITA-11."}

    @app.get("/api/buyer/workspace")
    def buyer_workspace(data=Depends(require_role("BUYER"))):
        return {"user": public_user(data[1]), "message": "Demo buyer shell only. Email verification and case-scoped access are planned for ITA-09."}

    return app

app = create_app()
