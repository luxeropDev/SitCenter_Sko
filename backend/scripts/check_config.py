"""Pre-start configuration check.

    python -m scripts.check_config          # exits 1 if the configuration is unsafe for APP_ENV

Loads the same Settings as the API (env + .env), prints a redacted summary and
runs the production safety checks without starting the server.
"""
from __future__ import annotations

import sys


def main() -> int:
    try:
        from app.core.config import APP_VERSION, Settings
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: cannot import app settings: {exc}")
        return 1
    try:
        s = Settings()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: invalid configuration: {exc}")
        return 1

    def redact(v: str) -> str:
        return "***" if not v else f"{v[:3]}…({len(v)} chars)"

    db = s.database_url
    if "@" in db:
        head, tail = db.split("@", 1)
        db = head.split("//")[0] + "//***@" + tail
    print(f"XAVAMOS Digital Urpaq v{APP_VERSION} — configuration check")
    print(f"  APP_ENV               = {s.app_env}")
    print(f"  DATABASE_URL          = {db}")
    print(f"  SECRET_KEY            = {redact(s.secret_key)}")
    print(f"  INGEST_API_KEY        = {redact(s.ingest_api_key)}")
    print(f"  CORS_ORIGINS          = {', '.join(s.cors_origin_list)}")
    print(f"  SIMULATOR_MODE        = {s.simulator_mode} (autostart={s.simulator_autostart})")
    print(f"  SEED_ON_STARTUP       = {s.seed_on_startup}")
    print(f"  ENABLE_DOCS           = {s.enable_docs} -> docs exposed: {s.docs_enabled}")
    print(f"  TRUST_PROXY_HEADERS   = {s.trust_proxy_headers}")
    print(f"  LOGIN_RATE_LIMIT/min  = {s.login_rate_limit_per_minute}")

    problems = s.production_problems()
    warnings = []
    if s.is_production and s.seed_on_startup:
        warnings.append("SEED_ON_STARTUP=true in production creates demo accounts with KNOWN passwords — set it to false and create the admin with scripts/create_admin.py")
    if s.is_production and s.docs_enabled:
        warnings.append("API docs are exposed in production (ENABLE_DOCS=true)")
    if s.is_production and s.simulator_mode == "embedded":
        warnings.append("Embedded simulator in production: make sure the host does not sleep/stop the process and run exactly one API worker")
    if s.database_url.startswith("sqlite"):
        warnings.append("SQLite: single-process only; use a persistent volume. PostgreSQL recommended for production")

    for w in warnings:
        print(f"WARN  {w}")
    for p in problems:
        print(f"ERROR {p}")
    if problems:
        print("Configuration is NOT safe for the selected APP_ENV.")
        return 1
    print("OK: configuration accepted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
