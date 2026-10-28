# Backend (FastAPI)

См. корневой README.md. Быстрый старт:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m app.seed
uvicorn app.main:app --reload --port 8000
python -m pytest
```
