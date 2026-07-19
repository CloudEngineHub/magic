from pathlib import Path
from typing import Dict, List


def collage_grid_size(count: int) -> tuple[int, int]:
    if count <= 1:
        return 1, 1
    if count <= 2:
        return 2, 1
    if count <= 3:
        return 3, 1
    if count <= 4:
        return 2, 2
    if count <= 6:
        return 3, 2
    return 3, 3


def create_preview_images_from_rendered_pages(page_images: List[Path], preview_dir: Path) -> Dict[str, str]:
    from PIL import Image

    preview_dir.mkdir(parents=True, exist_ok=True)
    cover_path = preview_dir / "cover.png"
    collage_path = preview_dir / "collage.png"
    selected = page_images[:9]
    if not selected:
        return {}

    with Image.open(selected[0]) as first_image:
        cover = first_image.convert("RGB")
        cover.save(cover_path)
        source_width, source_height = cover.size

    cols, rows = collage_grid_size(len(selected))
    cell_width = 640
    cell_height = max(1, round(cell_width * source_height / source_width))
    gap = 16
    padding = 24
    canvas_width = cols * cell_width + (cols - 1) * gap + padding * 2
    canvas_height = rows * cell_height + (rows - 1) * gap + padding * 2
    collage = Image.new("RGB", (canvas_width, canvas_height), "#f3f4f6")

    for index, image_path in enumerate(selected):
        col = index % cols
        row = index // cols
        with Image.open(image_path) as raw_image:
            tile = raw_image.convert("RGB")
            tile.thumbnail((cell_width, cell_height), Image.Resampling.LANCZOS)
            frame = Image.new("RGB", (cell_width, cell_height), "white")
            x = (cell_width - tile.width) // 2
            y = (cell_height - tile.height) // 2
            frame.paste(tile, (x, y))
        target_x = padding + col * (cell_width + gap)
        target_y = padding + row * (cell_height + gap)
        collage.paste(frame, (target_x, target_y))

    collage.save(collage_path)
    return {
        "thumbnail_image": "previews/cover.png",
        "collage_image": "previews/collage.png",
    }


async def generate_preview_images(source_path: Path, template_dir: Path) -> Dict[str, str]:
    import fitz
    from app.utils.file_parse.utils.libreoffice_util import LibreOfficeUtil

    preview_dir = template_dir / "previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = await LibreOfficeUtil.convert_document(source_path, "pdf", f"{template_dir.name}_preview")
    page_images: List[Path] = []
    try:
        try:
            with fitz.open(str(pdf_path)) as document:
                page_count = min(document.page_count, 9)
                if page_count == 0:
                    raise RuntimeError("Preview image generation failed: PDF has no pages")
                for page_index in range(page_count):
                    page = document.load_page(page_index)
                    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                    page_path = preview_dir / f"slide-{page_index + 1:03d}.png"
                    pixmap.save(str(page_path))
                    page_images.append(page_path)
            return create_preview_images_from_rendered_pages(page_images, preview_dir)
        finally:
            for page_image in page_images:
                page_image.unlink(missing_ok=True)
    finally:
        try:
            pdf_path.unlink(missing_ok=True)
        except OSError:
            pass
