"""当前 Python 进程的不可变启动信息。"""
from __future__ import annotations

import time
from typing import Final

PROCESS_STARTED_AT_NS: Final[int] = time.time_ns()
PROCESS_STARTED_AT_SECONDS: Final[float] = PROCESS_STARTED_AT_NS / 1_000_000_000
