from magic_use.observation.accessibility import AccessibilityCollector
from magic_use.observation.collector import SnapshotSourceCollector
from magic_use.observation.composer import SnapshotComposer
from magic_use.observation.diff import SnapshotDiffer
from magic_use.observation.dom_snapshot import DOMSnapshotCollector
from magic_use.observation.page_probe import PageProbeCollector

__all__ = [
    "AccessibilityCollector",
    "DOMSnapshotCollector",
    "PageProbeCollector",
    "SnapshotComposer",
    "SnapshotDiffer",
    "SnapshotSourceCollector",
]
