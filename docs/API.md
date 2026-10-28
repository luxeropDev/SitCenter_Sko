# API XAVAMOS Digital Urpaq

Базовый префикс: `/api`. Интерактивная документация: `/api/docs` (Swagger), `/api/redoc`. Все ответы JSON, время — ISO 8601 в UTC (`+00:00`); фронтенд отображает его в локальном времени.

## Аутентификация

`Authorization: Bearer <JWT>` для пользовательских запросов. Роли: `observer` < `operator` < `admin`; проверяются на сервере для каждого маршрута (роль читается из БД, а не из токена). Для приёма телеметрии дополнительно принимается заголовок `X-Ingest-Key: <INGEST_API_KEY>`.

```bash
TOKEN=$(curl -s -X POST localhost:8000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"operator","password":"Operator12345!"}' | jq -r .access_token)
curl -s localhost:8000/api/auth/me -H "Authorization: Bearer $TOKEN"
curl -s -X POST localhost:8000/api/auth/logout -H "Authorization: Bearer $TOKEN"   # отзывает jti
```

## Формат ошибок

```json
{"error": {"code": "validation_error", "message": "Некорректные входные данные", "details": [...], "request_id": "..."}}
```

Коды: `invalid_credentials`, `token_expired`, `token_revoked`, `not_authenticated`, `insufficient_role`, `station_not_found`, `alert_not_found`, `alert_resolved`, `station_not_online`, `unsupported_parameter`, `range_too_large`, `invalid_risk_settings`, `payload_too_large`, `internal_error` и др.

## Эндпоинты

### Здоровье
| | |
|---|---|
| `GET /health` | статус API и БД, версия API и алгоритма, режим симулятора (публично, без секретов) |
| `GET /health/live` | liveness-проба: процесс жив |
| `GET /health/ready` | readiness-проба: БД доступна и схема создана; `503` если нет |

### События
| | |
|---|---|
| `GET /events/recent?entity_type=alert|simulator|station&limit=20` | лента операционных событий для любого авторизованного пользователя (только `alert.*`, `simulator.*`, `station.*`; события входа/пользователей/настроек — только в `/audit-log` для admin) |

### Аутентификация
| | |
|---|---|
| `POST /auth/login` | `{username, password}` → `{access_token, expires_at, user}` |
| `GET /auth/me` | текущий пользователь |
| `POST /auth/logout` | отзыв токена |

### Панель и аналитика
| | |
|---|---|
| `GET /dashboard/summary` | KPI, станции с риском и последними значениями, серии за 60 мин, последние предупреждения, объяснение риска для станции с максимальным индексом |
| `GET /analytics/overview?from&to&station_id&scenario` | предупреждения по категориям/статусам, динамика индекса, бакетированная телеметрия, топ станций, история инцидентов (диапазон ≤ 30 дней) |

### Станции
| | Роль |
|---|---|
| `GET /stations?search&status&source_type&scenario&sort&order&page&page_size&include_deleted` | observer+ |
| `POST /stations` | admin |
| `GET /stations/{id}` | observer+ |
| `PATCH /stations/{id}` | admin |
| `DELETE /stations/{id}?hard=false` — soft-delete (история сохраняется); `hard=true` — удаление с историей | admin |
| `POST /stations/{id}/restore` | admin |
| `GET /stations/{id}/telemetry?parameter&from&to&bucket_seconds` — ≤ 5000 точек, диапазон ≤ 30 дней, автобакетирование | observer+ |
| `GET /stations/{id}/risk` — актуальная оценка (пересчёт без записи), пороги, последняя сохранённая, история категорий | observer+ |
| `GET /stations/{id}/alerts` | observer+ |

Пример создания:
```json
POST /api/stations
{"name":"Есиль — новый пост","latitude":54.9,"longitude":69.2,"source_type":"device","interval_seconds":30,
 "parameters":["water_level_cm","rainfall_mm_h"],
 "thresholds":{"baseline_level_cm":100,"warning_level_cm":200,"critical_level_cm":300}}
```
Валидация: широта −90…90, долгота −180…180, интервал 1…3600, `baseline < warning < critical`, обязателен `water_level_cm`.

### Телеметрия
| | Авторизация |
|---|---|
| `POST /telemetry/ingest` | `X-Ingest-Key` или operator+ |
| `POST /telemetry/ingest/batch` (≤ 50 сообщений) | то же |
| `GET /telemetry/latest` | observer+ |

```json
POST /api/telemetry/ingest
{"station_id": 1, "measured_at": "2026-10-28T08:00:00+00:00", "event_id": "dev-0001",
 "readings": [{"parameter":"water_level_cm","value":231.5,"unit":"cm"},
              {"parameter":"water_level_rate_cm_h","value":12.0},
              {"parameter":"rainfall_mm_h","value":9.2},
              {"parameter":"soil_moisture_pct","value":64},
              {"parameter":"air_temperature_c","value":11.3}]}
→ {"station_id":1,"accepted":5,"duplicate":false,"risk_level":"medium","score":48.2,"alert_id":12,"alert_action":"created"}
```
Отклоняются: NaN/Infinity, значения вне правдоподобных диапазонов, неверная единица, неизвестный параметр, параметр не поддерживаемый станцией, `measured_at` без таймзоны / из будущего (> 5 мин) / старше 30 дней, станция не `online`. Повтор `event_id` → `duplicate: true`, `accepted: 0`.

### Предупреждения
| | Роль |
|---|---|
| `GET /alerts?station_id&severity&status&search&from&to&sort&order&page&page_size` | observer+ |
| `GET /alerts/counts` | observer+ |
| `GET /alerts/{id}` | observer+ |
| `POST /alerts/{id}/acknowledge` (идемпотентно) | operator+ |
| `POST /alerts/{id}/resolve` `{note}` (идемпотентно) | operator+ |

### Симулятор
| | Роль |
|---|---|
| `GET /simulator/status` | публичный (используется внешним раннером) |
| `GET /simulator/preview?scenario&intensity&seed&minutes` | observer+ |
| `POST /simulator/start` `{scenario?, intensity?, interval_seconds?, time_acceleration?, seed?}` | operator+ |
| `POST /simulator/pause` / `stop` / `reset` | operator+ |
| `POST /simulator/scenario` `{scenario, station_ids?, intensity?, ...}` | operator+ |
| `POST /simulator/heartbeat`, `POST /simulator/advance` | `X-Ingest-Key` (внешний раннер) |

### Администрирование
| | Роль |
|---|---|
| `GET /admin/users`, `POST /admin/users`, `PATCH /admin/users/{id}` | admin |
| `GET /admin/settings`, `PATCH /admin/settings` | admin |
| `GET /admin/health` | admin |
| `GET /audit-log?action&entity_type&actor&from&to&page&page_size` | admin |

```json
PATCH /api/admin/settings
{"risk":{"weights":{"level":0.4,"rise_rate":0.3,"rainfall":0.15,"soil":0.05,"trend":0.1},
         "thresholds":{"medium":30,"high":60},"stale_after_seconds":600},
 "alerts":{"suppression_minutes":15,"alert_on_medium":true},
 "ui_refresh_seconds":10}
```
Проверки: веса конечные и неотрицательные (хотя бы один > 0), `0 < medium < high ≤ 100`, интервалы в разумных пределах. Новые настройки применяются при следующей оценке риска.

## Ограничения запросов
- Тело запроса ≤ `MAX_REQUEST_BYTES` (256 КБ) → `413`.
- Тайм-аут обработки 60 с → `504`.
- Страницы ≤ 200 строк, временные диапазоны ≤ 30 дней, серии ≤ 5000 точек.
- CORS: только origin'ы из `CORS_ORIGINS`.
