"""Explainable heuristic flood-risk engine.

DISCLAIMER: this is a demonstration heuristic index (0-100), NOT a validated
flood probability or forecast. It must not be used for real emergency response.

Score = 100 * Σ(w_i * c_i) / Σ(w_i) over the *available* components, where
c_i ∈ [0, 1] are normalised components:
    normalized_level           — water level between baseline and critical level
    normalized_rise_rate       — positive rise rate vs critical rise rate (cm/h)
    normalized_rainfall        — rainfall intensity vs critical rainfall (mm/h)
    normalized_soil_saturation — soil moisture between dry and saturated bounds
    trend_component            — consistency/acceleration of a rising trend
Weights and category thresholds are configurable (system settings), station
thresholds (baseline/warning/critical) come from station configuration.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

ALGORITHM_VERSION = "1.2.0"

PARAM_WATER_LEVEL = "water_level_cm"
PARAM_RISE_RATE = "water_level_rate_cm_h"
PARAM_RAINFALL = "rainfall_mm_h"
PARAM_SOIL = "soil_moisture_pct"
PARAM_TEMP = "air_temperature_c"

PARAMETER_UNITS: Dict[str, str] = {
    PARAM_WATER_LEVEL: "cm",
    PARAM_RISE_RATE: "cm/h",
    PARAM_RAINFALL: "mm/h",
    PARAM_SOIL: "%",
    PARAM_TEMP: "°C",
}

# Physically plausible ranges used by ingest validation.
PARAMETER_RANGES: Dict[str, Tuple[float, float]] = {
    PARAM_WATER_LEVEL: (-500.0, 5000.0),
    PARAM_RISE_RATE: (-500.0, 500.0),
    PARAM_RAINFALL: (0.0, 500.0),
    PARAM_SOIL: (0.0, 100.0),
    PARAM_TEMP: (-70.0, 70.0),
}

LEVEL_LOW = "low"
LEVEL_MEDIUM = "medium"
LEVEL_HIGH = "high"
LEVEL_INSUFFICIENT = "insufficient_data"
LEVEL_STALE = "stale"

DEFAULT_RISK_SETTINGS: Dict[str, Any] = {
    "weights": {
        "level": 0.35,
        "rise_rate": 0.25,
        "rainfall": 0.20,
        "soil": 0.10,
        "trend": 0.10,
    },
    "thresholds": {"medium": 35.0, "high": 65.0},
    "stale_after_seconds": 900,
    "soil_stale_after_seconds": 3600,
    "trend_window_points": 8,
    "trend_min_points": 3,
    "forecast_horizons_hours": [1, 3],
}

DEFAULT_STATION_THRESHOLDS: Dict[str, float] = {
    "baseline_level_cm": 120.0,
    "warning_level_cm": 220.0,
    "critical_level_cm": 300.0,
    "critical_rise_rate_cm_h": 30.0,
    "critical_rainfall_mm_h": 15.0,
    "soil_dry_pct": 20.0,
    "soil_saturated_pct": 85.0,
}


@dataclass
class Reading:
    parameter: str
    value: float
    measured_at: datetime


@dataclass
class Factor:
    key: str
    label_ru: str
    label_kk: str
    value: Optional[float]
    unit: str
    normalized: Optional[float]
    weight: float
    contribution: float  # weighted contribution to score (0..100 scale)
    note_ru: str = ""
    note_kk: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "label": {"ru": self.label_ru, "kk": self.label_kk},
            "value": self.value,
            "unit": self.unit,
            "normalized": None if self.normalized is None else round(self.normalized, 4),
            "weight": self.weight,
            "contribution": round(self.contribution, 2),
            "note": {"ru": self.note_ru, "kk": self.note_kk},
        }


@dataclass
class Forecast:
    horizon_hours: float
    projected_level_cm: float
    lower_cm: float
    upper_cm: float
    method: str = "linear_trend_extrapolation"
    assumption_ru: str = "Линейная экстраполяция текущего тренда; допускает сохранение текущей скорости изменения."
    assumption_kk: str = "Ағымдағы үрдістің сызықтық экстраполяциясы; өзгеру жылдамдығы сақталады деп болжанады."

    def to_dict(self) -> Dict[str, Any]:
        return {
            "horizon_hours": self.horizon_hours,
            "projected_level_cm": round(self.projected_level_cm, 1),
            "lower_cm": round(self.lower_cm, 1),
            "upper_cm": round(self.upper_cm, 1),
            "method": self.method,
            "assumption": {"ru": self.assumption_ru, "kk": self.assumption_kk},
        }


@dataclass
class RiskResult:
    level: str
    score: Optional[float]
    factors: List[Factor]
    data_quality: Dict[str, Any]
    explanation_ru: str
    explanation_kk: str
    trend: Dict[str, Any] = field(default_factory=dict)
    forecasts: List[Forecast] = field(default_factory=list)
    algorithm_version: str = ALGORITHM_VERSION

    @property
    def is_actionable(self) -> bool:
        return self.level in (LEVEL_LOW, LEVEL_MEDIUM, LEVEL_HIGH)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "risk_level": self.level,
            "score": None if self.score is None else round(self.score, 1),
            "contributing_factors": [f.to_dict() for f in self.factors],
            "data_quality": self.data_quality,
            "explanation": {"ru": self.explanation_ru, "kk": self.explanation_kk},
            "trend": self.trend,
            "forecasts": [f.to_dict() for f in self.forecasts],
            "algorithm_version": self.algorithm_version,
            "disclaimer": {
                "ru": "Демонстрационная эвристическая оценка, не валидированный прогноз. Не предназначена для реального экстренного реагирования.",
                "kk": "Демонстрациялық эвристикалық бағалау, тексерілген болжам емес. Нақты төтенше жағдайларға әрекет ету үшін арналмаған.",
            },
        }


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------

def _finite(v: Any) -> bool:
    try:
        return v is not None and math.isfinite(float(v))
    except (TypeError, ValueError):
        return False


def clamp01(x: float) -> float:
    if not math.isfinite(x):
        return 0.0
    return max(0.0, min(1.0, x))


def safe_ratio(numerator: float, denominator: float) -> float:
    """numerator / denominator clamped to [0,1]; 0 when denominator is not positive."""
    if not _finite(numerator) or not _finite(denominator) or denominator <= 0:
        return 0.0
    return clamp01(numerator / denominator)


def merge_settings(overrides: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    merged: Dict[str, Any] = {
        "weights": dict(DEFAULT_RISK_SETTINGS["weights"]),
        "thresholds": dict(DEFAULT_RISK_SETTINGS["thresholds"]),
        "stale_after_seconds": DEFAULT_RISK_SETTINGS["stale_after_seconds"],
        "soil_stale_after_seconds": DEFAULT_RISK_SETTINGS["soil_stale_after_seconds"],
        "trend_window_points": DEFAULT_RISK_SETTINGS["trend_window_points"],
        "trend_min_points": DEFAULT_RISK_SETTINGS["trend_min_points"],
        "forecast_horizons_hours": list(DEFAULT_RISK_SETTINGS["forecast_horizons_hours"]),
    }
    if overrides:
        for k, v in overrides.items():
            if k in ("weights", "thresholds") and isinstance(v, dict):
                merged[k].update({kk: float(vv) for kk, vv in v.items() if _finite(vv)})
            elif k in merged and v is not None:
                merged[k] = v
    return merged


def merge_station_thresholds(config: Optional[Dict[str, Any]]) -> Dict[str, float]:
    t = dict(DEFAULT_STATION_THRESHOLDS)
    if config:
        src = config.get("thresholds", config) if isinstance(config, dict) else {}
        for k in t:
            if k in src and _finite(src[k]):
                t[k] = float(src[k])
    return t


def validate_risk_settings(settings: Dict[str, Any]) -> List[str]:
    """Return a list of problems (empty when valid)."""
    problems: List[str] = []
    weights = settings.get("weights", {})
    if not isinstance(weights, dict) or not weights:
        problems.append("weights must be a non-empty object")
    else:
        for k in DEFAULT_RISK_SETTINGS["weights"]:
            v = weights.get(k)
            if not _finite(v) or float(v) < 0:
                problems.append(f"weight '{k}' must be a finite non-negative number")
        if all(_finite(weights.get(k)) for k in DEFAULT_RISK_SETTINGS["weights"]) and sum(float(weights[k]) for k in DEFAULT_RISK_SETTINGS["weights"]) <= 0:
            problems.append("at least one weight must be positive")
    th = settings.get("thresholds", {})
    if not isinstance(th, dict) or not _finite(th.get("medium")) or not _finite(th.get("high")):
        problems.append("thresholds.medium and thresholds.high must be finite numbers")
    else:
        m, h = float(th["medium"]), float(th["high"])
        if not (0 < m < h <= 100):
            problems.append("thresholds must satisfy 0 < medium < high <= 100")
    for key, lo, hi in (("stale_after_seconds", 30, 86400 * 7), ("soil_stale_after_seconds", 60, 86400 * 30)):
        v = settings.get(key)
        if v is not None and (not _finite(v) or not (lo <= float(v) <= hi)):
            problems.append(f"{key} must be between {lo} and {hi}")
    for key, lo, hi in (("trend_window_points", 3, 500), ("trend_min_points", 2, 100)):
        v = settings.get(key)
        if v is not None and (not isinstance(v, int) or not (lo <= v <= hi)):
            problems.append(f"{key} must be an integer between {lo} and {hi}")
    return problems


def validate_station_thresholds(t: Dict[str, Any]) -> List[str]:
    problems: List[str] = []
    for k in DEFAULT_STATION_THRESHOLDS:
        if k in t and not _finite(t[k]):
            problems.append(f"{k} must be a finite number")
    m = merge_station_thresholds({"thresholds": t})
    if not (m["baseline_level_cm"] < m["warning_level_cm"] < m["critical_level_cm"]):
        problems.append("baseline_level_cm < warning_level_cm < critical_level_cm is required")
    if m["critical_rise_rate_cm_h"] <= 0 or m["critical_rainfall_mm_h"] <= 0:
        problems.append("critical_rise_rate_cm_h and critical_rainfall_mm_h must be positive")
    if not (0 <= m["soil_dry_pct"] < m["soil_saturated_pct"] <= 100):
        problems.append("0 <= soil_dry_pct < soil_saturated_pct <= 100 is required")
    return problems


def classify(score: Optional[float], thresholds: Dict[str, float]) -> str:
    if score is None or not math.isfinite(score):
        return LEVEL_INSUFFICIENT
    if score >= float(thresholds.get("high", 65)):
        return LEVEL_HIGH
    if score >= float(thresholds.get("medium", 35)):
        return LEVEL_MEDIUM
    return LEVEL_LOW


def linear_fit(points: Sequence[Tuple[float, float]]) -> Tuple[float, float, float]:
    """Least-squares fit y = a + b*x. Returns (a, b, residual_std)."""
    n = len(points)
    if n < 2:
        return (points[0][1] if n else 0.0, 0.0, 0.0)
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx <= 0:
        return (my, 0.0, 0.0)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    a = my - b * mx
    resid = [y - (a + b * x) for x, y in zip(xs, ys)]
    std = math.sqrt(sum(r * r for r in resid) / max(1, n - 2)) if n > 2 else 0.0
    return (a, b, std)


def analyse_trend(series: Sequence[Reading], window: int, min_points: int) -> Dict[str, Any]:
    """Analyse the last `window` water-level readings (chronological order)."""
    pts = [r for r in series if _finite(r.value)][-window:]
    if len(pts) < min_points:
        return {"available": False, "points": len(pts), "direction": "unknown", "slope_cm_h": None,
                "consistency": None, "accelerating": False, "component": None, "residual_std_cm": None}
    t0 = pts[0].measured_at
    span_sec = (pts[-1].measured_at - t0).total_seconds()
    if span_sec < 5.0:  # degenerate time span -> slope would explode
        return {"available": False, "points": len(pts), "direction": "unknown", "slope_cm_h": None,
                "consistency": None, "accelerating": False, "component": None, "residual_std_cm": None}
    xy = [((r.measured_at - t0).total_seconds() / 3600.0, r.value) for r in pts]
    _, slope, resid_std = linear_fit(xy)
    slope = max(-500.0, min(500.0, slope))
    diffs = [pts[i + 1].value - pts[i].value for i in range(len(pts) - 1)]
    rising = sum(1 for d in diffs if d > 0)
    falling = sum(1 for d in diffs if d < 0)
    consistency = rising / len(diffs) if diffs else 0.0
    half = len(xy) // 2
    accelerating = False
    if half >= 2 and len(xy) - half >= 2:
        _, s1, _ = linear_fit(xy[:half])
        _, s2, _ = linear_fit(xy[half:])
        accelerating = s2 > s1 * 1.15 and s2 > 0
    if slope > 0.5:
        direction = "rising"
    elif slope < -0.5:
        direction = "falling"
    else:
        direction = "stable"
    # Trend component: how consistently it rises; accelerating adds a bonus.
    component = 0.0
    if direction == "rising":
        component = clamp01(consistency * (1.25 if accelerating else 1.0))
    elif direction == "stable" and consistency > 0.75 and slope > 0:
        component = clamp01(0.35 * consistency)
    return {
        "available": True,
        "points": len(pts),
        "direction": direction,
        "slope_cm_h": round(slope, 2),
        "consistency": round(consistency, 3),
        "rising_steps": rising,
        "falling_steps": falling,
        "accelerating": accelerating,
        "component": component,
        "residual_std_cm": round(resid_std, 2),
    }


# ----------------------------------------------------------------------------
# main entry point
# ----------------------------------------------------------------------------

def assess_risk(
    *,
    latest: Dict[str, Reading],
    water_level_series: Sequence[Reading],
    station_config: Optional[Dict[str, Any]],
    risk_settings: Optional[Dict[str, Any]],
    now: datetime,
) -> RiskResult:
    """Compute the explainable risk index for one station.

    `latest` maps parameter name -> most recent reading.
    `water_level_series` is chronological (oldest first).
    """
    cfg = merge_settings(risk_settings)
    th = merge_station_thresholds(station_config)
    weights = cfg["weights"]
    stale_after = float(cfg["stale_after_seconds"])
    soil_stale_after = float(cfg["soil_stale_after_seconds"])

    level_r = latest.get(PARAM_WATER_LEVEL)
    missing = [p for p in (PARAM_WATER_LEVEL, PARAM_RISE_RATE, PARAM_RAINFALL, PARAM_SOIL) if p not in latest]

    if level_r is None or not _finite(level_r.value):
        dq = {"status": "insufficient", "missing_parameters": missing, "freshness_seconds": None, "stale_after_seconds": stale_after}
        return RiskResult(
            level=LEVEL_INSUFFICIENT, score=None, factors=[], data_quality=dq,
            explanation_ru="Недостаточно данных: отсутствует измерение уровня воды, расчёт риска не выполнен.",
            explanation_kk="Деректер жеткіліксіз: су деңгейі өлшемі жоқ, тәуекел есептелмеді.",
        )

    freshness = (now - level_r.measured_at).total_seconds()
    if freshness > stale_after:
        dq = {"status": "stale", "missing_parameters": missing, "freshness_seconds": round(freshness), "stale_after_seconds": stale_after}
        mins = int(freshness // 60)
        return RiskResult(
            level=LEVEL_STALE, score=None, factors=[], data_quality=dq,
            explanation_ru=f"Данные устарели: последнее измерение уровня воды получено {mins} мин назад (порог {int(stale_after // 60)} мин). Оценка риска приостановлена.",
            explanation_kk=f"Деректер ескірген: су деңгейінің соңғы өлшемі {mins} мин бұрын алынды (шек {int(stale_after // 60)} мин). Тәуекелді бағалау тоқтатылды.",
        )

    # --- components ---------------------------------------------------------
    factors: List[Factor] = []
    level = float(level_r.value)
    span = th["critical_level_cm"] - th["baseline_level_cm"]
    n_level = safe_ratio(level - th["baseline_level_cm"], span)
    near_critical = level >= th["warning_level_cm"]
    above_critical = level >= th["critical_level_cm"]

    # rise rate: prefer reported parameter if fresh, else derive from series
    rate_r = latest.get(PARAM_RISE_RATE)
    rate_val: Optional[float] = None
    rate_src = "reported"
    if rate_r is not None and _finite(rate_r.value) and (now - rate_r.measured_at).total_seconds() <= stale_after:
        rate_val = float(rate_r.value)
    else:
        recent = [r for r in water_level_series if (now - r.measured_at).total_seconds() <= max(stale_after, 3600)]
        if len(recent) >= 2 and (recent[-1].measured_at - recent[0].measured_at).total_seconds() >= 5.0:
            xy = [((r.measured_at - recent[0].measured_at).total_seconds() / 3600.0, r.value) for r in recent]
            _, slope, _ = linear_fit(xy)
            rate_val = max(-500.0, min(500.0, slope))
            rate_src = "derived"
    n_rate = safe_ratio(rate_val, th["critical_rise_rate_cm_h"]) if rate_val is not None and rate_val > 0 else (0.0 if rate_val is not None else None)

    rain_r = latest.get(PARAM_RAINFALL)
    rain_val = float(rain_r.value) if rain_r is not None and _finite(rain_r.value) and (now - rain_r.measured_at).total_seconds() <= stale_after else None
    n_rain = safe_ratio(rain_val, th["critical_rainfall_mm_h"]) if rain_val is not None else None

    soil_r = latest.get(PARAM_SOIL)
    soil_val = float(soil_r.value) if soil_r is not None and _finite(soil_r.value) and (now - soil_r.measured_at).total_seconds() <= soil_stale_after else None
    n_soil = safe_ratio(soil_val - th["soil_dry_pct"], th["soil_saturated_pct"] - th["soil_dry_pct"]) if soil_val is not None else None

    trend = analyse_trend(water_level_series, int(cfg["trend_window_points"]), int(cfg["trend_min_points"]))
    n_trend = trend["component"] if trend["available"] else None

    components = [
        ("level", n_level, level, "cm", "Уровень воды", "Су деңгейі"),
        ("rise_rate", n_rate, rate_val, "cm/h", "Скорость подъёма", "Көтерілу жылдамдығы"),
        ("rainfall", n_rain, rain_val, "mm/h", "Осадки", "Жауын-шашын"),
        ("soil", n_soil, soil_val, "%", "Влажность почвы", "Топырақ ылғалдылығы"),
        ("trend", n_trend, trend.get("slope_cm_h"), "cm/h", "Тренд уровня", "Деңгей үрдісі"),
    ]
    total_w = 0.0
    acc = 0.0
    for key, norm, val, unit, lru, lkk in components:
        w = float(weights.get(key, 0.0))
        if norm is None:
            factors.append(Factor(key, lru, lkk, val, unit, None, w, 0.0, "нет свежих данных — компонент исключён", "жаңа деректер жоқ — компонент алынып тасталды"))
            continue
        total_w += w
        acc += w * norm
        factors.append(Factor(key, lru, lkk, None if val is None else round(val, 2), unit, norm, w, 0.0))

    score = 100.0 * acc / total_w if total_w > 0 else 0.0
    score = max(0.0, min(100.0, score))
    for f in factors:
        if f.normalized is not None and total_w > 0:
            f.contribution = 100.0 * f.weight * f.normalized / total_w

    # notes
    for f in factors:
        if f.key == "level":
            if above_critical:
                f.note_ru, f.note_kk = f"выше критического порога {th['critical_level_cm']:.0f} cm", f"сыни шектен жоғары {th['critical_level_cm']:.0f} см"
            elif near_critical:
                f.note_ru, f.note_kk = f"выше уровня предупреждения {th['warning_level_cm']:.0f} cm, критический {th['critical_level_cm']:.0f} cm", f"ескерту деңгейінен жоғары {th['warning_level_cm']:.0f} см, сыни {th['critical_level_cm']:.0f} см"
            else:
                f.note_ru, f.note_kk = f"ниже уровня предупреждения {th['warning_level_cm']:.0f} cm", f"ескерту деңгейінен төмен {th['warning_level_cm']:.0f} см"
        elif f.key == "rise_rate" and f.normalized is not None:
            f.note_ru = "рассчитана по серии измерений" if rate_src == "derived" else "по данным станции"
            f.note_kk = "өлшемдер сериясы бойынша есептелді" if rate_src == "derived" else "станция деректері бойынша"
        elif f.key == "trend" and f.normalized is not None:
            d = trend["direction"]
            f.note_ru = {"rising": "устойчивый рост", "falling": "снижение", "stable": "стабильно"}[d] + (", ускорение" if trend["accelerating"] else "")
            f.note_kk = {"rising": "тұрақты өсу", "falling": "төмендеу", "stable": "тұрақты"}[d] + (", үдеу" if trend["accelerating"] else "")

    level_cat = classify(score, cfg["thresholds"])
    dq = {
        "status": "ok" if not missing else "partial",
        "missing_parameters": missing,
        "freshness_seconds": round(freshness),
        "stale_after_seconds": stale_after,
        "components_used": [f.key for f in factors if f.normalized is not None],
    }

    expl_ru, expl_kk = _explain(level_cat, score, factors, trend, th, level, rate_val, rain_val, soil_val, above_critical, near_critical)
    forecasts = _forecast(trend, level, cfg.get("forecast_horizons_hours", [1, 3]), reported_rate=rate_val if rate_src == "reported" else None)
    return RiskResult(level_cat, score, factors, dq, expl_ru, expl_kk, trend, forecasts)


def _forecast(trend: Dict[str, Any], level: float, horizons: Sequence[float], reported_rate: Optional[float] = None) -> List[Forecast]:
    """Linear extrapolation of the water level.

    The slope is the station-reported rise rate when it is fresh (a sensor-side,
    smoothed derivative), otherwise the least-squares slope of the recent series.
    """
    if reported_rate is None and (not trend.get("available") or trend.get("slope_cm_h") is None):
        return []
    slope = float(reported_rate) if reported_rate is not None else float(trend["slope_cm_h"])
    resid = float(trend.get("residual_std_cm") or 0.0) if trend.get("available") else 3.0
    out = []
    for h in horizons:
        h = float(h)
        proj = level + slope * h
        # Uncertainty grows with horizon: residual noise plus 35% of the projected change.
        band = 2.0 * resid + 0.35 * abs(slope * h) + 2.0
        out.append(Forecast(h, proj, proj - band, proj + band))
    return out


def _fmt_signed(v: float) -> str:
    return f"{v:+.1f}"


def _explain(level_cat: str, score: float, factors: List[Factor], trend: Dict[str, Any], th: Dict[str, float],
             level: float, rate: Optional[float], rain: Optional[float], soil: Optional[float],
             above_critical: bool, near_critical: bool) -> Tuple[str, str]:
    cat_ru = {LEVEL_LOW: "низкий", LEVEL_MEDIUM: "средний", LEVEL_HIGH: "высокий"}[level_cat]
    cat_kk = {LEVEL_LOW: "төмен", LEVEL_MEDIUM: "орташа", LEVEL_HIGH: "жоғары"}[level_cat]
    top = sorted([f for f in factors if f.normalized is not None and f.contribution > 0], key=lambda f: -f.contribution)[:3]

    reasons_ru: List[str] = []
    reasons_kk: List[str] = []
    for f in top:
        if f.key == "level":
            if above_critical:
                reasons_ru.append(f"превышения критического порога {th['critical_level_cm']:.0f} cm (уровень воды {level:.0f} cm)")
                reasons_kk.append(f"сыни шектен {th['critical_level_cm']:.0f} см асуы (су деңгейі {level:.0f} см)")
            elif near_critical:
                reasons_ru.append(f"близости уровня воды ({level:.0f} cm) к критическому порогу {th['critical_level_cm']:.0f} cm")
                reasons_kk.append(f"су деңгейінің ({level:.0f} см) сыни шекке {th['critical_level_cm']:.0f} см жақындауы")
            elif f.normalized >= 0.25:
                reasons_ru.append(f"повышенного уровня воды ({level:.0f} cm при базовом {th['baseline_level_cm']:.0f} cm)")
                reasons_kk.append(f"су деңгейінің жоғарылауы ({level:.0f} см, базалық {th['baseline_level_cm']:.0f} см)")
        elif f.key == "rise_rate" and rate is not None and rate > 0 and f.normalized >= 0.2:
            adj_ru = "быстрого" if f.normalized >= 0.6 else "заметного"
            adj_kk = "жылдам" if f.normalized >= 0.6 else "байқалатын"
            reasons_ru.append(f"{adj_ru} роста уровня воды ({_fmt_signed(rate)} cm/h)")
            reasons_kk.append(f"су деңгейінің {adj_kk} өсуі ({_fmt_signed(rate)} см/сағ)")
        elif f.key == "rainfall" and rain is not None and f.normalized >= 0.2:
            adj_ru = "интенсивных" if f.normalized >= 0.6 else "умеренных"
            adj_kk = "қарқынды" if f.normalized >= 0.6 else "орташа"
            reasons_ru.append(f"{adj_ru} осадков ({rain:.1f} mm/h)")
            reasons_kk.append(f"{adj_kk} жауын-шашын ({rain:.1f} мм/сағ)")
        elif f.key == "soil" and soil is not None and f.normalized >= 0.5:
            reasons_ru.append(f"высокой влажности почвы ({soil:.0f} %)")
            reasons_kk.append(f"топырақтың жоғары ылғалдылығы ({soil:.0f} %)")
        elif f.key == "trend" and f.normalized >= 0.4:
            reasons_ru.append("устойчивого восходящего тренда уровня")
            reasons_kk.append("деңгейдің тұрақты өсу үрдісі")

    if level_cat == LEVEL_LOW:
        head_ru = f"Риск низкий (индекс {score:.0f}/100)."
        head_kk = f"Тәуекел төмен (индекс {score:.0f}/100)."
        if reasons_ru:
            head_ru += " Отмечены факторы: " + "; ".join(reasons_ru) + "."
            head_kk += " Байқалған факторлар: " + "; ".join(reasons_kk) + "."
        else:
            head_ru += " Уровень воды в пределах нормы, значимых факторов роста риска не выявлено."
            head_kk += " Су деңгейі қалыпты шекте, тәуекелді арттыратын маңызды факторлар анықталмады."
    else:
        head_ru = f"Риск {cat_ru} (индекс {score:.0f}/100)"
        head_kk = f"Тәуекел {cat_kk} (индекс {score:.0f}/100)"
        if reasons_ru:
            head_ru += " из-за " + "; ".join(reasons_ru) + "."
            head_kk += ": " + "; ".join(reasons_kk) + "."
        else:
            head_ru += "."
            head_kk += "."

    tail_ru = ""
    tail_kk = ""
    if trend.get("available"):
        d = trend["direction"]
        if d == "rising":
            tail_ru = " Последние измерения показывают " + ("ускорение подъёма." if trend["accelerating"] else "продолжающийся подъём.")
            tail_kk = " Соңғы өлшемдер " + ("көтерілудің үдеуін көрсетеді." if trend["accelerating"] else "көтерілудің жалғасуын көрсетеді.")
        elif d == "falling":
            tail_ru = " Последние измерения показывают снижение уровня."
            tail_kk = " Соңғы өлшемдер деңгейдің төмендеуін көрсетеді."
        else:
            tail_ru = " Тренд уровня за последние измерения стабильный."
            tail_kk = " Соңғы өлшемдер бойынша деңгей үрдісі тұрақты."
    return head_ru + tail_ru, head_kk + tail_kk
