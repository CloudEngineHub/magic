from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class ScriptWorld(str, Enum):
    MAIN = "main"


class InjectionPolicy(str, Enum):
    ON_DEMAND = "on_demand"
    DOCUMENT_START = "document_start"
    DOCUMENT_END = "document_end"
    SCREENSHOT = "screenshot"


@dataclass(frozen=True, slots=True)
class ScriptDescriptor:
    name: str
    version: str
    path: Path
    dependencies: tuple[str, ...]
    world: ScriptWorld
    injection_policy: InjectionPolicy
    entrypoint: str


@dataclass(frozen=True, slots=True)
class ScriptArtifact:
    name: str
    version: str
    source: str
    source_hash: str
    dependencies: tuple[str, ...]
    world: ScriptWorld
    injection_policy: InjectionPolicy
    entrypoint: str
