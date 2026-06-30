"""PowerPoint presentation file parser driver implementation."""

import asyncio
import re
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import Union, List, Optional, Set, Tuple

from agentlang.logger import get_logger
from app.utils.async_file_utils import async_exists, async_unlink
from app.utils.document_parse.constants import POWERPOINT_EXTENSIONS
from app.utils.document_parse.errors import DocumentRangeError
from app.utils.document_parse.structure.range_parser import RangeParser
from .abstract_driver import AbstractDriver
from .interfaces.file_parser_driver_interface import ParseResult, ParseMetadata
from .interfaces.powerpoint_driver_interface import PowerPointDriverInterface

logger = get_logger(__name__)


class PowerPointDriver(AbstractDriver, PowerPointDriverInterface):
    """PowerPoint presentation parser driver using MarkItDown integration.

    Supports presentation-like office formats:
    - .pptx: Direct processing through existing PptxConverter plugin
    - Other PowerPoint/WPS/OpenDocument/show/template/macro formats: Converted
      to .pptx using LibreOffice, then processed. Macros are never executed.
    """

    # Supported PowerPoint extensions
    supported_extensions = sorted(POWERPOINT_EXTENSIONS)

    async def parse(self, file_path: Union[str, Path], result: ParseResult, **kwargs) -> None:
        """Parse PowerPoint presentation and update the provided ParseResult object.

        Args:
            file_path: Path to the presentation-like document
            result: ParseResult object to update with parsed content and metadata
            **kwargs: Additional parsing options:
                - offset (int): Starting offset for conversion, default 0
                - limit (int): Maximum items to convert (-1 for unlimited), default -1
                - extract_images (bool): Whether to extract images from presentation, default True
        """
        file_path_obj = Path(file_path)
        original_format = file_path_obj.suffix.lower().lstrip(".")
        requires_conversion = file_path_obj.suffix.lower() != '.pptx'

        logger.info(f"Parsing PowerPoint presentation: {file_path_obj} (format: {original_format.upper()})")

        # Get local file path
        local_file_path = await self._get_file_path(file_path)

        # Convert non-.pptx inputs to the stable PPTX path used by MarkItDown.
        converted_file_path = None
        try:
            if requires_conversion:
                from ..utils.libreoffice_util import LibreOfficeUtil
                converted_file_path = await LibreOfficeUtil.convert_document(
                    local_file_path, 'pptx', 'converted'
                )
                processing_file_path = converted_file_path
                conversion_method = 'libreoffice_then_markitdown'
            else:
                processing_file_path = local_file_path
                conversion_method = 'markitdown'

            selected_slides, conversion_offset, conversion_limit = self._resolve_slide_selection(
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

            # Initialize variables for image handling
            saved_images_mapping = {}

            # Extract and save images if requested
            if extract_images and ('![' in markdown_content):
                from ..utils.image_extractor_util import ImageExtractorUtil

                # Extract images using slide-based method for better ordering
                logger.info("Extracting images for filesystem saving")
                extracted_images_by_slide = await ImageExtractorUtil.extract_pptx_images_by_slides(
                    processing_file_path,
                    slide_numbers=selected_slides,
                )

                # Flatten slide-based images to maintain slide order
                extracted_images = []
                for slide_num in sorted(extracted_images_by_slide.keys()):
                    slide_images = extracted_images_by_slide[slide_num]
                    extracted_images.extend(slide_images)
                    logger.debug(f"Added {len(slide_images)} images from slide {slide_num}")

                # Save images to filesystem if requested
                if extracted_images:
                    from ..utils.document_image_util import DocumentImageUtil

                    saved_images_mapping = await DocumentImageUtil.save_images_to_output_path(
                        extracted_images, result.output_file_path, 'slide'
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
                    final_content = markdown_content
            else:
                final_content = markdown_content

            # Add filename as main title and adjust content heading levels
            from ..utils.markdown_util import MarkdownUtil

            final_markdown_content = MarkdownUtil.add_filename_title(final_content, file_path_obj.name)
            await MarkdownUtil.write_to_file(final_markdown_content, result.output_file_path)
            result.metadata.conversion_method = conversion_method
            result.metadata.additional_info = {
                'presentation_format': original_format,
                'character_count': len(final_content),  # Use final content length
                'slide_count': self._estimate_slide_count(markdown_content),
                'original_format': original_format,
                'conversion_required': requires_conversion,
                'images_extracted': extract_images,
                'selected_slides': sorted(selected_slides) if selected_slides is not None else None,
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

    def _resolve_slide_selection(self, processing_file_path: Path, kwargs: dict) -> Tuple[Optional[Set[int]], int, int]:
        """Resolve requested slide ranges into MarkItDown and image extraction bounds.

        Args:
            processing_file_path: PPTX file path used for parsing
            kwargs: Parser keyword arguments, including optional ranges, offset, and limit

        Returns:
            Tuple of selected slide numbers, MarkItDown offset, and MarkItDown limit
        """
        offset = int(kwargs.get('offset', 0) or 0)
        limit = int(kwargs.get('limit', -1) or -1)
        raw_ranges = kwargs.get('ranges')
        if not raw_ranges:
            return None, offset, limit

        total_slides = self._count_pptx_slides(processing_file_path)
        try:
            selected = RangeParser.parse_numeric(str(raw_ranges), total_slides or None)
        except DocumentRangeError as exc:
            logger.warning(f"Invalid PowerPoint ranges '{raw_ranges}', falling back to offset/limit: {exc}")
            return None, offset, limit

        if not selected:
            logger.warning(f"PowerPoint ranges '{raw_ranges}' matched no slides")
            return set(), 0, 0

        selected_set = set(selected)
        contiguous_run = self._first_contiguous_run(selected)
        conversion_offset = max(contiguous_run[0] - 1, 0)
        conversion_limit = len(contiguous_run)
        if len(contiguous_run) != len(selected):
            logger.info(
                "PowerPoint ranges are non-contiguous; MarkItDown conversion is limited "
                f"to slides {contiguous_run[0]}-{contiguous_run[-1]} while image extraction "
                f"uses the exact requested slides: {selected}"
            )
        return selected_set, conversion_offset, conversion_limit

    @staticmethod
    def _first_contiguous_run(slide_numbers: List[int]) -> List[int]:
        """Return the first contiguous run from a 1-based slide number list.

        Args:
            slide_numbers: Requested slide numbers in caller order

        Returns:
            The first contiguous slide run
        """
        if not slide_numbers:
            return []
        run = [slide_numbers[0]]
        for slide_number in slide_numbers[1:]:
            if slide_number != run[-1] + 1:
                break
            run.append(slide_number)
        return run

    @staticmethod
    def _count_pptx_slides(pptx_file_path: Path) -> int:
        """Count slide XML files in a PPTX package.

        Args:
            pptx_file_path: PPTX file path to inspect

        Returns:
            Number of slides found in the package
        """
        try:
            import zipfile

            slide_pattern = re.compile(r"^ppt/slides/slide\d+\.xml$")
            with zipfile.ZipFile(pptx_file_path, 'r') as zip_ref:
                return sum(1 for name in zip_ref.namelist() if slide_pattern.match(name))
        except Exception as exc:
            logger.warning(f"Failed to count PowerPoint slides for {pptx_file_path}: {exc}")
            return 0

    def _estimate_slide_count(self, content: str) -> int:
        """Estimate the number of slides based on content structure.

        Args:
            content: Markdown content from the presentation

        Returns:
            int: Estimated number of slides
        """
        # Look for slide indicators in the markdown
        # This is a rough estimation based on common patterns
        slide_indicators = [
            '# Slide',
            '## Slide',
            '---\n',  # Slide separators
            'Slide '
        ]

        max_count = 0
        for indicator in slide_indicators:
            count = content.count(indicator)
            max_count = max(max_count, count)

        # If no clear indicators, estimate based on heading structure
        if max_count == 0:
            # Count top-level headings as potential slides
            max_count = content.count('\n# ') + (1 if content.startswith('# ') else 0)

        return max(1, max_count)  # At least 1 slide
