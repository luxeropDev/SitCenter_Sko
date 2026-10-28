from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_VERSION = "1.1.0"

INSECURE_DEFAULTS = ("dev-only", "change-me", "changeme")


class Settings(BaseSettings):
    """Application configuration loaded from environment / .env.

    See backend/.env.example and docs/DEPLOYMENT.md for every variable.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "XAVAMOS Digital Urpaq"
    app_env: str = Field(default="development", description="development | production | test")
    database_url: str = "sqlite:///./data/urpaq.db"
    secret_key: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 480
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    max_request_bytes: int = 256 * 1024
    ingest_api_key: str = "dev-ingest-key-change-me"
    simulator_mode: str = Field(default="embedded", description="embedded | external | off")
    simulator_autostart: bool = False
    log_level: str = "INFO"
    seed_on_startup: bool = True
    # Production hardening
    enable_docs: bool = Field(default=True, description="Expose Swagger/ReDoc. Forced off in production unless explicitly true.")
    login_rate_limit_per_minute: int = Field(default=10, ge=1, le=1000)
    trust_proxy_headers: bool = Field(default=False, description="Use X-Forwarded-For for rate limiting behind a reverse proxy")
    secure_headers: bool = True
    serve_frontend_dir: str = Field(default="", description="Optional path to the built frontend (dist) to serve from the API process")

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def docs_enabled(self) -> bool:
        return self.enable_docs and (not self.is_production or self.model_fields_set.__contains__("enable_docs"))

    @field_validator("simulator_mode")
    @classmethod
    def _mode(cls, v: str) -> str:
        v = v.lower()
        if v not in {"embedded", "external", "off"}:
            raise ValueError("simulator_mode must be embedded|external|off")
        return v

    @field_validator("app_env")
    @classmethod
    def _env(cls, v: str) -> str:
        v = v.lower()
        if v not in {"development", "production", "test"}:
            raise ValueError("app_env must be development|production|test")
        return v

    def production_problems(self) -> List[str]:
        """Configuration errors that must block a production start."""
        problems: List[str] = []
        if not self.is_production:
            return problems
        if any(tag in self.secret_key for tag in INSECURE_DEFAULTS) or len(self.secret_key) < 32:
            problems.append("SECRET_KEY must be a random string of at least 32 characters")
        if any(tag in self.ingest_api_key for tag in INSECURE_DEFAULTS) or len(self.ingest_api_key) < 16:
            problems.append("INGEST_API_KEY must be a random string of at least 16 characters")
        if any(o.startswith("http://localhost") or o.startswith("http://127.") for o in self.cors_origin_list):
            problems.append("CORS_ORIGINS still contains localhost origins")
        if self.database_url.startswith("sqlite") and not self.database_url.startswith("sqlite:////"):
            problems.append("DATABASE_URL uses a relative SQLite path; use PostgreSQL or an absolute path on a persistent volume")
        return problems


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    problems = s.production_problems()
    if problems:
        raise RuntimeError("Unsafe production configuration: " + "; ".join(problems))
    return s
