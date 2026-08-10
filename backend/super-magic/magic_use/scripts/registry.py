from __future__ import annotations

import asyncio
import hashlib
from pathlib import Path

import aiofiles

from magic_use.errors import BrowserErrorCode, BrowserSDKError
from magic_use.scripts.artifact import (
    InjectionPolicy,
    ScriptArtifact,
    ScriptDescriptor,
    ScriptWorld,
)


class ScriptRegistry:
    """显式管理 SDK 自带的浏览器内脚本，不扫描目录推断能力。"""

    def __init__(self, script_dir: Path | None = None) -> None:
        base_dir = script_dir or Path(__file__).parent.parent / "js"
        self._descriptors = {
            "lens": ScriptDescriptor(
                name="lens",
                version="1",
                path=base_dir / "lens.js",
                dependencies=(),
                world=ScriptWorld.MAIN,
                injection_policy=InjectionPolicy.ON_DEMAND,
                entrypoint="MagicLens.readAsMarkdown",
            ),
            "pure": ScriptDescriptor(
                name="pure",
                version="1",
                path=base_dir / "pure.js",
                dependencies=(),
                world=ScriptWorld.MAIN,
                injection_policy=InjectionPolicy.DOCUMENT_END,
                entrypoint="__magicUseScripts.pure",
            ),
            "touch": ScriptDescriptor(
                name="touch",
                version="2",
                path=base_dir / "touch.js",
                dependencies=(),
                world=ScriptWorld.MAIN,
                injection_policy=InjectionPolicy.ON_DEMAND,
                entrypoint="MagicTouch.collectProbe",
            ),
            "marker": ScriptDescriptor(
                name="marker",
                version="2",
                path=base_dir / "marker.js",
                dependencies=(),
                world=ScriptWorld.MAIN,
                injection_policy=InjectionPolicy.SCREENSHOT,
                entrypoint="MagicMarker.render",
            ),
        }
        self._artifacts: dict[str, ScriptArtifact] = {}
        self._lock = asyncio.Lock()

    @property
    def names(self) -> tuple[str, ...]:
        return tuple(self._descriptors)

    async def get(self, name: str) -> ScriptArtifact:
        cached = self._artifacts.get(name)
        if cached is not None:
            return cached

        async with self._lock:
            cached = self._artifacts.get(name)
            if cached is not None:
                return cached

            descriptor = self._descriptors.get(name)
            if descriptor is None:
                raise BrowserSDKError(BrowserErrorCode.SCRIPT_NOT_FOUND, f"Unknown browser script: {name}")

            try:
                async with aiofiles.open(descriptor.path, mode="r", encoding="utf-8") as script_file:
                    source = await script_file.read()
            except FileNotFoundError as error:
                raise BrowserSDKError(
                    BrowserErrorCode.SCRIPT_NOT_FOUND,
                    f"Browser script file does not exist: {descriptor.path}",
                ) from error

            artifact = ScriptArtifact(
                name=descriptor.name,
                version=descriptor.version,
                source=source,
                source_hash=hashlib.sha256(source.encode("utf-8")).hexdigest(),
                dependencies=descriptor.dependencies,
                world=descriptor.world,
                injection_policy=descriptor.injection_policy,
                entrypoint=descriptor.entrypoint,
            )
            self._artifacts[name] = artifact
            return artifact
