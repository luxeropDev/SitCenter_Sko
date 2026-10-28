# Развёртывание XAVAMOS Digital Urpaq

Документ описывает, как запустить платформу локально, в production-режиме без Docker и с Docker Compose, какие переменные окружения обязательны и какие ограничения есть у хостингов. **Публичный деплой в рамках репозитория не выполнялся** — ниже перечислены ручные шаги, которые остаются за оператором.

## 1. Архитектура развёртывания

```
[браузер] ──HTTPS──> [reverse proxy: nginx / Caddy / PaaS router]
                           ├── /          → статика frontend (dist) или SPA из API (SERVE_FRONTEND_DIR)
                           └── /api/*     → uvicorn app.main:app (FastAPI, 1 воркер при embedded-симуляторе)
                                               └── PostgreSQL (production) / SQLite на постоянном томе (демо)
[внешний симулятор / устройства] ──X-Ingest-Key──> /api/telemetry/ingest
```

Рекомендуемая схема: **один постоянный процесс API + PostgreSQL + статика frontend за reverse proxy**. Симулятор может работать внутри API (`SIMULATOR_MODE=embedded`, один воркер) или отдельным процессом (`external`).

## 2. Переменные окружения backend

| Переменная | Обязательна в production | Значение |
|---|---|---|
| `APP_ENV` | да | `production` включает проверки безопасности (см. `app/core/config.py: production_problems`) |
| `DATABASE_URL` | да | `postgresql+psycopg://user:pass@host:5432/urpaq`. SQLite допускается только по абсолютному пути на постоянном томе: `sqlite:////data/urpaq.db` |
| `SECRET_KEY` | да | ≥ 32 случайных символов: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `INGEST_API_KEY` | да | ≥ 16 случайных символов; передаётся симулятором/устройствами в `X-Ingest-Key` |
| `CORS_ORIGINS` | да | публичный origin frontend, через запятую, без localhost: `https://urpaq.example.com` |
| `ACCESS_TOKEN_MINUTES` | нет | срок жизни JWT (по умолчанию 480) |
| `SIMULATOR_MODE` | нет | `embedded` / `external` / `off` |
| `SIMULATOR_AUTOSTART` | нет | `false` — симулятор включают со страницы Simulator |
| `SEED_ON_STARTUP` | **должно быть `false`** | демо-учётные записи с известными паролями |
| `ENABLE_DOCS` | нет | Swagger выключен в production, если явно не `true` |
| `LOGIN_RATE_LIMIT_PER_MINUTE` | нет | попыток входа в минуту с одного IP (по умолчанию 10) |
| `TRUST_PROXY_HEADERS` | за прокси — `true` | использовать `X-Forwarded-For` для лимита входа |
| `SECURE_HEADERS` | нет | security-заголовки (по умолчанию `true`) |
| `SERVE_FRONTEND_DIR` | нет | путь к `frontend/dist`, если SPA раздаёт сам API |
| `LOG_LEVEL`, `MAX_REQUEST_BYTES` | нет | логирование / лимит тела запроса |

Frontend (на этапе сборки): `VITE_API_BASE` — абсолютный origin API, если он не на том же домене (`/api` по умолчанию проксируется reverse proxy); `VITE_SHOW_DEMO_ACCOUNTS=false` скрывает кнопки демо-аккаунтов на странице входа.

Проверка конфигурации до запуска:

```bash
cd backend && python -m scripts.check_config      # код выхода 1, если конфигурация небезопасна для APP_ENV
```

При `APP_ENV=production` приложение **отказывается стартовать** с dev-секретами, localhost в CORS или относительным SQLite-путём.

## 3. База данных и миграции

- Схема управляется **Alembic** (`backend/alembic`, первая ревизия — `initial schema`).
- В `development`/`test` таблицы по-прежнему создаются автоматически (`create_all`) для удобства; в `production` автосоздание **отключено** — нужно применить миграции:

```bash
cd backend
alembic upgrade head                 # создать/обновить схему
alembic current                      # проверить ревизию
```

- Существующая БД, созданная до появления миграций (через `create_all`): один раз выполнить `alembic stamp head`, далее `alembic upgrade head` при обновлениях.
- Новая миграция после изменения моделей: `alembic revision --autogenerate -m "describe change"` → проверить файл → `alembic upgrade head`.
- Seed демо-данных (`python -m app.seed`) **не является миграцией** и не нужен для работы схемы.

### Резервное копирование и восстановление

PostgreSQL:
```bash
pg_dump --format=custom "$DATABASE_URL" > urpaq-$(date +%F).dump
pg_restore --clean --if-exists --dbname "$DATABASE_URL" urpaq-YYYY-MM-DD.dump
```

SQLite (только при остановленном API или через онлайн-бэкап):
```bash
sqlite3 /data/urpaq.db ".backup '/backups/urpaq-$(date +%F).db'"
cp /backups/urpaq-YYYY-MM-DD.db /data/urpaq.db      # восстановление при остановленном API
```

Хранить резервные копии вне хоста приложения; перед обновлением версии делать копию.

## 4. Первичное создание администратора

Не используйте демо-seed в production. Создайте администратора без вывода пароля в логи:

```bash
cd backend
ADMIN_PASSWORD='<надёжный пароль ≥ 12 символов>' python -m scripts.create_admin --username admin --email admin@example.com
```

Остальных пользователей создаёт администратор через **Administration → Users**.

## 5. Production без Docker (Linux VM)

```bash
# 1. Код и зависимости
git clone <repo> /opt/urpaq && cd /opt/urpaq
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd ../frontend && npm ci && npm run build          # -> frontend/dist

# 2. Конфигурация
cp /opt/urpaq/backend/.env.example /opt/urpaq/backend/.env   # заполнить production-значения
cd /opt/urpaq/backend && .venv/bin/python -m scripts.check_config

# 3. База и администратор
.venv/bin/alembic upgrade head
ADMIN_PASSWORD='…' .venv/bin/python -m scripts.create_admin --username admin --email admin@example.com

# 4. Запуск (systemd-юнит ниже)
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips='127.0.0.1'
```

`--workers 1` обязателен при `SIMULATOR_MODE=embedded` (один цикл симулятора на процесс). Для нескольких воркеров используйте `SIMULATOR_MODE=external` и отдельный процесс `python -m app.simulator.runner --api http://127.0.0.1:8000 --key $INGEST_API_KEY`.

systemd (`/etc/systemd/system/urpaq-api.service`):
```ini
[Unit]
Description=XAVAMOS Digital Urpaq API
After=network.target postgresql.service

[Service]
User=urpaq
WorkingDirectory=/opt/urpaq/backend
EnvironmentFile=/opt/urpaq/backend/.env
ExecStartPre=/opt/urpaq/backend/.venv/bin/alembic upgrade head
ExecStart=/opt/urpaq/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips=127.0.0.1
Restart=always
KillSignal=SIGTERM
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

nginx (TLS через certbot/Caddy):
```nginx
server {
  listen 443 ssl http2;
  server_name urpaq.example.com;
  # ssl_certificate ...; ssl_certificate_key ...;
  root /opt/urpaq/frontend/dist;
  location /api/ { proxy_pass http://127.0.0.1:8000/api/; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto https; proxy_read_timeout 70s; }
  location / { try_files $uri /index.html; add_header Cache-Control "no-cache"; }
  location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
}
```

Корректное завершение: uvicorn получает SIGTERM → `lifespan` отменяет фоновый цикл симулятора и закрывает соединения.

## 6. Docker Compose (production-профиль)

`docker-compose.prod.yml` поднимает PostgreSQL, API (с автоматическим `alembic upgrade head` при старте) и nginx со статикой frontend:

```bash
cp .env.prod.example .env.prod          # заполнить SECRET_KEY, INGEST_API_KEY, POSTGRES_PASSWORD, PUBLIC_ORIGIN
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml exec api sh -c 'ADMIN_PASSWORD=… python -m scripts.create_admin --username admin --email admin@example.com'
```

Health-пробы: `GET /api/health/live` (процесс жив), `GET /api/health/ready` (БД и схема доступны; 503 — не готов).

TLS в Compose-профиле не терминируется — поставьте перед `web` Caddy/Traefik или балансировщик провайдера.

## 7. Ограничения хостингов

| Платформа | Подходит | Ограничения |
|---|---|---|
| VM (Hetzner, Yandex Cloud, DO, EC2) + PostgreSQL | **да, рекомендуется** | нужны systemd/nginx/TLS — см. раздел 5 |
| Render / Railway / Fly.io (web service + managed Postgres) | да | бесплатные тарифы **засыпают** — встроенный симулятор останавливается вместе с процессом; используйте платный always-on тариф или `SIMULATOR_MODE=external` на отдельном worker |
| Serverless (Vercel/Netlify functions, Lambda) | **нет для API** | нет постоянного процесса для симулятора и фоновых задач; статику frontend размещать можно |
| SQLite на эфемерной ФС (Heroku-подобные) | **нет** | данные теряются при деплое/перезапуске. Только PostgreSQL или постоянный том |

## 8. Чек-лист перед публичным запуском

1. `APP_ENV=production`, уникальные `SECRET_KEY` и `INGEST_API_KEY`, `SEED_ON_STARTUP=false`.
2. PostgreSQL (или SQLite на постоянном томе), `alembic upgrade head`, бэкап настроен.
3. `CORS_ORIGINS` = только публичный origin; TLS на прокси; `TRUST_PROXY_HEADERS=true` за прокси.
4. Администратор создан через `scripts/create_admin.py`; демо-пароли не существуют.
5. `python -m scripts.check_config` → `OK`.
6. `/api/health/ready` возвращает 200; логи без секретов (`LOG_LEVEL=INFO`).
7. Frontend собран с правильным `VITE_API_BASE` (или проксирован под тем же доменом), `VITE_SHOW_DEMO_ACCOUNTS=false`.
8. Проверен сценарий: вход → Simulator → предупреждение → Alerts → аудит.

## 9. Что остаётся сделать вручную для фактического деплоя

- Завести сервер/аккаунт хостинга и управляемый PostgreSQL.
- Купить/настроить домен и TLS-сертификат.
- Сгенерировать секреты и заполнить `.env` / `.env.prod`.
- Выполнить команды из разделов 5 или 6, создать администратора.
- Настроить расписание резервного копирования и мониторинг `/api/health/ready`.
