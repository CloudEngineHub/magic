"""Word document file parser driver implementation."""

import asyncio
import re
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import Union, List, Optional, Set, Tuple

from agentlang.logger import get_logger
from app.utils.async_file_utils import async_exists, async_unlink
from app.utils.document_parse.constants import WORD_EXTENSIONS
from app.utils.document_parse.errors import DocumentRangeError
from app.utils.document_parse.structure.range_parser import RangeParser
from .abstract_driver import AbstractDriver
from .interfaces.file_parser_driver_interface import ParseResult, ParseMetadata
from .interfaces.word_driver_interface import WordDriverInterface

logger = get_logger(__name__)


class WordDriver(AbstractDriver, WordDriverInterface):
    """Word document parser driver using MarkItDown integration.

    Supports Word-like office formats:
    - .docx: Direct processing through existing DocxConverter plugin
    - Other Word/WPS/ODT/RTF/template/macro formats: Converted to .docx
      using LibreOffice, then processed. Macros are never executed.
    """

    # Supported Word document extensions
    supported_extensions = sorted(WORD_EXTENSIONS)
    MAX_IMAGES_PER_SELECTED_RANGE = 10

    async def parse(self, file_path: Union[str, Path], result: ParseResult, **kwargs) -> None:
        """Parse Word document and update the provided ParseResult object.

        Args:
            file_path: Path to the Word-like document
            result: ParseResult object to update with parsed content and metadata
            **kwargs: Additional parsing options:
                - offset (int): Starting offset for conversion, default 0
                - limit (int): Maximum items to convert (-1 for unlimited), default -1
                - extract_images (bool): Whether to extract images from document, default True
        """
        file_path_obj = Path(file_path)
        original_format = file_path_obj.suffix.lower().lstrip(".")
        requires_conversion = file_path_obj.suffix.lower() != '.docx'

        logger.info(f"Parsing Word document: {file_path_obj} (format: {original_format.upper()})")

        # Get local file path
        local_file_path = await self._get_file_path(file_path)

        # Convert non-.docx inputs to the stable DOCX path used by MarkItDown.
        converted_file_path = None
        try:
            if requires_conversion:
                from ..utils.libreoffice_util import LibreOfficeUtil
                converted_file_path = await LibreOfficeUtil.convert_document(
                    local_file_path, 'docx', 'converted'
                )
                processing_file_path = converted_file_path
                conversion_method = 'libreoffice_then_markitdown'
            else:
                processing_file_path = local_file_path
                conversion_method = 'markitdown'

            selected_ranges, conversion_offset, conversion_limit, max_images = self._resolve_range_bounds(
                processing_file_path,
                kwargs,
            )

            # Use base class MarkItDown functionality to convert the file
            markdown_content = await self._convert_with_markitdown(
                processing_file_path,
                offset=conversion_offset,
                limit=conversion_limit
            )

            if not markdown_content:
                raise ValueError("MarkItDown conversion returned empty content")

            # Check image processing options
            extract_images = kwargs.get('extract_images', True)

            # Extract and save images if requested and present in markdown content
            if extract_images and '![' in markdown_content:
                from ..utils.image_extractor_util import ImageExtractorUtil

                logger.info("Extracting images for filesystem saving")
                # Extract images from the DOCX file
                extracted_images = await ImageExtractorUtil.extract_docx_images(
                    processing_file_path,
                    max_images=max_images,
                )

                # Save images to filesystem if extracted
                if extracted_images:
                    from ..utils.document_image_util import DocumentImageUtil

                    saved_images_mapping = await DocumentImageUtil.save_images_to_output_path(
                        extracted_images, result.output_file_path, 'doc'
                    )

                    # Update markdown image paths if images were saved
                    final_content = DocumentImageUtil.update_image_paths_in_markdown(
                        markdown_content, saved_images_mapping, result.output_file_path
                    )

                    # Set images directory path in result
                    images_dir = DocumentImageUtil.get_images_directory_path(result.output_file_path)
                    result.output_images_dir = str(images_dir)

                    # Clean up temporary images after saving
                    await ImageExtractorUtil.cleanup_temp_images(extracted_images)
                    logger.debug(f"Cleaned up {len(extracted_images)} temporary image files")
                else:
                    # No images extracted, remove image markers from markdown
                    from ..utils.markdown_util import MarkdownUtil
                    final_content = MarkdownUtil.remove_image_markers(markdown_content)
            elif '![' in markdown_content:
                # extract_images=False but images present, remove image markers
                from ..utils.markdown_util import MarkdownUtil
                final_content = MarkdownUtil.remove_image_markers(markdown_content)
            else:
                final_content = markdown_content

            # Add filename as main title and adjust content heading levels
            from ..utils.markdown_util import MarkdownUtil

            final_markdown_content = MarkdownUtil.add_filename_title(final_content, file_path_obj.name)
            await MarkdownUtil.write_to_file(final_markdown_content, result.output_file_path)
            result.metadata.conversion_method = conversion_method
            result.metadata.additional_info = {
                'word_count': len(final_content.split()),
                'character_count': len(final_content),
                'document_format': original_format,
                'original_format': original_format,
                'conversion_required': requires_conversion,
                'images_extracted': extract_images,
                'selected_ranges': sorted(selected_ranges) if selected_ranges is not None else None,
                'max_images': max_images,
            }
        finally:
            # Clean up temporary converted file if it was created
            if converted_file_path:
                try:
                    if await async_exists(converted_file_path):
                        await async_unlink(converted_file_path)
                        logger.debug(f"Cleaned up temporary file: {converted_file_path}")
                except Exception as e:
                    logger.warning(f"Failed to clean up temporary file {converted_file_path}: {e}")

    def _resolve_range_bounds(self, processing_file_path: Path, kwargs: dict) -> Tuple[Optional[Set[int]], int, int, int]:
        """Resolve requested Word ranges into MarkItDown bounds and image limits.

        Args:
            processing_file_path: DOCX file path used for parsing
            kwargs: Parser keyword arguments, including optional ranges, offset, and limit

        Returns:
            Tuple of selected ranges, MarkItDown offset, MarkItDown limit, and image limit
        """
        offset = int(kwargs.get('offset', 0) or 0)
        limit = int(kwargs.get('limit', -1) or -1)
        raw_ranges = kwargs.get('ranges')
        if not raw_ranges:
            return None, offset, limit, -1

        total_sections = self._count_docx_heading_sections(processing_file_path)
        try:
            selected = RangeParser.parse_numeric(str(raw_ranges), total_sections or None)
        except DocumentRangeError as exc:
            logger.warning(f"Invalid Word ranges '{raw_ranges}', falling back to offset/limit: {exc}")
            return None, offset, limit, -1

        if not selected:
            logger.warning(f"Word ranges '{raw_ranges}' matched no sections")
            return set(), 0, 0, 0

        contiguous_run = self._first_contiguous_run(selected)
        conversion_offset = max(contiguous_run[0] - 1, 0)
        conversion_limit = len(contiguous_run)
        if len(contiguous_run) != len(selected):
            logger.info(
                "Word ranges are non-contiguous; MarkItDown conversion is limited "
                f"to ranges {contiguous_run[0]}-{contiguous_run[-1]} while image extraction "
                f"is capped for the exact requested ranges: {selected}"
            )
        max_images = max(1, len(selected) * self.MAX_IMAGES_PER_SELECTED_RANGE)
        return set(selected), conversion_offset, conversion_limit, max_images

    @staticmethod
    def _first_contiguous_run(range_numbers: List[int]) -> List[int]:
        """Return the first contiguous run from a 1-based range number list.

        Args:
            range_numbers: Requested range numbers in caller order

        Returns:
            The first contiguous range run
        """
        if not range_numbers:
            return []
        run = [range_numbers[0]]
        for range_number in range_numbers[1:]:
            if range_number != run[-1] + 1:
                break
            run.append(range_number)
        return run

    @staticmethod
    def _count_docx_heading_sections(docx_file_path: Path) -> int:
        """Count heading-based sections in a DOCX package.

        Args:
            docx_file_path: DOCX file path to inspect

        Returns:
            Number of heading paragraphs found in the document
        """
        try:
            import zipfile
            import xml.etree.ElementTree as ET

            with zipfile.ZipFile(docx_file_path, 'r') as zip_ref:
                if 'word/document.xml' not in zip_ref.namelist():
                    return 0
                root = ET.fromstring(zip_ref.read('word/document.xml'))
            ns = {
                'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
            }
            count = 0
            heading_pattern = re.compile(r"^Heading\d+$|^Heading \d+$", re.IGNORECASE)
            for paragraph in root.findall('.//w:p', ns):
                style = paragraph.find('./w:pPr/w:pStyle', ns)
                style_value = style.get(f"{{{ns['w']}}}val") if style is not None else ''
                if style_value and heading_pattern.match(style_value):
                    count += 1
            return count
        except Exception as exc:
            logger.warning(f"Failed to count Word sections for {docx_file_path}: {exc}")
            return 0
