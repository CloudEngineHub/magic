from __future__ import annotations

from typing import Protocol

from magic_use.errors import ScriptInjectionError
from magic_use.models.common import JsonValue
from magic_use.scripts.registry import ScriptRegistry


class ScriptPage(Protocol):
    async def evaluate(self, expression: str, arg: JsonValue = None) -> JsonValue: ...


class ScriptInjector:
    def __init__(self, registry: ScriptRegistry) -> None:
        self._registry = registry

    async def ensure(self, page: ScriptPage, name: str) -> None:
        artifact = await self._registry.get(name)
        for dependency in artifact.dependencies:
            await self.ensure(page, dependency)

        result = await page.evaluate(
            """
            payload => {
              const loaded = globalThis.__magicUseScripts || {};
              if (loaded[payload.name] === payload.hash) {
                return {ok: true, reused: true};
              }
              try {
                (0, eval)(payload.source);
                globalThis.__magicUseScripts = globalThis.__magicUseScripts || {};
                globalThis.__magicUseScripts[payload.name] = payload.hash;
                return {ok: true, reused: false};
              } catch (error) {
                return {
                  ok: false,
                  error: error instanceof Error ? error.message : String(error),
                };
              }
            }
            """,
            {"name": artifact.name, "hash": artifact.source_hash, "source": artifact.source},
        )
        if not isinstance(result, dict) or result.get("ok") is not True:
            message = result.get("error", "unknown script error") if isinstance(result, dict) else "invalid result"
            raise ScriptInjectionError(f"Failed to inject browser script '{name}': {message}")

    async def clear_marker(self, page: ScriptPage) -> None:
        await page.evaluate(
            "() => globalThis.MagicMarker?.clear?.()",
        )
