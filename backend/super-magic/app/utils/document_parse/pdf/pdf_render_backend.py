"""PDF 页面渲染后端。"""

from __future__ import annotations

import asyncio
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Protocol


@dataclass(frozen=True)
class PdfRenderedPage:
    """已经写入磁盘的 PDF 页面渲染图。"""

    page: int
    path: Path
    width: int
    height: int
    format: str
    content_hash: str
    backend: str


class PdfRenderBackend(Protocol):
    """具体 PDF 页面渲染器需要实现的协议。"""

    async def render_pages(
        self,
        path: Path,
        pages: Iterable[int],
        output_dir: Path,
        *,
        dpi: int = 120,
        image_format: str = "jpg",
    ) -> list[PdfRenderedPage]:
        """将选中的 PDF 页面渲染为图片文件。"""


class PyMuPdfRenderBackend:
    """基于 PyMuPDF 渲染 PDF 页面。"""

    async def render_pages(
        self,
        path: Path,
        pages: Iterable[int],
        output_dir: Path,
        *,
        dpi: int = 120,
        image_format: str = "jpg",
    ) -> list[PdfRenderedPage]:
        """在线程池中渲染选中的页面。"""

        return await asyncio.to_thread(
            self._render_pages_sync,
            path,
            list(pages),
            output_dir,
            dpi,
            image_format,
        )

    @staticmethod
    def _render_pages_sync(
        path: Path,
        pages: list[int],
        output_dir: Path,
        dpi: int,
        image_format: str,
    ) -> list[PdfRenderedPage]:
        """同步渲染 PDF 页面到目标目录。"""

        import fitz

        output_dir.mkdir(parents=True, exist_ok=True)
        normalized_format = "jpg" if image_format.lower() in {"jpg", "jpeg"} else "png"
        rendered: list[PdfRenderedPage] = []
        zoom = max(dpi, 36) / 72
        matrix = fitz.Matrix(zoom, zoom)
        with fitz.open(str(path)) as doc:
            for page_no in pages:
                if page_no < 1 or page_no > doc.page_count:
                    continue
                page = doc[page_no - 1]
                pixmap = page.get_pixmap(matrix=matrix, alpha=False)
                file_name = f"pdf_page_{page_no:03d}_snapshot.{normalized_format}"
                output_path = output_dir / file_name
                pixmap.save(str(output_path))
                data = output_path.read_bytes()
                rendered.append(
                    PdfRenderedPage(
                        page=page_no,
                        path=output_path,
                        width=int(pixmap.width),
                        height=int(pixmap.height),
                        format=normalized_format.upper(),
                        content_hash=hashlib.sha1(data).hexdigest(),
                        backend="pymupdf",
                    )
                )
        return rendered
