"""Deterministic telemetry scenarios.

Every value is a pure function of (scenario, simulated elapsed seconds, intensity,
seed, station profile) so runs are fully reproducible and independent of wall
clock. Noise is generated from a hash of (seed, station, tick) rather than a
shared RNG stream, so re-ordering stations or restarting never changes values.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from typing import Dict, List

SCENARIOS = ("NORMAL", "RISING_WATER", "RAPID_FLOOD")


@dataclass(frozen=True)
class StationProfile:
    baseline_level_cm: float = 120.0
    critical_level_cm: float = 300.0
    base_temperature_c: float = 12.0
    base_soil_pct: float = 35.0


def _noise(seed: int, station_key: str, tick: int, channel: str) -> float:
    """Deterministic pseudo-noise in [-1, 1]."""
    h = hashlib.blake2b(f"{seed}|{station_key}|{tick}|{channel}".encode(), digest_size=8).digest()
    return (int.from_bytes(h, "big") / 2**64) * 2.0 - 1.0


def _smooth_noise(seed: int, key: str, t_sec: float, channel: str, period: float) -> float:
    """Piecewise-linear interpolated noise — gives smooth, non-jumpy series."""
    x = t_sec / period
    i = int(math.floor(x))
    f = x - i
    a = _noise(seed, key, i, channel)
    b = _noise(seed, key, i + 1, channel)
    f = f * f * (3 - 2 * f)  # smoothstep
    return a + (b - a) * f


def level_curve(scenario: str, t_sec: float, intensity: float, p: StationProfile, seed: int, key: str) -> float:
    """Water level (cm) as a function of simulated elapsed time."""
    span = p.critical_level_cm - p.baseline_level_cm
    t_h = t_sec / 3600.0
    if scenario == "NORMAL":
        # Slow diurnal-like oscillation (4 h period) plus small smooth noise.
        return p.baseline_level_cm + 4.0 * math.sin(2 * math.pi * t_sec / 14400.0) + 1.0 * _smooth_noise(seed, key, t_sec, "lvl", 1200.0)
    if scenario == "RISING_WATER":
        # Logistic ramp: reaches ~50% of the span at ~1.2 h, peak rise ≈ 55-70 cm/h at intensity 1.
        k = 1.6 * intensity
        ramp = span * 0.95 / (1 + math.exp(-(k * (t_h - 1.2))))
        return p.baseline_level_cm + ramp + 1.5 * _smooth_noise(seed, key, t_sec, "lvl", 900.0)
    if scenario == "RAPID_FLOOD":
        # Fast ramp exceeding the critical level within ~45 min at intensity 1 (peak ≈ 200 cm/h).
        k = 4.5 * intensity
        ramp = span * 1.15 / (1 + math.exp(-(k * (t_h - 0.4))))
        return p.baseline_level_cm + ramp + 2.0 * _smooth_noise(seed, key, t_sec, "lvl", 600.0)
    raise ValueError(f"unknown scenario {scenario}")


def rainfall_curve(scenario: str, t_sec: float, intensity: float, seed: int, key: str) -> float:
    n = _smooth_noise(seed, key, t_sec, "rain", 180.0)
    t_h = t_sec / 3600.0
    if scenario == "NORMAL":
        return max(0.0, 0.6 + 0.6 * n)
    if scenario == "RISING_WATER":
        return max(0.0, 2.0 + 9.0 * intensity * min(1.0, t_h / 1.0) + 1.5 * n)
    if scenario == "RAPID_FLOOD":
        return max(0.0, 8.0 + 16.0 * intensity * min(1.0, t_h / 0.25) + 3.0 * n)
    raise ValueError(scenario)


def soil_curve(scenario: str, t_sec: float, intensity: float, p: StationProfile, seed: int, key: str) -> float:
    n = _smooth_noise(seed, key, t_sec, "soil", 300.0)
    t_h = t_sec / 3600.0
    if scenario == "NORMAL":
        v = p.base_soil_pct + 3.0 * n
    elif scenario == "RISING_WATER":
        v = p.base_soil_pct + 45.0 * min(1.0, t_h / 1.5) * intensity + 3.0 * n
    else:
        v = p.base_soil_pct + 55.0 * min(1.0, t_h / 0.4) * intensity + 3.0 * n
    return max(0.0, min(100.0, v))


def temperature_curve(t_sec: float, p: StationProfile, seed: int, key: str) -> float:
    return p.base_temperature_c + 2.5 * math.sin(t_sec / 7200.0) + 0.8 * _smooth_noise(seed, key, t_sec, "temp", 600.0)


def generate(scenario: str, t_sec: float, dt_sec: float, intensity: float, p: StationProfile, seed: int, key: str) -> Dict[str, float]:
    """Return a full reading set for simulated time t_sec (dt_sec = simulated step)."""
    if scenario not in SCENARIOS:
        raise ValueError(f"unknown scenario {scenario}")
    level = level_curve(scenario, t_sec, intensity, p, seed, key)
    # Reported rise rate = trailing difference over a 10-minute (simulated) window,
    # the way a level sensor would smooth its derivative.
    window = max(dt_sec, 600.0)
    prev = level_curve(scenario, max(0.0, t_sec - window), intensity, p, seed, key)
    rate = (level - prev) / (window / 3600.0) if t_sec > 0 else 0.0
    return {
        "water_level_cm": round(level, 2),
        "water_level_rate_cm_h": round(max(-500.0, min(500.0, rate)), 2),
        "rainfall_mm_h": round(rainfall_curve(scenario, t_sec, intensity, seed, key), 2),
        "soil_moisture_pct": round(soil_curve(scenario, t_sec, intensity, p, seed, key), 1),
        "air_temperature_c": round(temperature_curve(t_sec, p, seed, key), 1),
    }


def preview(scenario: str, intensity: float = 1.0, seed: int = 42, minutes: int = 120, step_sec: int = 60,
            profile: StationProfile | None = None) -> List[Dict[str, float]]:
    p = profile or StationProfile()
    out = []
    for i in range(0, minutes * 60 + 1, step_sec):
        row = generate(scenario, float(i), float(step_sec), intensity, p, seed, "preview")
        row["t_sec"] = float(i)
        out.append(row)
    return out
