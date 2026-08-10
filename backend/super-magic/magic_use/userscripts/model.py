from __future__ import annotations

import hashlib
from dataclasses import dataclass
from enum import StrEnum


class UserscriptRunAt(StrEnum):
    DOCUMENT_START = "document-start"
    DOCUMENT_END = "document-end"
    DOCUMENT_IDLE = "document-idle"


@dataclass(frozen=True, slots=True)
class Userscript:
    name: str
    source: str
    match_patterns: tuple[str, ...]
    exclude_patterns: tuple[str, ...] = ()
    version: str | None = None
    description: str | None = None
    run_at: UserscriptRunAt = UserscriptRunAt.DOCUMENT_END
    enabled: bool = True

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValueError("Userscript name cannot be empty")
        if not self.source.strip():
            raise ValueError(f"Userscript '{self.name}' has no executable source")
        if not self.match_patterns:
            raise ValueError(f"Userscript '{self.name}' must declare at least one @match pattern")

    @property
    def source_hash(self) -> str:
        return hashlib.sha256(self.source.encode("utf-8")).hexdigest()
