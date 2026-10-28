"""Tiny in-memory sliding-window rate limiter (per process).

Good enough for a single-process deployment to slow down credential stuffing on
/api/auth/login. For multi-worker setups put a reverse-proxy limiter in front.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from typing import Deque, Dict


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: float = 60.0) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: Dict[str, Deque[float]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str) -> bool:
        """Register a hit; return True if the key is still within its budget."""
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            # opportunistic cleanup to keep memory bounded
            if len(self._hits) > 10_000:
                for k in [k for k, v in self._hits.items() if not v or now - v[-1] > self.window]:
                    self._hits.pop(k, None)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
