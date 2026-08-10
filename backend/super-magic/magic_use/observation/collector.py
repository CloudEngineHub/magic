from __future__ import annotations

from magic_use.observation.accessibility import AccessibilityCollector, CDPClient
from magic_use.observation.dom_snapshot import DOMSnapshotCollector
from magic_use.observation.page_probe import PageProbeCollector, ProbePage
from magic_use.observation.sources import SnapshotSources


class SnapshotSourceCollector:
    def __init__(
        self,
        accessibility: AccessibilityCollector,
        dom_snapshot: DOMSnapshotCollector,
        page_probe: PageProbeCollector,
    ) -> None:
        self._accessibility = accessibility
        self._dom_snapshot = dom_snapshot
        self._page_probe = page_probe

    async def collect(self, *, cdp: CDPClient, page: ProbePage) -> SnapshotSources:
        accessibility = await self._accessibility.collect(cdp)
        dom = await self._dom_snapshot.collect(cdp)
        probe, viewport = await self._page_probe.collect(page)
        return SnapshotSources(
            accessibility=accessibility,
            dom=dom,
            probe=probe,
            viewport=viewport,
        )
