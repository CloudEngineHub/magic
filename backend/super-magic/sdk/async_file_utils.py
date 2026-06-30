"""
Async file utilities for SDK scripts.

This module is intentionally self-contained and does not import from the
encrypted app package. Skill scripts should use these helpers for file I/O.
"""

from __future__ import annotations

import asyncio
import contextlib
import fcntl
import json
import os
import shutil
from os import PathLike
from pathlib import Path
from typing import Any


PathValue = str | PathLike[str] | Path
_MISSING = object()


async def async_exists(path: PathValue) -> bool:
    return await asyncio.to_thread(Path(path).exists)


async def async_is_dir(path: PathValue) -> bool:
    return await asyncio.to_thread(Path(path).is_dir)


async def async_is_file(path: PathValue) -> bool:
    return await asyncio.to_thread(Path(path).is_file)


async def async_mkdir(path: PathValue, parents: bool = False, exist_ok: bool = False) -> None:
    await asyncio.to_thread(Path(path).mkdir, parents=parents, exist_ok=exist_ok)


async def async_unlink(path: PathValue, missing_ok: bool = True) -> None:
    await asyncio.to_thread(Path(path).unlink, missing_ok=missing_ok)


async def async_read_text(path: PathValue, encoding: str = "utf-8") -> str:
    return await asyncio.to_thread(Path(path).read_text, encoding=encoding)


async def async_write_text(path: PathValue, text: str, encoding: str = "utf-8") -> None:
    path_obj = Path(path)
    await async_mkdir(path_obj.parent, parents=True, exist_ok=True)
    await asyncio.to_thread(path_obj.write_text, text, encoding=encoding)


async def async_read_bytes(path: PathValue) -> bytes:
    return await asyncio.to_thread(Path(path).read_bytes)


async def async_write_bytes(path: PathValue, data: bytes) -> None:
    path_obj = Path(path)
    await async_mkdir(path_obj.parent, parents=True, exist_ok=True)
    await asyncio.to_thread(path_obj.write_bytes, data)


async def async_read_json(path: PathValue, fallback: Any = _MISSING) -> Any:
    try:
        text = await async_read_text(path)
    except FileNotFoundError:
        if fallback is not _MISSING:
            return fallback
        raise
    return await asyncio.to_thread(json.loads, text)


async def async_try_read_json(path: PathValue, fallback: Any = None) -> Any:
    try:
        return await async_read_json(path)
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


async def async_write_json(path: PathValue, value: Any, *, ensure_ascii: bool = False, indent: int | None = 2) -> None:
    text = await asyncio.to_thread(json.dumps, value, ensure_ascii=ensure_ascii, indent=indent)
    await async_write_text(path, f"{text}\n")


@contextlib.asynccontextmanager
async def async_file_lock(path: PathValue):
    path_obj = Path(path)
    await async_mkdir(path_obj.parent, parents=True, exist_ok=True)
    lock_file = await asyncio.to_thread(open, path_obj, "a+", encoding="utf-8")
    try:
        await asyncio.to_thread(fcntl.flock, lock_file.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        await asyncio.to_thread(fcntl.flock, lock_file.fileno(), fcntl.LOCK_UN)
        await asyncio.to_thread(lock_file.close)


async def async_copy2(src: PathValue, dst: PathValue) -> None:
    dst_path = Path(dst)
    await async_mkdir(dst_path.parent, parents=True, exist_ok=True)
    await asyncio.to_thread(shutil.copy2, src, dst)


async def async_move_file(src: PathValue, dst: PathValue) -> None:
    dst_path = Path(dst)
    await async_mkdir(dst_path.parent, parents=True, exist_ok=True)
    await asyncio.to_thread(shutil.move, str(src), str(dst))


async def async_stat(path: PathValue) -> os.stat_result:
    return await asyncio.to_thread(Path(path).stat)
