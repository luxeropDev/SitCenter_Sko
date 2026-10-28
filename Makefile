.PHONY: install install-backend install-frontend seed seed-reset backend frontend simulator test test-frontend lint build check check-config migrate migrate-new create-admin

PY=backend/.venv/bin/python
UVICORN=backend/.venv/bin/uvicorn

install: install-backend install-frontend

install-backend:
	cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt && ([ -f .env ] || cp .env.example .env)

install-frontend:
	cd frontend && npm install

seed:
	cd backend && .venv/bin/python -m app.seed

seed-reset:
	cd backend && .venv/bin/python -m app.seed --reset

backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

frontend:
	cd frontend && npm run dev

simulator:            # external simulator process (set SIMULATOR_MODE=external in backend/.env)
	cd backend && .venv/bin/python -m app.simulator.runner --api http://localhost:8000 --key $${INGEST_API_KEY:-dev-ingest-key-change-me}

test:                 # backend unit/integration tests
	cd backend && .venv/bin/python -m pytest -p no:warnings

test-frontend:        # vitest (jsdom)
	cd frontend && npm test

lint:
	cd frontend && npm run lint

check:                # TypeScript
	cd frontend && npm run typecheck

build: check
	cd frontend && npm run build

check-config:         # validate backend/.env for the selected APP_ENV
	cd backend && .venv/bin/python -m scripts.check_config

migrate:              # apply Alembic migrations (required in production)
	cd backend && .venv/bin/alembic upgrade head

migrate-new:          # autogenerate a migration: make migrate-new m="add column"
	cd backend && .venv/bin/alembic revision --autogenerate -m "$(m)"

create-admin:         # ADMIN_PASSWORD=... make create-admin u=admin e=admin@example.com
	cd backend && .venv/bin/python -m scripts.create_admin --username $(u) --email $(e)

all-checks: test check lint build test-frontend
