#!/usr/bin/env python3
"""Resize a PPTX canvas and scale slide geometry before HTML extraction."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


EMU_PER_CSS_PX = 9525
RATIO_TOLERANCE = 0.01
GEOMETRY_XML_PREFIXES = (
    "ppt/slides/slide",
    "ppt/slideLayouts/slideLayout",
    "ppt/slideMasters/slideMaster",
)

SCALE_X_ATTRS = {
    "x",
    "cx",
    "w",
    "lIns",
    "rIns",
    "marL",
    "marR",
    "indent",
    "defTabSz",
}
SCALE_Y_ATTRS = {"y", "cy", "h", "tIns", "bIns", "marT", "marB"}

TAG_ATTRS = {
    "off": SCALE_X_ATTRS | SCALE_Y_ATTRS,
    "ext": SCALE_X_ATTRS | SCALE_Y_ATTRS,
    "chOff": SCALE_X_ATTRS | SCALE_Y_ATTRS,
    "chExt": SCALE_X_ATTRS | SCALE_Y_ATTRS,
    "pos": SCALE_X_ATTRS | SCALE_Y_ATTRS,
    "gridCol": {"w"},
    "tr": {"h"},
    "bodyPr": {"lIns", "rIns", "tIns", "bIns"},
    "pPr": {"marL", "marR", "indent", "defTabSz"},
    "tcPr": {"marL", "marR", "marT", "marB"},
    "ln": {"w"},
    "rPr": {"sz"},
    "defRPr": {"sz"},
    "endParaRPr": {"sz"},
    "buSzPts": {"val"},
    "spcPts": {"val"},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a resized PPTX copy whose canvas and geometry match a target CSS-pixel size."
    )
    parser.add_argument("--pptx", required=True, help="Source PPTX path.")
    parser.add_argument("--output", required=True, help="Output PPTX path. The source file is not modified.")
    parser.add_argument("--target-width-px", type=float, default=1920, help="Target canvas width in CSS px.")
    parser.add_argument("--target-height-px", type=float, default=1080, help="Target canvas height in CSS px.")
    parser.add_argument(
        "--allow-non-uniform",
        action="store_true",
        help="Allow different X/Y scale factors. Without this flag, source and target ratios must match.",
    )
    return parser.parse_args()


def read_attr(tag: str, name: str) -> str | None:
    match = re.search(rf'\b{name}\s*=\s*["\']([^"\']+)["\']', tag)
    return match.group(1) if match else None


def replace_attr(tag: str, name: str, value: int) -> str:
    pattern = re.compile(rf'(\b{name}\s*=\s*["\'])([^"\']+)(["\'])')
    replacement = rf"\g<1>{value}\g<3>"
    if pattern.search(tag):
        return pattern.sub(replacement, tag, count=1)
    insert_at = -2 if tag.endswith("/>") else -1
    return f'{tag[:insert_at]} {name}="{value}"{tag[insert_at:]}'


def find_slide_size(presentation_xml: str) -> tuple[int, int]:
    match = re.search(r"<[^>]*sldSz\b[^>]*>", presentation_xml)
    if not match:
        raise ValueError("ppt/presentation.xml does not contain p:sldSz.")

    tag = match.group(0)
    cx = read_attr(tag, "cx")
    cy = read_attr(tag, "cy")
    if not cx or not cy:
        raise ValueError("p:sldSz is missing cx or cy.")
    return int(cx), int(cy)


def update_slide_size(presentation_xml: str, target_cx: int, target_cy: int) -> str:
    def replace(match: re.Match[str]) -> str:
        tag = replace_attr(match.group(0), "cx", target_cx)
        return replace_attr(tag, "cy", target_cy)

    return re.sub(r"<[^>]*sldSz\b[^>]*>", replace, presentation_xml, count=1)


def round_scaled(value: str, scale: float) -> str:
    try:
        return str(int(round(float(value) * scale)))
    except ValueError:
        return value


def scale_for_attr(attr_name: str, scale_x: float, scale_y: float) -> float:
    if attr_name in SCALE_X_ATTRS:
        return scale_x
    if attr_name in SCALE_Y_ATTRS:
        return scale_y
    return (scale_x + scale_y) / 2


def scale_tag_attrs(tag: str, allowed_attrs: set[str], scale_x: float, scale_y: float) -> str:
    def replace(match: re.Match[str]) -> str:
        attr_name = match.group("name")
        if attr_name not in allowed_attrs:
            return match.group(0)
        scale = scale_for_attr(attr_name, scale_x, scale_y)
        return f'{match.group("prefix")}{round_scaled(match.group("value"), scale)}{match.group("suffix")}'

    return re.sub(
        r'(?P<prefix>\b(?P<name>[A-Za-z_:][\w:.-]*)\s*=\s*["\'])(?P<value>-?\d+(?:\.\d+)?)(?P<suffix>["\'])',
        replace,
        tag,
    )


def local_tag_name(tag_name: str) -> str:
    return tag_name.rsplit(":", 1)[-1]


def scale_xml_geometry(xml: str, scale_x: float, scale_y: float) -> str:
    def replace(match: re.Match[str]) -> str:
        tag_name = local_tag_name(match.group("name"))
        allowed_attrs = TAG_ATTRS.get(tag_name)
        if not allowed_attrs:
            return match.group(0)
        return scale_tag_attrs(match.group(0), allowed_attrs, scale_x, scale_y)

    return re.sub(r"<(?P<name>[A-Za-z_][\w:.-]*)(?:\s[^<>]*)?>", replace, xml)


def should_scale_xml(name: str) -> bool:
    return name.endswith(".xml") and name.startswith(GEOMETRY_XML_PREFIXES)


def copy_info(info: ZipInfo) -> ZipInfo:
    copied = ZipInfo(info.filename, info.date_time)
    copied.comment = info.comment
    copied.extra = info.extra
    copied.internal_attr = info.internal_attr
    copied.external_attr = info.external_attr
    copied.create_system = info.create_system
    copied.compress_type = ZIP_DEFLATED
    return copied


def validate_ratio(source_cx: int, source_cy: int, target_cx: int, target_cy: int, allow_non_uniform: bool) -> None:
    source_ratio = source_cx / source_cy
    target_ratio = target_cx / target_cy
    if allow_non_uniform or abs(source_ratio - target_ratio) <= RATIO_TOLERANCE:
        return
    raise ValueError(
        "Source and target aspect ratios differ. "
        f"source={source_ratio:.4f}, target={target_ratio:.4f}. "
        "Use --allow-non-uniform only when distortion is acceptable."
    )


def resize_pptx(
    source_path: Path,
    output_path: Path,
    target_width_px: float,
    target_height_px: float,
    allow_non_uniform: bool,
) -> dict[str, float | int | str]:
    if source_path.resolve() == output_path.resolve():
        raise ValueError("--output must be different from --pptx.")

    target_cx = int(round(target_width_px * EMU_PER_CSS_PX))
    target_cy = int(round(target_height_px * EMU_PER_CSS_PX))

    with ZipFile(source_path, "r") as source:
        presentation_xml = source.read("ppt/presentation.xml").decode("utf-8")
        source_cx, source_cy = find_slide_size(presentation_xml)
        validate_ratio(source_cx, source_cy, target_cx, target_cy, allow_non_uniform)

        scale_x = target_cx / source_cx
        scale_y = target_cy / source_cy
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with ZipFile(output_path, "w") as output:
            for info in source.infolist():
                data = source.read(info.filename)
                if info.filename == "ppt/presentation.xml":
                    text = data.decode("utf-8")
                    data = update_slide_size(text, target_cx, target_cy).encode("utf-8")
                elif should_scale_xml(info.filename):
                    text = data.decode("utf-8")
                    data = scale_xml_geometry(text, scale_x, scale_y).encode("utf-8")
                output.writestr(copy_info(info), data)

    return {
        "source": str(source_path),
        "output": str(output_path),
        "source_width_px": source_cx / EMU_PER_CSS_PX,
        "source_height_px": source_cy / EMU_PER_CSS_PX,
        "target_width_px": target_width_px,
        "target_height_px": target_height_px,
        "scale_x": scale_x,
        "scale_y": scale_y,
    }


def main() -> int:
    args = parse_args()
    try:
        result = resize_pptx(
            source_path=Path(args.pptx),
            output_path=Path(args.output),
            target_width_px=args.target_width_px,
            target_height_px=args.target_height_px,
            allow_non_uniform=args.allow_non_uniform,
        )
    except Exception as error:
        print(f"resize_pptx_canvas failed: {error}", file=sys.stderr)
        return 1

    print(
        "\n".join(
            [
                f"output={result['output']}",
                f"source={result['source_width_px']}x{result['source_height_px']}px",
                f"target={result['target_width_px']}x{result['target_height_px']}px",
                f"scale={result['scale_x']}x{result['scale_y']}",
            ]
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
