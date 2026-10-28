"""Standalone simulator process (SIMULATOR_MODE=external).

Polls /api/simulator/status for the desired state and posts telemetry through
/api/telemetry/ingest using the ingest key — no browser tab required.

    python -m app.simulator.runner --api http://localhost:8000 --key <INGEST_API_KEY>
"""
from __future__ import annotations

import argparse
import logging
import signal
import sys
import time
from datetime import datetime, timezone

import httpx

from app.simulator.scenarios import SCENARIOS, StationProfile, generate

log = logging.getLogger("urpaq.simulator.runner")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="XAVAMOS external telemetry simulator")
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--key", required=True, help="INGEST_API_KEY value")
    ap.add_argument("--max-ticks", type=int, default=0, help="stop after N ticks (0 = forever)")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    stop = {"flag": False}

    def _sig(*_):
        stop["flag"] = True

    signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)

    headers = {"X-Ingest-Key": args.key}
    client = httpx.Client(base_url=args.api, timeout=10.0, headers=headers)
    ticks = 0
    while not stop["flag"]:
        try:
            r = client.get("/api/simulator/status")
            r.raise_for_status()
            state = r.json()
        except Exception as exc:  # noqa: BLE001
            log.warning("status fetch failed: %s", exc)
            time.sleep(3)
            continue
        if state.get("driver") == "embedded" and state.get("driver_alive"):
            log.error("embedded simulator is active in the API process; refusing to run a second loop. Set SIMULATOR_MODE=external.")
            return 2
        interval = float(state.get("interval_seconds", 5))
        try:
            client.post("/api/simulator/heartbeat", json={"driver": "external"})
        except Exception:  # noqa: BLE001
            pass
        if state.get("state") == "running":
            now = datetime.now(timezone.utc)
            t = float(state["sim_elapsed_seconds"])
            dt = interval * float(state["time_acceleration"])
            sent = 0
            for st in state.get("stations", []):
                if st.get("status") != "online":
                    continue
                scenario = st.get("scenario") if st.get("scenario") in SCENARIOS else state["scenario"]
                thresholds = st.get("thresholds") or {}
                profile = StationProfile(
                    baseline_level_cm=float(thresholds.get("baseline_level_cm", 120)),
                    critical_level_cm=float(thresholds.get("critical_level_cm", 300)),
                )
                values = generate(scenario, t, dt, float(state["intensity"]), profile, int(state["seed"]), st["code"])
                payload = {
                    "station_id": st["id"],
                    "measured_at": now.isoformat(),
                    "event_id": f"ext-{state['seed']}-{st['code']}-{state['tick']}",
                    "readings": [{"parameter": p, "value": v} for p, v in values.items()],
                }
                try:
                    resp = client.post("/api/telemetry/ingest", json=payload)
                    if resp.status_code >= 400:
                        log.warning("ingest rejected for %s: %s", st["code"], resp.text[:200])
                    else:
                        sent += 1
                except Exception as exc:  # noqa: BLE001
                    log.warning("ingest failed: %s", exc)
            try:
                client.post("/api/simulator/advance", json={"sent": sent})
            except Exception as exc:  # noqa: BLE001
                log.warning("advance failed: %s", exc)
            ticks += 1
            if args.max_ticks and ticks >= args.max_ticks:
                break
        time.sleep(max(0.5, interval))
    log.info("runner stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
