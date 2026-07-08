"""Image extraction utility for PowerPoint file parsing.

This module provides utilities for extracting images from PowerPoint (PPTX/PPT) files.
"""

import asyncio
import os
import time
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import List, Dict, Optional, Set, Tuple

from agentlang.logger import get_logger
from app.utils.async_file_utils import async_mkdir, async_unlink, async_write_bytes

logger = get_logger(__name__)


class ImageExtractorUtil:
    """Utility class for image extraction from PowerPoint files."""

    @staticmethod
    async def extract_pptx_images_by_slides(
        pptx_file_path: Path,
        max_images_per_slide: int = 10,
        slide_numbers: Optional[Set[int]] = None,
    ) -> Dict[int, List[str]]:
        """Extract images from PPTX file organized by slide numbers.

        Args:
            pptx_file_path: Path to the PPTX file
            max_images_per_slide: Maximum number of images to extract per slide
            slide_numbers: Optional 1-based slide numbers to extract

        Returns:
            Dict[int, List[str]]: Dictionary mapping slide numbers to lists of extracted image paths
        """
        extracted_images_by_slide = {}

        try:
            process_id = os.getpid()
            temp_dir = Path(tempfile.gettempdir()) / f"pptx_slide_images_{process_id}"
            await async_mkdir(temp_dir, exist_ok=True)

            image_records = await asyncio.to_thread(
                ImageExtractorUtil._collect_pptx_image_records,
                pptx_file_path,
                max_images_per_slide,
                slide_numbers,
            )
            for slide_number, image_index, image_path, image_data in image_records:
                timestamp: int = int(time.time() * 1000)
                original_name = Path(image_path).name
                img_filename = f"slide_{slide_number:02d}_img_{image_index}_{timestamp}_{original_name}"
                img_path = temp_dir / img_filename
                await async_write_bytes(img_path, image_data)
                extracted_images_by_slide.setdefault(slide_number, []).append(str(img_path))

        except Exception as e:
            logger.error(f"PPTX slide-based image extraction failed: {e}")
            return {}

        total_images = sum(len(images) for images in extracted_images_by_slide.values())
        logger.info(f"Successfully extracted {total_images} images from {len(extracted_images_by_slide)} slides")
        return extracted_images_by_slide

    @staticmethod
    def _collect_pptx_image_records(
        pptx_file_path: Path,
        max_images_per_slide: int,
        slide_numbers: Optional[Set[int]],
    ) -> List[Tuple[int, int, str, bytes]]:
        """Collect PPTX image bytes from the ZIP package in a worker thread.

        Args:
            pptx_file_path: Path to the PPTX file
            max_images_per_slide: Maximum number of images to extract per slide
            slide_numbers: Optional 1-based slide numbers to extract

        Returns:
            Image records as slide number, image index, original path, and bytes
        """
        image_records: List[Tuple[int, int, str, bytes]] = []
        with zipfile.ZipFile(pptx_file_path, 'r') as zip_ref:
            zip_names = set(zip_ref.namelist())
            slide_rels = [f for f in zip_names if f.startswith('ppt/slides/_rels/') and f.endswith('.xml.rels')]
            for slide_rel in slide_rels:
                try:
                    slide_filename = Path(slide_rel).name
                    slide_num_str = slide_filename.replace('slide', '').replace('.xml.rels', '')
                    slide_number = int(slide_num_str)
                    if slide_numbers is not None and slide_number not in slide_numbers:
                        continue

                    rel_content = zip_ref.read(slide_rel).decode('utf-8')
                    root = ET.fromstring(rel_content)
                    image_count = 0
                    for relationship in root.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                        rel_type = relationship.get('Type')
                        if not rel_type or 'image' not in rel_type:
                            continue
                        target = relationship.get('Target')
                        if not target or not target.startswith('../media/'):
                            continue
                        image_path = target.replace('../', 'ppt/')
                        if image_path not in zip_names:
                            continue
                        image_data = zip_ref.read(image_path)
                        if len(image_data) < 500:
                            continue
                        image_count += 1
                        image_records.append((slide_number, image_count, image_path, image_data))
                        if image_count >= max_images_per_slide:
                            break
                except (ValueError, ET.ParseError, KeyError) as e:
                    logger.warning(f"Failed to process slide relationship {slide_rel}: {e}")
                    continue
        return image_records

    @staticmethod
    async def extract_docx_images(docx_file_path: Path, max_images: int = -1) -> List[str]:
        """Extract images from DOCX file using ZIP structure.

        Args:
            docx_file_path: Path to the DOCX file
            max_images: Maximum number of images to extract (-1 for unlimited)

        Returns:
            List[str]: List of extracted image file paths
        """
        extracted_images = []

        try:
            process_id = os.getpid()
            temp_dir = Path(tempfile.gettempdir()) / f"docx_extracted_images_{process_id}"
            await async_mkdir(temp_dir, exist_ok=True)

            image_records = await asyncio.to_thread(
                ImageExtractorUtil._collect_docx_image_records,
                docx_file_path,
                max_images,
            )
            for index, media_file, image_data in image_records:
                timestamp: int = int(time.time() * 1000)
                original_name = Path(media_file).name
                img_filename = f"doc_img_{index}_{timestamp}_{original_name}"
                img_path = temp_dir / img_filename
                await async_write_bytes(img_path, image_data)
                extracted_images.append(str(img_path))

        except Exception as e:
            logger.error(f"DOCX image extraction failed: {e}")
            return []

        logger.info(f"Successfully extracted {len(extracted_images)} images from DOCX")
        return extracted_images

    @staticmethod
    def _collect_docx_image_records(docx_file_path: Path, max_images: int) -> List[Tuple[int, str, bytes]]:
        """Collect DOCX image bytes from the ZIP package in a worker thread.

        Args:
            docx_file_path: Path to the DOCX file
            max_images: Maximum number of images to extract (-1 for unlimited)

        Returns:
            Image records as index, original path, and bytes
        """
        image_records: List[Tuple[int, str, bytes]] = []
        with zipfile.ZipFile(docx_file_path, 'r') as zip_ref:
            media_files = [
                f for f in zip_ref.namelist()
                if f.startswith('word/media/') and
                f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp'))
            ]
            if max_images > 0:
                media_files = media_files[:max_images]
            for index, media_file in enumerate(media_files, start=1):
                try:
                    image_data = zip_ref.read(media_file)
                    if len(image_data) < 500:
                        continue
                    image_records.append((index, media_file, image_data))
                except Exception as e:
                    logger.warning(f"Failed to extract image {media_file}: {e}")
                    continue
        return image_records

    @staticmethod
    async def cleanup_temp_images(image_paths: List[str]) -> None:
        """Clean up temporary image files asynchronously.

        Args:
            image_paths: List of temporary image file paths to clean up
        """
        cleaned_count = 0
        for img_path in image_paths:
            try:
                await async_unlink(img_path)
                cleaned_count += 1
            except Exception as e:
                logger.warning(f"Failed to clean up temporary image {img_path}: {e}")

        if cleaned_count > 0:
            logger.debug(f"Cleaned up {cleaned_count} temporary image files")
