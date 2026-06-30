"""PDF metadata inspection."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Dict


class PdfMetadata:
    """Inspect lightweight PDF signals without full extraction."""

    FRONT_SAMPLE_PAGES = 3
    MAX_SAMPLE_PAGES = 5

    @staticmethod
    async def inspect(path: Path) -> Dict[str, Any]:
        """Return low-cost PDF metadata used by extraction planning."""

        return await asyncio.to_thread(PdfMetadata._inspect_sync, path)

    @staticmethod
    def _inspect_sync(path: Path) -> Dict[str, Any]:
        """Inspect selected PDF pages in a deterministic stratified way."""

        import fitz

        with fitz.open(str(path)) as doc:
            page_count = doc.page_count
            sampled_pages = PdfMetadata._select_sample_pages(page_count)
            sample_pages = len(sampled_pages)
            text_chars = 0
            image_pages = 0
            full_page_image_pages = 0
            for page_number in sampled_pages:
                page = doc[page_number - 1]
                text_chars += len((page.get_text() or "").strip())
                images = page.get_images(full=True)
                if images:
                    image_pages += 1
                page_area = max(float(page.rect.width * page.rect.height), 1.0)
                for image_info in images:
                    try:
                        rects = page.get_image_rects(int(image_info[0]))
                    except Exception:
                        rects = []
                    if any((float(rect.width * rect.height) / page_area) >= 0.6 for rect in rects):
                        full_page_image_pages += 1
                        break
            avg_chars = text_chars / sample_pages if sample_pages else 0
            if avg_chars > 2000:
                text_density = "high"
            elif avg_chars > 500:
                text_density = "medium"
            else:
                text_density = "low"
            has_images = image_pages > 0
            is_scanned_like = bool(sample_pages and text_density == "low" and image_pages / sample_pages >= 0.66)
            metadata = doc.metadata or {}
        return {
            "page_count": page_count,
            "sample_pages": sample_pages,
            "sampled_pages": sampled_pages,
            "sampling_strategy": "deterministic_stratified",
            "avg_chars_per_sample_page": avg_chars,
            "text_density": text_density,
            "has_images_in_sample": has_images,
            "image_pages_in_sample": image_pages,
            "full_page_image_pages_in_sample": full_page_image_pages,
            "is_scanned_like": is_scanned_like,
            "pdf_metadata": metadata,
        }

    @staticmethod
    def _select_sample_pages(page_count: int) -> list[int]:
        """Select front, middle, and final pages with stable 1-based numbers."""

        if page_count <= 0:
            return []
        if page_count <= PdfMetadata.MAX_SAMPLE_PAGES:
            return list(range(1, page_count + 1))

        candidates = [
            *range(1, min(PdfMetadata.FRONT_SAMPLE_PAGES, page_count) + 1),
            max(1, page_count // 2),
            page_count,
        ]
        selected: list[int] = []
        for page_number in candidates:
            if page_number < 1 or page_number > page_count or page_number in selected:
                continue
            selected.append(page_number)
            if len(selected) >= PdfMetadata.MAX_SAMPLE_PAGES:
                break
        return selected
