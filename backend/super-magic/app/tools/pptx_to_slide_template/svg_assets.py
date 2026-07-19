import re
from html import escape
from pathlib import Path
from typing import List


_SVG_BLOCK_RE = re.compile(r"<svg\b([^>]*)>[\s\S]*?</svg>", re.IGNORECASE)
_ATTR_RE = re.compile(r"\s([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s\"'=<>`]+))?", re.DOTALL)


def _attr_value(attrs: str, name: str) -> str:
    for match in _ATTR_RE.finditer(attrs):
        if match.group(1).lower() != name.lower() or match.group(2) is None:
            continue
        value = match.group(2)
        return value[1:-1] if value[:1] in {"'", '"'} and value[-1:] == value[:1] else value
    return ""


def _has_attr(attrs: str, name: str) -> bool:
    return any(match.group(1).lower() == name.lower() for match in _ATTR_RE.finditer(attrs))


def _set_svg_xmlns(svg: str) -> str:
    opening = re.match(r"<svg\b([^>]*)>", svg, flags=re.IGNORECASE)
    if not opening or _has_attr(opening.group(1), "xmlns"):
        return svg
    return svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)


def _replacement_img(attrs: str, src: str) -> str:
    class_name = _attr_value(attrs, "class")
    data_role = _attr_value(attrs, "data-role")
    aria_hidden = _attr_value(attrs, "aria-hidden") or ("true" if data_role == "decorative" else "")
    parts: List[str] = ["<img"]
    if class_name:
        parts.append(f' class="{escape(class_name, quote=True)} svg-externalized"')
    else:
        parts.append(' class="svg-externalized"')
    parts.append(f' src="{escape(src, quote=True)}"')
    parts.append(' alt=""')
    if data_role:
        parts.append(f' data-role="{escape(data_role, quote=True)}"')
    if aria_hidden:
        parts.append(f' aria-hidden="{escape(aria_hidden, quote=True)}"')
    parts.append(">")
    return "".join(parts)


def externalize_large_inline_svgs(
    html: str,
    *,
    vectors_dir: Path,
    slide_id: str,
    min_chars: int = 2000,
) -> str:
    counter = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal counter
        svg = match.group(0)
        attrs = match.group(1)
        if len(svg) < min_chars or "data-slot" in attrs:
            return svg
        counter += 1
        vectors_dir.mkdir(parents=True, exist_ok=True)
        file_name = f"{slide_id}-vector-{counter:03d}.svg"
        (vectors_dir / file_name).write_text(_set_svg_xmlns(svg), encoding="utf-8")
        return _replacement_img(attrs, f"../images/vectors/{file_name}")

    return _SVG_BLOCK_RE.sub(replace, html)
