import re


SEMANTIC_DATA_ATTRS = {
    "data-role",
    "data-slot",
    "data-slot-role",
    "data-slot-type",
}

_DATA_ATTR_RE = re.compile(
    r"\s+(data-[A-Za-z0-9_.:-]+)(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s\"'=<>`]+))?",
    re.IGNORECASE,
)
_DATA_ATTR_VALUE_RE = re.compile(
    r"\s+(data-[A-Za-z0-9_.:-]+)\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\"'=<>`]+))",
    re.IGNORECASE,
)
_DATA_SELECTOR_RE = re.compile(
    r"\[(data-[A-Za-z0-9_.:-]+)(?:\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\]\s]+)))?\]",
    re.IGNORECASE,
)
_TAG_RE = re.compile(r"<(?!/|!)([A-Za-z][A-Za-z0-9:-]*)([^<>]*?)>", re.DOTALL)
_CLASS_ATTR_RE = re.compile(r"\sclass=(\"|')([^\"']*)\1", re.DOTALL)


def _source_class_name(attr_name: str, value: str) -> str:
    raw = f"pptx-{attr_name[5:]}-{value or 'present'}".lower()
    return re.sub(r"[^a-z0-9_-]+", "-", raw).strip("-") or "pptx-data-attr"


def convert_source_data_selectors_to_classes(html: str) -> str:
    refs = {
        (match.group(1).lower(), match.group(2) or match.group(3) or match.group(4) or "")
        for match in _DATA_SELECTOR_RE.finditer(html)
        if match.group(1).lower() not in SEMANTIC_DATA_ATTRS
    }
    if not refs:
        return html

    def replace_selector(match: re.Match[str]) -> str:
        attr_name = match.group(1).lower()
        value = match.group(2) or match.group(3) or match.group(4) or ""
        return f".{_source_class_name(attr_name, value)}" if (attr_name, value) in refs else match.group(0)

    rewritten = _DATA_SELECTOR_RE.sub(replace_selector, html)

    def replace_tag(match: re.Match[str]) -> str:
        tag_name = match.group(1)
        attrs = match.group(2)
        class_names = []
        for attr_match in _DATA_ATTR_VALUE_RE.finditer(attrs):
            attr_name = attr_match.group(1).lower()
            value = attr_match.group(2) or attr_match.group(3) or attr_match.group(4) or ""
            if (attr_name, value) in refs:
                class_names.append(_source_class_name(attr_name, value))
        if not class_names:
            return match.group(0)

        unique_classes = sorted(set(class_names))
        class_match = _CLASS_ATTR_RE.search(attrs)
        if class_match:
            existing = class_match.group(2).split()
            merged = " ".join(existing + [item for item in unique_classes if item not in existing])
            attrs = attrs[: class_match.start(2)] + merged + attrs[class_match.end(2) :]
        else:
            attrs = f'{attrs} class="{" ".join(unique_classes)}"'
        return f"<{tag_name}{attrs}>"

    return _TAG_RE.sub(replace_tag, rewritten)


def strip_source_data_attributes(html: str) -> str:
    def replace(match: re.Match[str]) -> str:
        attr_name = match.group(1).lower()
        return match.group(0) if attr_name in SEMANTIC_DATA_ATTRS else ""

    return _DATA_ATTR_RE.sub(replace, html)
