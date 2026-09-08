#!/usr/bin/env python3
"""Read the user's preferred language without depending on the current directory."""
from __future__ import annotations

import json
import sys
from pathlib import Path

# agents/skills/_shared/ is under parents[2] for all skill scripts.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from _shared.language import get_language


if __name__ == "__main__":
    print(json.dumps(get_language(), ensure_ascii=False))
