"""PDF 文件校验工具。"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any


class PdfValidationErrorCode(StrEnum):
    """结构化的 PDF 校验错误码。"""

    EMPTY = "empty"
    INVALID_HEADER = "invalid_header"
    PASSWORD_PROTECTED = "password_protected"
    CORRUPTED = "corrupted"
    UNKNOWN = "unknown"


@dataclass
class PdfValidationResult:
    """PDF 校验结果。"""

    ok: bool
    page_count: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)
    error_code: PdfValidationErrorCode | None = None
    error_message: str = ""


class PdfFileValidator:
    """在解析前校验 PDF 文件。"""

    async def validate(self, path: Path) -> PdfValidationResult:
        """返回 PDF 文件的结构化校验结果。"""

        return await asyncio.to_thread(self._validate_sync, path)

    @staticmethod
    def _validate_sync(path: Path) -> PdfValidationResult:
        """通过轻量文件检查和 PyMuPDF 校验 PDF 文件。"""

        try:
            size = path.stat().st_size
        except Exception as exc:
            return PdfValidationResult(
                ok=False,
                error_code=PdfValidationErrorCode.UNKNOWN,
                error_message=str(exc),
            )
        if size <= 0:
            return PdfValidationResult(
                ok=False,
                error_code=PdfValidationErrorCode.EMPTY,
                error_message=f"PDF file is empty: {path}",
            )
        try:
            with path.open("rb") as file:
                header = file.read(5)
        except Exception as exc:
            return PdfValidationResult(
                ok=False,
                error_code=PdfValidationErrorCode.UNKNOWN,
                error_message=str(exc),
            )
        if header != b"%PDF-":
            return PdfValidationResult(
                ok=False,
                error_code=PdfValidationErrorCode.INVALID_HEADER,
                error_message=f"File is not a valid PDF: {path}",
            )
        try:
            import fitz

            with fitz.open(str(path)) as doc:
                if doc.needs_pass:
                    return PdfValidationResult(
                        ok=False,
                        error_code=PdfValidationErrorCode.PASSWORD_PROTECTED,
                        error_message="PDF is password-protected. Please provide an unprotected version.",
                    )
                return PdfValidationResult(ok=True, page_count=doc.page_count, metadata=doc.metadata or {})
        except Exception as exc:
            message = str(exc)
            lowered = message.lower()
            if "password" in lowered or "encrypted" in lowered:
                return PdfValidationResult(
                    ok=False,
                    error_code=PdfValidationErrorCode.PASSWORD_PROTECTED,
                    error_message="PDF is password-protected. Please provide an unprotected version.",
                )
            if "damaged" in lowered or "corrupt" in lowered or "cannot open" in lowered:
                return PdfValidationResult(
                    ok=False,
                    error_code=PdfValidationErrorCode.CORRUPTED,
                    error_message="PDF file is corrupted or invalid.",
                )
            return PdfValidationResult(
                ok=False,
                error_code=PdfValidationErrorCode.UNKNOWN,
                error_message=message,
            )
