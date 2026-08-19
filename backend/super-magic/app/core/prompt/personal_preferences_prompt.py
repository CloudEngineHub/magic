"""将个人偏好应用到 Agent 的 system prompt。"""

import re

from app.core.entity.message.personal_preferences import PersonalPreferences

_MEMORY_FILESYSTEM_PROMPT_PATTERN = re.compile(
    r"<memory_filesystem>.*?</memory_filesystem>",
    flags=re.DOTALL,
)


def apply_personal_preferences(
    system_prompt: str,
    personal_preferences: PersonalPreferences,
    is_magiclaw: bool,
) -> str:
    """根据个人偏好和 Agent 类型应用 system prompt 策略。"""
    if personal_preferences.long_term_memory_enabled or is_magiclaw:
        return system_prompt

    return _MEMORY_FILESYSTEM_PROMPT_PATTERN.sub("", system_prompt, count=1).strip()
