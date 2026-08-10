"""记忆模型输入过滤策略。"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable


class MemoryModelInputFilter:
    """过滤无需进入记忆提取流程的简单寒暄、确认和致谢输入。"""

    _boundary_punctuation_pattern = re.compile(
        r"^[\s，。！？!?、,.；;：:~～]+|[\s，。！？!?、,.；;：:~～]+$"
    )
    _whitespace_pattern = re.compile(r"\s+")
    _default_chinese_inputs = frozenset(
        (
            "你好",
            "您好",
            "嗨",
            "哈喽",
            "你好呀",
            "你好啊",
            "您好呀",
            "在吗",
            "早",
            "早安",
            "早上好",
            "午安",
            "上午好",
            "下午好",
            "晚安",
            "晚上好",
            "谢谢",
            "谢谢你",
            "感谢",
            "感谢你",
            "非常感谢",
            "多谢",
            "谢了",
            "不用谢",
            "辛苦了",
            "麻烦了",
            "好",
            "好的",
            "收到",
            "明白",
            "明白了",
            "知道了",
            "没问题",
            "没事",
            "不用了",
            "再见",
            "拜拜",
            "先这样",
            "先到这里",
            "回头见",
            "下次见",
            "不错",
            "很好",
            "太好了",
            "厉害",
            "完美",
        )
    )
    _default_english_inputs = frozenset(
        (
            "hi",
            "hello",
            "hey",
            "howdy",
            "good to see you",
            "good morning",
            "good afternoon",
            "good evening",
            "good night",
            "thanks",
            "thanks a lot",
            "thank you",
            "many thanks",
            "much appreciated",
            "you're welcome",
            "no problem",
            "no worries",
            "got it",
            "understood",
            "sounds good",
            "ok",
            "okay",
            "sure",
            "all right",
            "bye",
            "goodbye",
            "see you",
            "see you later",
            "take care",
            "nice",
            "great",
            "awesome",
            "perfect",
            "well done",
        )
    )
    _default_skipped_inputs = _default_chinese_inputs | _default_english_inputs

    def __init__(self, skipped_inputs: Iterable[str] | None = None) -> None:
        """初始化过滤器，并允许调用方替换默认过滤词表。"""
        source = skipped_inputs if skipped_inputs is not None else self._default_skipped_inputs
        self._skipped_inputs = frozenset(
            normalized
            for value in source
            if (normalized := self._normalize(value))
        )

    def should_skip(self, content: str) -> bool:
        """判断规范化后的完整输入是否无需进入记忆提取流程。"""
        return self._normalize(content) in self._skipped_inputs

    @classmethod
    def _normalize(cls, content: str) -> str:
        """统一全半角、大小写、空白和首尾标点。"""
        normalized = unicodedata.normalize("NFKC", str(content or "")).casefold().strip()
        normalized = cls._boundary_punctuation_pattern.sub("", normalized)
        return cls._whitespace_pattern.sub(" ", normalized).strip()
