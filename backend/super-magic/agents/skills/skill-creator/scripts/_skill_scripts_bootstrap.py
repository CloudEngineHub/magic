"""
Shared initialization for skill-creator scripts: project root, PathManager, and
startup log suppression. Run before importing app.* or SDK modules.
"""
import sys
from pathlib import Path

# agents/skills/_shared/ is under parents[2] for all skill scripts.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import _shared.bootstrap  # noqa: F401 — initialize runtime environment
