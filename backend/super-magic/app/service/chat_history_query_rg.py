"""聊天记录查询使用的受限 ripgrep 执行器。"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from app.service.chat_history_query_models import HistoryMessage

_MAX_RG_OUTPUT_BYTES = 2 * 1024 * 1024
_RG_TIMEOUT_SECONDS = 30


@dataclass(frozen=True, slots=True)
class _RgResult:
    returncode: int
    stdout: bytes
    stderr: str


class ChatHistoryRipgrep:
    """执行有限范围的 ripgrep，并把中断正确传回 Agent。"""

    def __init__(self, interruption_event: asyncio.Event | None = None) -> None:
        self._interruption_event = interruption_event

    async def matching_paths(self, paths: Sequence[Path], pattern: str) -> set[Path]:
        if not paths:
            return set()
        result = await self._run(
            [
                "rg",
                "--json",
                "--max-count",
                "1",
                "--no-messages",
                "--",
                pattern,
                *[str(path) for path in paths],
            ]
        )
        if result.returncode not in {0, 1}:
            raise ValueError(_rg_error(result.stderr))

        matched: set[Path] = set()
        for line in result.stdout.decode("utf-8", errors="replace").splitlines():
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("type") != "match":
                continue
            path_text = event.get("data", {}).get("path", {}).get("text")
            if isinstance(path_text, str):
                matched.add(Path(path_text).resolve())
        return matched

    async def matching_message_indexes(
        self,
        messages: Sequence[HistoryMessage],
        pattern: str,
        limit: int,
    ) -> set[int]:
        return await self.matching_text_indexes(
            [message.content for message in messages],
            pattern,
            limit,
        )

    async def matching_text_indexes(
        self,
        texts: Sequence[str],
        pattern: str,
        limit: int,
    ) -> set[int]:
        payload = b"\0".join(text.replace("\0", "�").encode("utf-8") for text in texts)
        result = await self._run(
            [
                "rg",
                "--json",
                "--null-data",
                "--line-number",
                "--max-count",
                str(max(limit, 1)),
                "--",
                pattern,
                "-",
            ],
            payload,
        )
        if result.returncode not in {0, 1}:
            raise ValueError(_rg_error(result.stderr))

        indexes: set[int] = set()
        for line in result.stdout.decode("utf-8", errors="replace").splitlines():
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("type") != "match":
                continue
            line_number = event.get("data", {}).get("line_number")
            if isinstance(line_number, int) and 1 <= line_number <= len(texts):
                indexes.add(line_number - 1)
        return indexes

    async def _run(self, command: Sequence[str], input_data: bytes | None = None) -> _RgResult:
        process = await asyncio.create_subprocess_exec(
            *command,
            stdin=asyncio.subprocess.PIPE if input_data is not None else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        communicate_task = asyncio.create_task(process.communicate(input_data))
        interrupt_task: asyncio.Task[bool] | None = None
        try:
            wait_tasks: set[asyncio.Task[object]] = {communicate_task}  # type: ignore[arg-type]
            if self._interruption_event is not None:
                interrupt_task = asyncio.create_task(self._interruption_event.wait())
                wait_tasks.add(interrupt_task)  # type: ignore[arg-type]
            done, _ = await asyncio.wait(
                wait_tasks,
                timeout=_RG_TIMEOUT_SECONDS,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if not done:
                if process.returncode is None:
                    process.kill()
                await process.wait()
                raise TimeoutError(f"ripgrep search timed out after {_RG_TIMEOUT_SECONDS} seconds")
            if interrupt_task is not None and interrupt_task in done:
                if process.returncode is None:
                    process.kill()
                await process.wait()
                raise asyncio.CancelledError
            stdout, stderr = await communicate_task
            if len(stdout) > _MAX_RG_OUTPUT_BYTES:
                raise ValueError("ripgrep output exceeded the internal limit; narrow the history range")
            return _RgResult(process.returncode or 0, stdout, stderr.decode("utf-8", errors="replace"))
        finally:
            if interrupt_task is not None and not interrupt_task.done():
                interrupt_task.cancel()
            if not communicate_task.done():
                communicate_task.cancel()


def _rg_error(stderr: str) -> str:
    detail = " ".join(stderr.strip().split())
    return f"Invalid pattern for ripgrep: {detail or 'check the regular expression syntax'}"


__all__ = ["ChatHistoryRipgrep"]
