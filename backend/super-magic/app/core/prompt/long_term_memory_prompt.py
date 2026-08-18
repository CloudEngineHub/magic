"""话题级长期记忆 system prompt 策略。"""

import re

_MEMORY_FILESYSTEM_PROMPT_PATTERN = re.compile(
    r"<memory_filesystem>.*?</memory_filesystem>",
    flags=re.DOTALL,
)


def apply_long_term_memory_prompt_policy(
    system_prompt: str,
    long_term_memory_enabled: bool,
    is_magiclaw: bool,
) -> str:
    """根据 Agent 首次生成 system prompt 时的 CHAT 开关决定是否保留提示词。"""
    if long_term_memory_enabled or is_magiclaw:
        return system_prompt

    return _MEMORY_FILESYSTEM_PROMPT_PATTERN.sub("", system_prompt, count=1).strip()
