"""第三方 CLI 注册表持久化。"""

from __future__ import annotations

import json

from app.service.cli_manager.constants import SCHEMA_VERSION
from app.service.cli_manager.models import CliManagerError, CliManagerPaths, CliRegistryData, CliRegistryItem
from app.utils.async_file_utils import async_exists, async_mkdir, async_read_json, async_replace, async_write_text


class CliRegistryStore:
    """以原子方式读写 CLI 管理器注册表。"""

    def __init__(self, paths: CliManagerPaths) -> None:
        """创建绑定到指定路径布局的注册表存储。"""
        self._paths = paths

    async def ensure_directories(self) -> None:
        """确保基础目录布局已经创建。"""
        for path in (
            self._paths.root_dir,
            self._paths.bin_dir,
            self._paths.apps_dir,
            self._paths.prefixes_dir,
            self._paths.state_dir,
            self._paths.registry_file.parent,
        ):
            await async_mkdir(path, parents=True, exist_ok=True)

    async def read(self) -> CliRegistryData:
        """读取注册表文件；文件不存在时返回空注册表。"""
        if not await async_exists(self._paths.registry_file):
            return {"schema_version": SCHEMA_VERSION, "items": []}
        try:
            data: object = await async_read_json(self._paths.registry_file)
        except json.JSONDecodeError as exc:
            raise CliManagerError("registry_corrupted", "CLI registry is corrupted.", error=str(exc)) from exc
        if not isinstance(data, dict):
            raise CliManagerError("registry_corrupted", "CLI registry root must be an object.")
        schema_version = data.get("schema_version", SCHEMA_VERSION)
        raw_items = data.get("items", [])
        if not isinstance(raw_items, list):
            raise CliManagerError("registry_corrupted", "CLI registry items must be a list.")
        items = [
            CliRegistryItem.from_dict(item).to_dict()
            for item in raw_items
            if isinstance(item, dict)
        ]
        return {
            "schema_version": schema_version if isinstance(schema_version, int) else SCHEMA_VERSION,
            "items": items,
        }

    async def write(self, registry: CliRegistryData) -> None:
        """原子写入注册表文件。"""
        await async_mkdir(self._paths.registry_file.parent, parents=True, exist_ok=True)
        tmp_path = self._paths.registry_file.with_suffix(".json.tmp")
        await async_write_text(tmp_path, json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")
        await async_replace(tmp_path, self._paths.registry_file)

    def upsert_item(self, registry: CliRegistryData, item: CliRegistryItem) -> None:
        """按名称插入或替换注册表记录。"""
        items = [
            data
            for data in registry["items"]
            if data["name"] != item.name
        ]
        items.append(item.to_dict())
        registry["items"] = items

    def find_item(self, registry: CliRegistryData, name: str) -> CliRegistryItem | None:
        """按 CLI 名称查找注册表记录。"""
        for data in registry["items"]:
            if data["name"] == name:
                return CliRegistryItem.from_dict(data)
        return None

    def remove_item(self, registry: CliRegistryData, name: str) -> None:
        """按 CLI 名称移除注册表记录。"""
        registry["items"] = [
            data
            for data in registry["items"]
            if data["name"] != name
        ]
