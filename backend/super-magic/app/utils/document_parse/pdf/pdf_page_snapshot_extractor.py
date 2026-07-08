"""从 PDF 中抽取整页快照资产。"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..models import DocumentAsset, DocumentAssetType
from ..structure.asset_store import AssetStore
from .pdf_render_backend import PdfRenderBackend, PyMuPdfRenderBackend


class PdfPageSnapshotExtractor:
    """为 PDF 页面创建整页快照资产。"""

    def __init__(self, backend: PdfRenderBackend | None = None) -> None:
        """使用渲染后端初始化抽取器。"""

        self._backend = backend or PyMuPdfRenderBackend()

    async def extract(
        self,
        path: Path,
        output_dir: Path,
        pages: Iterable[int],
        *,
        dpi: int = 120,
        image_format: str = "jpg",
        render_reason: str = "",
        start_index: int = 1,
    ) -> list[DocumentAsset]:
        """渲染 PDF 页面并返回快照资产。"""

        page_list = list(pages)
        if not page_list:
            return []
        assets_dir = await AssetStore.ensure(output_dir)
        rendered_pages = await self._backend.render_pages(
            path,
            page_list,
            assets_dir,
            dpi=dpi,
            image_format=image_format,
        )
        assets: list[DocumentAsset] = []
        for offset, rendered_page in enumerate(rendered_pages, start=start_index):
            assets.append(
                DocumentAsset(
                    asset_id=f"asset_{offset:04d}",
                    asset_type=DocumentAssetType.PAGE_SNAPSHOT.value,
                    path=str(rendered_page.path.relative_to(output_dir)),
                    title=f"PDF page {rendered_page.page} snapshot",
                    source_range=f"pages:{rendered_page.page}",
                    metadata={
                        "page": rendered_page.page,
                        "dpi": dpi,
                        "format": rendered_page.format,
                        "width": rendered_page.width,
                        "height": rendered_page.height,
                        "content_hash": rendered_page.content_hash,
                        "render_backend": rendered_page.backend,
                        "render_reason": render_reason,
                    },
                )
            )
        return assets
