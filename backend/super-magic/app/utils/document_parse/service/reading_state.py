"""Persist progressive document reading state.

Internal responsibility:
- Tracks what has been sampled, extracted, and visually understood for one output directory.
- Keeps this process state separate from document.index.json, which remains the structural index.
- Uses only async file helpers so document-converter tools behave consistently on workspace storage.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.utils.async_file_utils import async_mkdir, async_try_read_json, async_write_json

from ..constants import READING_STATE_FILENAME
from .reading_range_parser import ReadingRangeParser


class ReadingStateStore:
    """Read and update document.reading_state.json for progressive reading."""

    @staticmethod
    def path(output_dir: Path) -> Path:
        return output_dir / READING_STATE_FILENAME

    async def load(self, output_dir: Path) -> dict[str, Any]:
        return await async_try_read_json(self.path(output_dir)) or {}

    async def save(self, output_dir: Path, state: dict[str, Any]) -> dict[str, Any]:
        await async_mkdir(output_dir, parents=True, exist_ok=True)
        state["updated_at"] = datetime.now(timezone.utc).isoformat()
        await async_write_json(self.path(output_dir), state, ensure_ascii=False, indent=2)
        return state

    async def initialize(
        self,
        output_dir: Path,
        *,
        source_path: str,
        total_units: int,
        unit_type: str,
        file_type: str,
        current_reading_goal: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        existing = await self.load(output_dir)
        state = {
            "source_path": existing.get("source_path") or source_path,
            "output_dir": str(output_dir),
            "file_type": existing.get("file_type") or file_type,
            "unit_type": existing.get("unit_type") or unit_type,
            "total_units": int(existing.get("total_units") or total_units or 0),
            "sampled_ranges": existing.get("sampled_ranges") or [],
            "extracted_ranges": existing.get("extracted_ranges") or [],
            "visually_understood_images": existing.get("visually_understood_images") or [],
            "rendered_page_snapshots": existing.get("rendered_page_snapshots") or [],
            "unread_ranges": existing.get("unread_ranges") or [],
            "discovered_sections": existing.get("discovered_sections") or [],
            "recommended_next_actions": existing.get("recommended_next_actions") or [],
            "current_reading_goal": current_reading_goal or existing.get("current_reading_goal") or "",
            "metadata": {**(existing.get("metadata") or {}), **(metadata or {})},
        }
        state["unread_ranges"] = self._compute_unread_ranges(state)
        return await self.save(output_dir, state)

    async def mark_sampled(
        self,
        output_dir: Path,
        *,
        source_path: str,
        total_units: int,
        unit_type: str,
        file_type: str,
        sampled_range: str,
        sample_path: str,
        recommendations: list[str],
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        state = await self.initialize(
            output_dir,
            source_path=source_path,
            total_units=total_units,
            unit_type=unit_type,
            file_type=file_type,
            metadata=metadata,
        )
        sampled_range = ReadingRangeParser.normalize_for_state(sampled_range, total_units, unit_type)
        state["sampled_ranges"] = self._append_unique(state.get("sampled_ranges"), sampled_range)
        state["sample_files"] = self._append_unique(state.get("sample_files"), sample_path)
        state["recommended_next_actions"] = recommendations
        state["metadata"] = {**(state.get("metadata") or {}), **(metadata or {})}
        state["unread_ranges"] = self._compute_unread_ranges(state)
        return await self.save(output_dir, state)

    async def mark_extracted(
        self,
        output_dir: Path,
        *,
        source_path: str,
        total_units: int,
        unit_type: str,
        file_type: str,
        extracted_range: str,
    ) -> dict[str, Any]:
        state = await self.initialize(
            output_dir,
            source_path=source_path,
            total_units=total_units,
            unit_type=unit_type,
            file_type=file_type,
        )
        extracted_range = ReadingRangeParser.normalize_for_state(extracted_range, total_units, unit_type)
        state["extracted_ranges"] = self._append_unique(state.get("extracted_ranges"), extracted_range)
        state["unread_ranges"] = self._compute_unread_ranges(state)
        return await self.save(output_dir, state)

    async def mark_page_snapshots_rendered(
        self,
        output_dir: Path,
        *,
        snapshots: list[dict[str, Any]],
        recommendations: list[str] | None = None,
    ) -> dict[str, Any]:
        """在阅读状态中记录已经渲染的 PDF 整页快照。"""

        state = await self.load(output_dir)
        rendered = list(state.get("rendered_page_snapshots") or [])
        seen = {str(item.get("asset_path") or "") for item in rendered}
        for snapshot in snapshots:
            asset_path = str(snapshot.get("asset_path") or "")
            if not asset_path or asset_path in seen:
                continue
            rendered.append(snapshot)
            seen.add(asset_path)
        state["rendered_page_snapshots"] = rendered
        if recommendations is not None:
            state["recommended_next_actions"] = recommendations
        return await self.save(output_dir, state)

    async def mark_images_understood(
        self,
        output_dir: Path,
        *,
        image_paths: list[str],
        result_paths: list[str],
        recommendations: list[str] | None = None,
    ) -> dict[str, Any]:
        state = await self.load(output_dir)
        understood = list(state.get("visually_understood_images") or [])
        for image_path, result_path in zip(image_paths, result_paths):
            entry = {"image_path": image_path, **({"result_path": result_path} if result_path else {})}
            if entry not in understood:
                understood.append(entry)
        state["visually_understood_images"] = understood
        if recommendations is not None:
            state["recommended_next_actions"] = recommendations
        return await self.save(output_dir, state)

    @staticmethod
    def _append_unique(values: Any, item: str) -> list[str]:
        result = [str(value) for value in values or [] if str(value)]
        if item and item not in result:
            result.append(item)
        return result

    @staticmethod
    def _compute_unread_ranges(state: dict[str, Any]) -> list[str]:
        """根据已读范围计算剩余未读范围。"""

        total_units = int(state.get("total_units") or 0)
        unit_type = str(state.get("unit_type") or "")
        consumed_ranges = (state.get("extracted_ranges") or []) + (state.get("sampled_ranges") or [])
        return ReadingRangeParser.compute_unread_ranges(total_units, unit_type, consumed_ranges)
