"""Validation helpers for workspace skill names."""

import unicodedata


def is_valid_skill_name(skill_name: str) -> bool:
    """Return whether a skill name is safe as a single workspace directory."""
    if not skill_name or len(skill_name) > 64:
        return False
    if not unicodedata.category(skill_name[0]).startswith("L"):
        return False
    if any(
        not (unicodedata.category(character).startswith(("L", "N")) or character in "-_")
        for character in skill_name
    ):
        return False
    if skill_name.endswith(("-", "_")):
        return False
    return not any(separator in skill_name for separator in ("--", "__", "-_", "_-"))