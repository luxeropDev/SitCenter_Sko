import math
from datetime import timedelta

import pytest

from app.core.timeutil import utcnow
from app.services.risk_engine import (
    LEVEL_HIGH, LEVEL_INSUFFICIENT, LEVEL_LOW, LEVEL_MEDIUM, LEVEL_STALE, Reading, analyse_trend, assess_risk, classify,
    linear_fit, merge_settings, safe_ratio, validate_risk_settings, validate_station_thresholds,
)

CFG = {"thresholds": {"baseline_level_cm": 120, "warning_level_cm": 220, "critical_level_cm": 300, "critical_rise_rate_cm_h": 30,
                      "critical_rainfall_mm_h": 15, "soil_dry_pct": 20, "soil_saturated_pct": 85}}


def _series(levels, step_min=1, now=None):
    now = now or utcnow()
    n = len(levels)
    return [Reading("water_level_cm", v, now - timedelta(minutes=(n - 1 - i) * step_min)) for i, v in enumerate(levels)]


def _latest(now, level, rate=0.0, rain=0.0, soil=30.0, age=0):
    t = now - timedelta(seconds=age)
    return {
        "water_level_cm": Reading("water_level_cm", level, t),
        "water_level_rate_cm_h": Reading("water_level_rate_cm_h", rate, t),
        "rainfall_mm_h": Reading("rainfall_mm_h", rain, t),
        "soil_moisture_pct": Reading("soil_moisture_pct", soil, t),
    }


def test_stable_normal_is_low():
    now = utcnow()
    r = assess_risk(latest=_latest(now, 125, 0.2, 0.4, 30), water_level_series=_series([124, 125, 124, 126, 125, 125, 124, 125]), station_config=CFG, risk_settings=None, now=now)
    assert r.level == LEVEL_LOW
    assert 0 <= r.score < 20
    assert "низкий" in r.explanation_ru.lower()
    assert r.data_quality["status"] == "ok"


def test_rapid_flood_is_high_with_explanation():
    now = utcnow()
    r = assess_risk(latest=_latest(now, 290, 45, 22, 90), water_level_series=_series([200, 215, 232, 250, 268, 280, 290]), station_config=CFG, risk_settings=None, now=now)
    assert r.level == LEVEL_HIGH
    assert r.score >= 65
    assert "+45.0 cm/h" in r.explanation_ru
    assert "осадков" in r.explanation_ru
    assert "к критическому порогу" in r.explanation_ru or "превышения критического" in r.explanation_ru
    keys = {f.key: f for f in r.factors}
    assert keys["trend"].note_ru.startswith("устойчивый рост")
    assert r.trend["direction"] == "rising"
    assert len(r.forecasts) == 2 and r.forecasts[0].projected_level_cm > 290


def test_above_critical_mentions_threshold():
    now = utcnow()
    r = assess_risk(latest=_latest(now, 320, 10, 5, 60), water_level_series=_series([300, 310, 320]), station_config=CFG, risk_settings=None, now=now)
    assert "превышения критического порога 300" in r.explanation_ru


def test_rising_is_medium_and_falling_reduces_score():
    now = utcnow()
    rising = assess_risk(latest=_latest(now, 200, 15, 8, 60), water_level_series=_series([170, 176, 182, 188, 194, 200]), station_config=CFG, risk_settings=None, now=now)
    falling = assess_risk(latest=_latest(now, 200, -15, 8, 60), water_level_series=_series([230, 224, 218, 212, 206, 200]), station_config=CFG, risk_settings=None, now=now)
    assert rising.level == LEVEL_MEDIUM
    assert falling.score < rising.score
    assert falling.trend["direction"] == "falling"
    assert "снижение" in falling.explanation_ru


def test_missing_water_level_is_insufficient():
    now = utcnow()
    latest = _latest(now, 100)
    del latest["water_level_cm"]
    r = assess_risk(latest=latest, water_level_series=[], station_config=CFG, risk_settings=None, now=now)
    assert r.level == LEVEL_INSUFFICIENT and r.score is None
    assert "water_level_cm" in r.data_quality["missing_parameters"]


def test_stale_data_is_not_scored():
    now = utcnow()
    r = assess_risk(latest=_latest(now, 290, 40, 20, 90, age=2000), water_level_series=_series([250, 270, 290], now=now - timedelta(seconds=2000)), station_config=CFG, risk_settings={"stale_after_seconds": 900}, now=now)
    assert r.level == LEVEL_STALE and r.score is None
    assert r.data_quality["status"] == "stale"
    assert "устарели" in r.explanation_ru


def test_missing_optional_components_are_renormalised():
    now = utcnow()
    only_level = {"water_level_cm": Reading("water_level_cm", 300, now)}
    r = assess_risk(latest=only_level, water_level_series=[], station_config=CFG, risk_settings=None, now=now)
    assert r.level == LEVEL_HIGH  # level component alone normalises to 1.0 -> score 100
    assert r.score == pytest.approx(100.0)
    assert set(r.data_quality["components_used"]) == {"level"}


def test_derived_rate_from_series_when_rate_missing():
    now = utcnow()
    latest = _latest(now, 220, rain=0, soil=30)
    del latest["water_level_rate_cm_h"]
    r = assess_risk(latest=latest, water_level_series=_series([160, 175, 190, 205, 220]), station_config=CFG, risk_settings=None, now=now)
    rate = next(f for f in r.factors if f.key == "rise_rate")
    assert rate.value is not None and rate.value > 10
    assert "рассчитана по серии" in rate.note_ru


def test_boundary_values_and_clamping():
    now = utcnow()
    r = assess_risk(latest=_latest(now, 10_000, 10_000, 10_000, 100), water_level_series=_series([9000, 10000]), station_config=CFG, risk_settings=None, now=now)
    assert r.score == pytest.approx(100.0)
    r2 = assess_risk(latest=_latest(now, -50, -50, 0, 0), water_level_series=_series([0, -50]), station_config=CFG, risk_settings=None, now=now)
    assert r2.score == 0.0 and r2.level == LEVEL_LOW


def test_sudden_jump_marks_acceleration():
    now = utcnow()
    r = assess_risk(latest=_latest(now, 260, 60, 1, 30), water_level_series=_series([150, 151, 152, 153, 170, 200, 230, 260]), station_config=CFG, risk_settings=None, now=now)
    assert r.trend["accelerating"] is True
    assert "ускорение" in r.explanation_ru


def test_settings_change_affects_category():
    now = utcnow()
    latest = _latest(now, 200, 15, 8, 60)
    series = _series([170, 176, 182, 188, 194, 200])
    default = assess_risk(latest=latest, water_level_series=series, station_config=CFG, risk_settings=None, now=now)
    strict = assess_risk(latest=latest, water_level_series=series, station_config=CFG, risk_settings={"thresholds": {"medium": 10, "high": 30}}, now=now)
    assert default.level == LEVEL_MEDIUM and strict.level == LEVEL_HIGH
    no_rain = assess_risk(latest=latest, water_level_series=series, station_config=CFG, risk_settings={"weights": {"rainfall": 0.0}}, now=now)
    assert no_rain.score != default.score


def test_helpers():
    assert safe_ratio(5, 0) == 0.0
    assert safe_ratio(5, 10) == 0.5
    assert safe_ratio(float("nan"), 10) == 0.0
    assert classify(None, {}) == LEVEL_INSUFFICIENT
    assert classify(64.9, {"medium": 35, "high": 65}) == LEVEL_MEDIUM
    a, b, _ = linear_fit([(0, 0), (1, 2), (2, 4)])
    assert b == pytest.approx(2.0)
    assert analyse_trend([], 8, 3)["available"] is False
    assert validate_risk_settings(merge_settings(None)) == []
    assert validate_risk_settings({"weights": {"level": -1}, "thresholds": {"medium": 80, "high": 20}})
    assert validate_station_thresholds({"baseline_level_cm": 300, "critical_level_cm": 100})
