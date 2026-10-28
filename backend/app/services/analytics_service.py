from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.timeutil import utcnow
from app.models import Alert, RiskAssessment, Station, Telemetry, User
from app.services import settings_service, station_service
from app.services.risk_engine import PARAMETER_UNITS

LEVEL_ORDER = {"high": 3, "medium": 2, "low": 1, "insufficient_data": 0, "stale": 0}


def _bucket_for(span: timedelta) -> int:
    secs = span.total_seconds()
    if secs <= 3600:
        return 60
    if secs <= 6 * 3600:
        return 300
    if secs <= 24 * 3600:
        return 900
    return 3600


def period_stats(db: Session, ids: List[int], from_time: datetime, to_time: datetime) -> Dict[str, Any]:
    """Compact aggregate for a period, used for period-over-period comparison."""
    if not ids:
        return {"from_time": from_time, "to_time": to_time, "alerts_total": 0, "alerts_high": 0, "max_score": None, "avg_score": None, "telemetry_count": 0}
    alerts_total = db.query(func.count(Alert.id)).filter(Alert.station_id.in_(ids), Alert.created_at >= from_time, Alert.created_at <= to_time).scalar() or 0
    alerts_high = db.query(func.count(Alert.id)).filter(Alert.station_id.in_(ids), Alert.severity == "high", Alert.created_at >= from_time, Alert.created_at <= to_time).scalar() or 0
    mx, av = db.query(func.max(RiskAssessment.score), func.avg(RiskAssessment.score)).filter(
        RiskAssessment.station_id.in_(ids), RiskAssessment.assessed_at >= from_time, RiskAssessment.assessed_at <= to_time, RiskAssessment.score.isnot(None)).one()
    tele = db.query(func.count(Telemetry.id)).filter(Telemetry.station_id.in_(ids), Telemetry.measured_at >= from_time, Telemetry.measured_at <= to_time).scalar() or 0
    return {"from_time": from_time, "to_time": to_time, "alerts_total": int(alerts_total), "alerts_high": int(alerts_high),
            "max_score": None if mx is None else round(float(mx), 1), "avg_score": None if av is None else round(float(av), 1), "telemetry_count": int(tele)}


def overview(db: Session, from_time: datetime, to_time: datetime, station_id: Optional[int], scenario: Optional[str], compare: bool = False) -> Dict[str, Any]:
    span = to_time - from_time
    bucket = _bucket_for(span)
    station_q = db.query(Station).filter(Station.is_deleted.is_(False))
    if station_id:
        station_q = station_q.filter(Station.id == station_id)
    if scenario:
        station_q = station_q.filter(Station.scenario == scenario.upper())
    stations = station_q.order_by(Station.name).all()
    ids = [s.id for s in stations]
    names = {s.id: s.name for s in stations}
    if not ids:
        return {"from_time": from_time, "to_time": to_time, "bucket_seconds": bucket, "stations": [], "alerts_by_severity": {},
                "alerts_by_status": {}, "risk_timeline": [], "telemetry_series": {}, "top_stations": [], "incident_history": [],
                "telemetry_count": 0, "current_period": None, "previous_period": None}

    # alerts by severity / status
    sev = dict(db.query(Alert.severity, func.count(Alert.id)).filter(Alert.station_id.in_(ids), Alert.created_at >= from_time, Alert.created_at <= to_time).group_by(Alert.severity).all())
    stat = dict(db.query(Alert.status, func.count(Alert.id)).filter(Alert.station_id.in_(ids), Alert.created_at >= from_time, Alert.created_at <= to_time).group_by(Alert.status).all())

    # risk timeline: per bucket, per station avg score
    rows = (
        db.query(RiskAssessment.station_id, RiskAssessment.assessed_at, RiskAssessment.score, RiskAssessment.risk_level)
        .filter(RiskAssessment.station_id.in_(ids), RiskAssessment.assessed_at >= from_time, RiskAssessment.assessed_at <= to_time)
        .order_by(RiskAssessment.assessed_at.asc())
        .all()
    )
    tl: Dict[int, Dict[int, List[float]]] = {}
    for sid, at, score, lvl in rows:
        if score is None:
            continue
        k = int((at - from_time).total_seconds() // bucket)
        tl.setdefault(k, {}).setdefault(sid, []).append(score)
    risk_timeline = []
    for k in sorted(tl):
        point: Dict[str, Any] = {"t": from_time + timedelta(seconds=k * bucket)}
        for sid, vals in tl[k].items():
            point[f"s{sid}"] = round(sum(vals) / len(vals), 1)
        risk_timeline.append(point)

    # telemetry series (bucketed averages across selected stations per parameter)
    series: Dict[str, List[Dict[str, Any]]] = {}
    tele_count = 0
    trows = (
        db.query(Telemetry.parameter, Telemetry.measured_at, Telemetry.value, Telemetry.station_id)
        .filter(Telemetry.station_id.in_(ids), Telemetry.measured_at >= from_time, Telemetry.measured_at <= to_time)
        .yield_per(5000)
    )
    acc: Dict[str, Dict[int, Dict[int, List[float]]]] = {}
    for param, at, val, sid in trows:
        tele_count += 1
        k = int((at - from_time).total_seconds() // bucket)
        acc.setdefault(param, {}).setdefault(k, {}).setdefault(sid, []).append(val)
    for param, buckets in acc.items():
        pts = []
        for k in sorted(buckets):
            point: Dict[str, Any] = {"t": from_time + timedelta(seconds=k * bucket)}
            for sid, vals in buckets[k].items():
                point[f"s{sid}"] = round(sum(vals) / len(vals), 2)
            pts.append(point)
        series[param] = pts

    # top stations by max score in range
    top_rows = (
        db.query(RiskAssessment.station_id, func.max(RiskAssessment.score), func.avg(RiskAssessment.score))
        .filter(RiskAssessment.station_id.in_(ids), RiskAssessment.assessed_at >= from_time, RiskAssessment.assessed_at <= to_time, RiskAssessment.score.isnot(None))
        .group_by(RiskAssessment.station_id)
        .all()
    )
    top = sorted(
        [{"station_id": sid, "name": names.get(sid), "max_score": round(mx or 0, 1), "avg_score": round(av or 0, 1)} for sid, mx, av in top_rows],
        key=lambda r: -r["max_score"],
    )[:10]

    incidents = (
        db.query(Alert)
        .filter(Alert.station_id.in_(ids), Alert.created_at >= from_time, Alert.created_at <= to_time)
        .order_by(Alert.created_at.desc())
        .limit(50)
        .all()
    )
    users = {u.id: u.username for u in db.query(User).all()}
    incident_history = [
        {"id": a.id, "station_id": a.station_id, "station_name": names.get(a.station_id), "severity": a.severity, "status": a.status,
         "title": a.title, "created_at": a.created_at, "acknowledged_at": a.acknowledged_at, "resolved_at": a.resolved_at,
         "resolved_by_name": users.get(a.resolved_by), "escalation_count": a.escalation_count,
         "duration_minutes": None if not a.resolved_at else round((a.resolved_at - a.created_at).total_seconds() / 60, 1)}
        for a in incidents
    ]
    return {
        "from_time": from_time,
        "to_time": to_time,
        "bucket_seconds": bucket,
        "stations": [{"id": s.id, "name": s.name, "code": s.code, "scenario": s.scenario} for s in stations],
        "alerts_by_severity": {k: int(v) for k, v in sev.items()},
        "alerts_by_status": {k: int(v) for k, v in stat.items()},
        "risk_timeline": risk_timeline,
        "telemetry_series": series,
        "units": PARAMETER_UNITS,
        "top_stations": top,
        "incident_history": incident_history,
        "telemetry_count": tele_count,
        "current_period": period_stats(db, ids, from_time, to_time) if compare else None,
        "previous_period": period_stats(db, ids, from_time - span, from_time) if compare else None,
    }


def dashboard_summary(db: Session) -> Dict[str, Any]:
    now = utcnow()
    risk_cfg = settings_service.get_risk_settings(db)
    stale = float(risk_cfg.get("stale_after_seconds", 900))
    stations = db.query(Station).filter(Station.is_deleted.is_(False)).order_by(Station.name).all()
    serialized = [station_service.serialize(db, s, stale) for s in stations]
    active = [s for s in serialized if s["status"] == "online"]
    with_alerts = [s for s in serialized if s["active_alerts"] > 0]
    open_incidents = db.query(func.count(Alert.id)).filter(Alert.status.in_(["new", "acknowledged"])).scalar() or 0
    last_tel = db.query(func.max(Telemetry.received_at)).scalar()
    last_update = max([t for t in [last_tel] if t] + [s["risk"]["assessed_at"] for s in serialized if s["risk"] and s["risk"]["assessed_at"]], default=None)

    # water-level series last 60 min per station
    from_time = now - timedelta(minutes=60)
    rows = (
        db.query(Telemetry.station_id, Telemetry.parameter, Telemetry.measured_at, Telemetry.value)
        .filter(Telemetry.measured_at >= from_time, Telemetry.station_id.in_([s.id for s in stations]),
                Telemetry.parameter.in_(["water_level_cm", "rainfall_mm_h", "water_level_rate_cm_h"]))
        .order_by(Telemetry.measured_at.asc())
        .all()
    )
    bucket = 60
    acc: Dict[str, Dict[int, Dict[int, List[float]]]] = {}
    for sid, param, at, val in rows:
        k = int((at - from_time).total_seconds() // bucket)
        acc.setdefault(param, {}).setdefault(k, {}).setdefault(sid, []).append(val)
    series: Dict[str, List[Dict[str, Any]]] = {}
    for param, buckets in acc.items():
        pts = []
        for k in sorted(buckets):
            p: Dict[str, Any] = {"t": from_time + timedelta(seconds=k * bucket)}
            for sid, vals in buckets[k].items():
                p[f"s{sid}"] = round(sum(vals) / len(vals), 2)
            pts.append(p)
        series[param] = pts

    recent_alerts = db.query(Alert).order_by(Alert.created_at.desc()).limit(8).all()
    users = {u.id: u.username for u in db.query(User).all()}
    names = {s.id: s.name for s in stations}
    top_risk = sorted(
        [s for s in serialized if s["risk"] and s["risk"]["score"] is not None],
        key=lambda s: -(s["risk"]["score"] or 0),
    )[:5]
    focus = None
    if top_risk:
        top_station = top_risk[0]
        ra = station_service.latest_risk(db, top_station["id"])
        if ra:
            focus = {"station_id": top_station["id"], "station_name": top_station["name"], "risk_level": ra.risk_level, "score": ra.score,
                     "explanation": ra.explanation, "contributing_factors": ra.contributing_factors, "data_quality": ra.data_quality,
                     "assessed_at": ra.assessed_at, "algorithm_version": ra.algorithm_version}
    from app.simulator.engine import driver_alive, get_state

    sim = get_state(db)
    freshness = {"fresh": 0, "aging": 0, "stale": 0, "none": 0}
    for s in serialized:
        if s["status"] != "online":
            continue
        wl = next((v for v in s["latest"] if v["parameter"] == "water_level_cm"), None)
        freshness[wl["freshness"] if wl else "none"] += 1
    return {
        "generated_at": now,
        "system_status": "ok",
        "synthetic_data": True,
        "last_update_at": last_update,
        "counts": {
            "stations_total": len(serialized),
            "stations_active": len(active),
            "stations_with_alerts": len(with_alerts),
            "open_incidents": int(open_incidents),
            "stations_offline": len([s for s in serialized if s["connection"] in ("disconnected",) and s["status"] == "online"]),
            "risk_high": len([s for s in serialized if s["risk"] and s["risk"]["risk_level"] == "high"]),
            "risk_medium": len([s for s in serialized if s["risk"] and s["risk"]["risk_level"] == "medium"]),
            "risk_low": len([s for s in serialized if s["risk"] and s["risk"]["risk_level"] == "low"]),
            "risk_unknown": len([s for s in serialized if not s["risk"] or s["risk"]["risk_level"] not in ("low", "medium", "high")]),
        },
        "stations": serialized,
        "series": series,
        "series_from": from_time,
        "recent_alerts": [
            {"id": a.id, "station_id": a.station_id, "station_name": names.get(a.station_id), "severity": a.severity, "status": a.status,
             "title": a.title, "created_at": a.created_at, "acknowledged_by_name": users.get(a.acknowledged_by)}
            for a in recent_alerts
        ],
        "top_risk": [{"station_id": s["id"], "name": s["name"], "code": s["code"], "risk_level": s["risk"]["risk_level"], "score": s["risk"]["score"],
                      "connection": s["connection"]} for s in top_risk],
        "focus": focus,
        "freshness": freshness,
        "stale_after_seconds": stale,
        "simulator": {"state": sim.state, "scenario": sim.scenario, "driver": sim.driver, "driver_alive": driver_alive(sim),
                      "last_event_at": sim.last_event_at, "sent_count": sim.sent_count, "interval_seconds": sim.interval_seconds},
        "risk_thresholds": risk_cfg["thresholds"],
    }


def system_health(db: Session) -> Dict[str, Any]:
    from app.core.config import APP_VERSION, get_settings
    from app.simulator.engine import driver_alive, get_state

    s = get_settings()
    db_ok = True
    try:
        db.execute(func.now() if not s.database_url.startswith("sqlite") else func.count(Station.id))
        db.query(Station.id).limit(1).all()
    except Exception:  # noqa: BLE001
        db_ok = False
    sim = get_state(db)
    stale = float(settings_service.get_risk_settings(db).get("stale_after_seconds", 900))
    stations = db.query(Station).filter(Station.is_deleted.is_(False)).all()
    sources = []
    for st in stations:
        conn, latency = station_service.connection_state(st, stale)
        sources.append({"station_id": st.id, "code": st.code, "name": st.name, "status": st.status, "connection": conn,
                        "latency_seconds": latency, "last_seen_at": st.last_seen_at, "error_count": st.error_count,
                        "last_error_at": st.last_error_at, "source_type": st.source_type})
    return {
        "api": {"status": "ok", "version": APP_VERSION, "env": s.app_env, "time": utcnow()},
        "database": {"status": "ok" if db_ok else "error", "driver": s.database_url.split(":")[0],
                     "telemetry_rows": db.query(func.count(Telemetry.id)).scalar() or 0,
                     "alerts": db.query(func.count(Alert.id)).scalar() or 0},
        "simulator": {"mode": s.simulator_mode, "state": sim.state, "driver": sim.driver, "driver_alive": driver_alive(sim),
                      "last_event_at": sim.last_event_at, "error_count": sim.error_count, "last_error": sim.last_error},
        "sources": sources,
    }
