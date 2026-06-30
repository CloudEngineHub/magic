"""Office-like document conversion through LibreOffice."""

from __future__ import annotations

from app.utils.async_file_utils import async_move_file

from ...constants import POWERPOINT_EXTENSIONS, SPREADSHEET_EXTENSIONS, WORD_EXTENSIONS
from ..models import ConversionCapability, ConversionRequest, ConversionResult
from .base import DocumentFormatConverterDriver

OFFICE_TARGET_FORMATS = {"pdf", "docx", "pptx", "xlsx"}


class OfficeDocumentConverter(DocumentFormatConverterDriver):
    def capabilities(self) -> list[ConversionCapability]:
        return [
            ConversionCapability(
                source_extensions=WORD_EXTENSIONS | POWERPOINT_EXTENSIONS | SPREADSHEET_EXTENSIONS,
                target_formats=OFFICE_TARGET_FORMATS,
                converter_name="libreoffice",
                description="Office-like documents -> pdf, docx, pptx, xlsx",
            )
        ]

    async def convert(self, request: ConversionRequest) -> ConversionResult:
        """Convert Office-like documents through LibreOffice.

        Args:
            request: Conversion request. Office conversions intentionally ignore
                partial-range semantics and require a whole-file conversion.

        Returns:
            Conversion result containing the converted file path
        """
        if request.ranges:
            raise ValueError(
                "Partial range conversion is only supported for PDF image rendering. "
                "LibreOffice-based Office conversions must convert the whole file."
            )
        from app.utils.file_parse.utils.libreoffice_util import LibreOfficeUtil

        converted = await LibreOfficeUtil.convert_document(
            request.input_path,
            request.normalized_target,
            request.output_dir.name,
        )
        final_path = request.output_dir / converted.name
        if converted != final_path:
            await async_move_file(converted, final_path)
        return ConversionResult(output_files=[final_path], converter_name="libreoffice")
