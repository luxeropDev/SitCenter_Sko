# XAVAMOS Digital Urpaq — платформа раннего выявления паводков

> Учебный прототип для хакатона Xavamos Digital Urpaq. **Все данные синтетические**, оценка риска — объяснимая демонстрационная эвристика, а не валидированный прогноз. Не предназначено для реального экстренного реагирования.

Телеметрия со станций → API → БД → объяснимый индекс риска 0–100 → автоматическое предупреждение → обработка оператором с аудитом. Единый центр мониторинга с картой, графиками, журналом предупреждений, аналитикой, управляемым симулятором и администрированием.

## Что внутри

| Раздел | Возможности |
|---|---|
| **Обзор** | KPI-карточки с реальными данными (активные станции, высокий риск, открытые предупреждения, свежесть данных) — каждая ведёт на отфильтрованную страницу; карта; графики уровня воды, осадков и скорости подъёма за 60 минут; станции с наибольшим риском; объяснение факторов; последние предупреждения; лента событий из журнала |
| **Карта мониторинга** | Leaflet + OpenStreetMap, маркеры по цвету/форме/букве (без опоры только на цвет), устаревшие данные приглушены, поиск и фильтры (сохраняются в URL), боковая панель выбранной станции с текущими значениями и причинами оценки, drawer на телефоне, возврат к обзору, сообщение при недоступности тайлов |
| **Станции** | Реестр с поиском, фильтрами, сортировкой, пагинацией и CSV; карточный режим на телефоне; для admin — создание/редактирование с inline-валидацией, отключение, восстановление, удаление с подтверждением |
| **Карточка станции** | Текущие значения со свежестью, графики за 15 мин / 1 ч / 6 ч / 24 ч / 7 дней с порогами, объяснение риска и факторы, трендовая экстраполяция, история категорий, связанные предупреждения, экспорт телеметрии |
| **Предупреждения** | Счётчики, фильтры по статусу/уровню/станции/периоду (в URL), поиск, сортировка, пагинация, drawer с факторами и историей действий, «принять в работу» и «закрыть с причиной», CSV |
| **Аналитика** | Графики по сохранённой телеметрии, динамика индекса риска, предупреждения по уровню, топ станций, история инцидентов, сравнение с предыдущим периодом |
| **Симулятор** | Сценарии `NORMAL` / `RISING_WATER` / `RAPID_FLOOD`, интенсивность, интервал, ускорение, seed; старт/пауза/продолжение/стоп/сброс через backend API; предпросмотр кривой; живой график из БД; журнал событий; текущий риск с переходом к станции; сценарии отдельных станций |
| **Администрирование** | Станции, пользователи и роли, веса и пороги алгоритма, правила предупреждений, состояние API/БД/симулятора/источников, журнал аудита |
| **Настройки** | Тема (светлая/тёмная/системная), язык (русский/қазақша), интервал автообновления, профиль, описание алгоритма, версии UI/API |
| **Оболочка** | Большая боковая навигация с hamburger-кнопкой (сворачивание в иконки на desktop, drawer на телефоне с затемнением, Escape и возвратом фокуса), палитра команд `Ctrl/⌘ K` или `/`, индикатор LIVE только при реальном потоке данных, индикатор связи, тосты, skeleton/empty/error-состояния, `prefers-reduced-motion` |

Безопасность: Argon2id, JWT с отзывом, RBAC на сервере (observer / operator / admin), лимит попыток входа, CORS allowlist, security-заголовки, единый формат ошибок без утечки деталей, аудит без секретов, production-режим отказывается стартовать с небезопасной конфигурацией. Подробности — [docs/SECURITY.md](docs/SECURITY.md).

## Стек

| Слой | Технологии |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4 (дизайн-токены), Radix UI, Lucide, Recharts, Leaflet / react-leaflet, react-router 7, sonner; vitest + Testing Library |
| Backend | Python ≥ 3.11, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, PyJWT, argon2-cffi, uvicorn; pytest |
| БД | SQLite по умолчанию (dev), PostgreSQL для production (`psycopg`) |
| Документация API | Swagger `/api/docs`, ReDoc `/api/redoc` (в production выключены по умолчанию); [docs/API.md](docs/API.md) |

## Структура

```
SitCenter/
├── backend/
│   ├── app/
│   │   ├── core/        config (+ production checks), database, security, deps (RBAC), ratelimit, errors
│   │   ├── models/      SQLAlchemy-модели
│   │   ├── schemas/     Pydantic DTO и валидация
│   │   ├── services/    risk_engine, telemetry, alerts, stations, analytics, settings, audit, auth
│   │   ├── simulator/   scenarios (детерминированные кривые), engine (встроенный цикл), runner (внешний процесс)
│   │   ├── routers/     health, auth, stations, telemetry, alerts, analytics, simulator, admin, events
│   │   ├── seed.py      идемпотентные демо-данные
│   │   └── main.py      приложение, middleware, обработчики ошибок, lifespan
│   ├── alembic/         миграции схемы
│   ├── scripts/         check_config.py, create_admin.py
│   ├── tests/           pytest (52 теста)
│   └── .env.example
├── frontend/src/
│   ├── components/ui/   button, input/select/checkbox/segmented, card, badge, dialog/drawer, table/DataTable, tabs, tooltip, dropdown, switch, skeleton
│   ├── components/      common (PageHeader, StatCard, ChartContainer, FilterBar, Breadcrumbs, states…), StationMap, StationForm, charts
│   ├── components/layout AppShell (sidebar + hamburger + topbar), CommandPalette, nav
│   ├── lib/             api, types, i18n (ru/kk), theme, auth, connection, usePolling, useUrlState, csv
│   ├── pages/           Overview, LiveMap, Stations, StationDetails, Alerts, Analytics, Simulator, Admin, Settings, Login, NotFound
│   └── **/__tests__     vitest
├── docs/                ALGORITHM.md, API.md, DEPLOYMENT.md, SECURITY.md
├── docker-compose.yml       dev/demo (SQLite)
├── docker-compose.prod.yml  PostgreSQL + миграции + nginx
└── Makefile
```

## Быстрый старт (локально)

Требования: Python ≥ 3.11, Node.js ≥ 20, доступ к `tile.openstreetmap.org` для тайлов карты.

```bash
git clone <repo> SitCenter && cd SitCenter

# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env                                        # dev-значения подходят для локального запуска
python -m app.seed                                          # демо-данные (идемпотентно); --reset пересоздаёт
uvicorn app.main:app --reload --port 8000                   # http://localhost:8000/api/docs

# Frontend (другой терминал)
cd frontend
npm install
npm run dev                                                 # http://localhost:5173 (/api проксируется на :8000)
```

Или из корня через Makefile: `make install`, `make seed`, `make backend`, `make frontend`.

### Демо-учётные записи (только локальная разработка)

| Роль | Логин | Пароль |
|---|---|---|
| admin | `admin` | `Admin12345!` |
| operator | `operator` | `Operator12345!` |
| observer | `observer` | `Observer12345!` |

Создаются только при `SEED_ON_STARTUP=true` или `python -m app.seed`. В production — `SEED_ON_STARTUP=false` и `python -m scripts.create_admin`.

## Поток данных (end-to-end)

```
Симулятор (embedded / external) или устройство
  → POST /api/telemetry/ingest  (X-Ingest-Key или токен оператора; валидация диапазонов, единиц, времени, идемпотентность по event_id)
  → Telemetry в БД → risk_engine.assess_risk → RiskAssessment в БД
  → alert_service.evaluate_alerts (создание / эскалация / дедупликация / подавление) → Alert + AuditLog
  → UI опрашивает /dashboard/summary, /stations, /alerts, /events/recent, /analytics/overview
Оператор: POST /alerts/{id}/acknowledge → /resolve {note} → AuditLog (кто, когда, причина)
Администратор: PATCH /admin/settings → следующие оценки используют новые веса/пороги
```

Проверено сквозным сценарием в браузере: старт `RISING_WATER` → через ~30 с 7 станций получают оценки, создаются и эскалируются предупреждения, лента событий и карточки обновляются, оператор принимает и закрывает предупреждение, аудит фиксирует `alert.acknowledged` / `alert.resolved` с автором и причиной.

### Симулятор

`SIMULATOR_MODE`: `embedded` (один asyncio-цикл внутри API; состояние в таблице `simulator_state`, перезапуск сервера не создаёт второго цикла), `external` (`python -m app.simulator.runner --api http://localhost:8000 --key <INGEST_API_KEY>`; отказывается работать при живом встроенном драйвере), `off`. Измерения — детерминированные функции (сценарий, модельное время, seed, станция), а не независимый шум; отключённые станции пропускаются; ошибки ingest не останавливают цикл.

## Оценка риска

`score = 100 · Σ(wᵢ·cᵢ) / Σwᵢ` по доступным компонентам: уровень воды относительно базового/критического порога (0.35), скорость подъёма (0.25), осадки (0.20), влажность почвы (0.10, только свежая), тренд (0.10). Категории `low < 35 ≤ medium < 65 ≤ high`, статусы `insufficient_data` и `stale`. Веса и пороги настраиваются в Administration → Параметры риска, пороги станции — в её карточке. Формулы, примеры и правила предупреждений — [docs/ALGORITHM.md](docs/ALGORITHM.md).

## Команды проверки

```bash
make test             # backend: pytest (52 теста)
make check            # frontend: tsc --noEmit
make lint             # frontend: oxlint
make build            # frontend: production build (dist/)
make test-frontend    # frontend: vitest (19 тестов)
make check-config     # проверка backend/.env для выбранного APP_ENV
make all-checks       # всё вместе
```

## Production и деплой

Полное руководство — [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): переменные окружения, Alembic-миграции (`alembic upgrade head`), резервное копирование, создание администратора, запуск без Docker (systemd + nginx) и с Docker Compose (`docker-compose.prod.yml`: PostgreSQL + миграции + nginx), health-пробы `/api/health/live` и `/api/health/ready`, ограничения хостингов и чек-лист. **Публичный деплой не выполнялся** — остающиеся ручные шаги перечислены в документе.

Коротко:
```bash
cp .env.prod.example .env.prod && $EDITOR .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml exec api sh -c 'ADMIN_PASSWORD=… python -m scripts.create_admin --username admin --email admin@example.com'
```

## Сценарий демонстрации (3–5 минут)

1. Войдите как `operator` (кнопка «Оператор» на экране входа). На **Обзоре**: 7 станций, одна с высоким риском и открытым предупреждением; KPI-карточки кликабельны.
2. **Симулятор** → сценарий «Подъём воды», интервал 2–5 с, ускорение ×30 → «Запустить». Тики и «Отправлено записей» растут, в шапке появляется **LIVE**, журнал событий показывает `simulator.start`.
3. **Обзор** через 20–30 с: графики уровня растут, индексы станций поднимаются, в «Объяснении текущего риска» — «быстрый рост уровня», «осадки», тренд «рост»; лента событий показывает создание и эскалацию предупреждений.
4. **Карта**: фильтр «Риск: Высокий», клик по маркеру → боковая панель с причинами оценки → «Открыть станцию».
5. **Предупреждения**: откройте предупреждение → «Принять в работу» → укажите причину → «Закрыть». История действий обновляется.
6. Войдите как `admin` → **Администрирование → Журнал аудита**: `simulator.start`, `alert.created`, `alert.escalated`, `alert.acknowledged`, `alert.resolved`.
7. **Параметры риска**: поднимите порог `high` до 90 → следующие оценки переклассифицируются. **Симулятор**: сценарий «Норма» → индексы снижаются.
8. `Ctrl/⌘ K` — найдите станцию по названию; переключите тему и язык в шапке.

## Ограничения прототипа

- Данные синтетические; индекс риска — эвристика без калибровки на реальных событиях; «трендовая оценка на 1–3 ч» — линейная экстраполяция.
- Один процесс API при `SIMULATOR_MODE=embedded`; для нескольких воркеров — внешний симулятор.
- Bearer-токен в `localStorage` (см. остаточные риски в SECURITY.md); нет push-уведомлений (SMS/email).
- Лимит попыток входа хранится в памяти процесса.
- Карта требует доступа к OpenStreetMap (тайлы © участники OpenStreetMap, ODbL).
