"""阅读状态范围表达式解析器。"""

from __future__ import annotations

from collections.abc import Iterable

from ..structure.range_parser import RangeParser, compact_numeric_ranges


class ReadingRangeParser:
    """集中处理阅读状态中的范围表达式兼容规则。"""

    READABLE_UNIT_TYPES = {"page", "slide"}
    UNIT_PREFIXES = ("pages:", "slides:", "sections:")

    @classmethod
    def normalize_for_state(cls, range_text: str, total_units: int, unit_type: str) -> str:
        """将写入阅读状态的范围文本规范化。"""

        text = str(range_text or "").strip()
        normalized = cls.strip_unit_prefix(text)
        if normalized.lower() == "all" and total_units > 0 and unit_type in cls.READABLE_UNIT_TYPES:
            return compact_numeric_ranges(range(1, total_units + 1))
        return text

    @classmethod
    def parse_units(cls, range_text: str, total_units: int) -> list[int]:
        """解析阅读状态范围文本，并兼容历史全量标记。"""

        normalized = cls.strip_unit_prefix(str(range_text or "").strip())
        if normalized.lower() == "all":
            return list(range(1, total_units + 1))
        return RangeParser.parse_numeric(normalized, total_units)

    @classmethod
    def compute_unread_ranges(cls, total_units: int, unit_type: str, consumed_ranges: Iterable[object]) -> list[str]:
        """根据已消费范围计算剩余未读范围。"""

        if total_units <= 0 or unit_type not in cls.READABLE_UNIT_TYPES:
            return []
        consumed_units: set[int] = set()
        for range_text in consumed_ranges:
            consumed_units.update(cls.parse_units(str(range_text), total_units))
        unread = [unit for unit in range(1, total_units + 1) if unit not in consumed_units]
        compact = compact_numeric_ranges(unread)
        return [compact] if compact else []

    @classmethod
    def next_unread_range(cls, total_units: int, unit_type: str, consumed_ranges: Iterable[object], max_units: int) -> str:
        """计算下一段建议读取的未读范围。"""

        if total_units <= 0 or unit_type not in cls.READABLE_UNIT_TYPES:
            return ""
        consumed_units: set[int] = set()
        for range_text in consumed_ranges:
            consumed_units.update(cls.parse_units(str(range_text), total_units))
        unread = [unit for unit in range(1, total_units + 1) if unit not in consumed_units]
        return compact_numeric_ranges(unread[:max_units]) if unread else ""

    @classmethod
    def strip_unit_prefix(cls, range_text: str) -> str:
        """去掉阅读状态范围表达式中的单位前缀。"""

        text = str(range_text or "").strip()
        for prefix in cls.UNIT_PREFIXES:
            if text.startswith(prefix):
                return text.removeprefix(prefix).strip()
        return text
