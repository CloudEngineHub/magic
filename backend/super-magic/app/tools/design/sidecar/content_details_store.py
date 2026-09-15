"""V3 Content 级重字段 sidecar 存储。"""

import json
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict

from agentlang.path_manager import PathManager
from app.tools.design.domain.canvas_document import MagicProjectConfigV3
from app.utils.async_file_utils import (
    async_exists,
    async_read_json,
    async_write_text_with_retry,
)

ELEMENT_DETAILS_FILENAME = "element-details.json"
ELEMENT_DETAILS_USER_FILENAME = "element-details-user.json"
ELEMENT_DETAILS_VERSION = "2.0.0"
ELEMENT_DETAIL_SOURCE_USER = "user"
HEAVY_FIELDS = {
    "generateImageRequest",
    "generateVideoRequest",
    "visualUnderstanding",
    "videoGenerationResultMeta",
}


class ContentDetailsStore:
    """负责 V3 Content 重字段的读取、合并、拆分和写入。"""

    def __init__(self, project_path: str):
        """初始化指定 Canvas 项目的 sidecar 存储。"""
        self.project_path = project_path

    async def hydrate(self, config: MagicProjectConfigV3) -> Dict[str, Any]:
        """把 user/agent sidecar 中的重字段合并回 Content。"""
        agent_doc = await self.read_agent_document()
        user_doc = await self.read_user_document()
        for element in config.canvas.iter_elements():
            agent_entry = agent_doc["elements"].get(element.id, {})
            user_entry = user_doc["elements"].get(element.id, {})
            user_wins = user_entry.get("source") == ELEMENT_DETAIL_SOURCE_USER
            for content in element.contents:
                agent_content = agent_entry.get("contentDetails", {}).get(content.content_id, {})
                user_content = user_entry.get("contentDetails", {}).get(content.content_id, {})
                winner = user_content if user_wins and user_content else agent_content or user_content
                for field_name in HEAVY_FIELDS:
                    if field_name in winner:
                        content.fields[field_name] = deepcopy(winner[field_name])
        return self.merge_readable_documents(agent_doc, user_doc)

    async def persist_from_config(self, config: MagicProjectConfigV3) -> Dict[str, Any]:
        """根据完整 V3 配置重建并写入 agent sidecar。"""
        document = self.extract_document(config)
        existing = await self.read_agent_document()
        if document != existing:
            await self._write_document(ELEMENT_DETAILS_FILENAME, document)
        return document

    @staticmethod
    def extract_document(config: MagicProjectConfigV3) -> Dict[str, Any]:
        """从 Content 中提取 V3 重字段文档。"""
        elements: Dict[str, Any] = {}
        for element in config.canvas.iter_elements():
            content_details: Dict[str, Any] = {}
            for content in element.contents:
                details = {
                    field_name: deepcopy(content.fields[field_name])
                    for field_name in HEAVY_FIELDS
                    if content.fields.get(field_name) is not None
                }
                if details:
                    content_details[content.content_id] = details
            if content_details:
                elements[element.id] = {"contentDetails": content_details}
        return {"version": ELEMENT_DETAILS_VERSION, "elements": elements}

    @staticmethod
    def strip_heavy_fields(config: MagicProjectConfigV3) -> None:
        """从待写入主文件的副本中移除 Content 重字段。"""
        for element in config.canvas.iter_elements():
            for content in element.contents:
                for field_name in HEAVY_FIELDS:
                    content.fields.pop(field_name, None)

    async def read_agent_document(self) -> Dict[str, Any]:
        """读取后端可写的 agent sidecar。"""
        return await self._read_document(ELEMENT_DETAILS_FILENAME)

    async def read_user_document(self) -> Dict[str, Any]:
        """读取前端只读的 user sidecar。"""
        return await self._read_document(ELEMENT_DETAILS_USER_FILENAME)

    @staticmethod
    def merge_readable_documents(
        agent_doc: Dict[str, Any],
        user_doc: Dict[str, Any],
    ) -> Dict[str, Any]:
        """合并用于查询展示的 sidecar 文档，不修改来源文档。"""
        result = deepcopy(agent_doc)
        result.setdefault("version", ELEMENT_DETAILS_VERSION)
        result.setdefault("elements", {})
        for element_id, user_entry in user_doc.get("elements", {}).items():
            if user_entry.get("source") == ELEMENT_DETAIL_SOURCE_USER:
                result["elements"][element_id] = deepcopy(user_entry)
            elif element_id not in result["elements"]:
                result["elements"][element_id] = deepcopy(user_entry)
        return result

    async def _read_document(self, filename: str) -> Dict[str, Any]:
        """读取并规范化一个 sidecar 文档。"""
        file_path = self._get_file_path(filename)
        if not await async_exists(file_path):
            return {"version": ELEMENT_DETAILS_VERSION, "elements": {}}
        data = await async_read_json(file_path)
        if not isinstance(data, dict) or not isinstance(data.get("elements"), dict):
            return {"version": ELEMENT_DETAILS_VERSION, "elements": {}}
        return {
            "version": data.get("version") if isinstance(data.get("version"), str) else ELEMENT_DETAILS_VERSION,
            "elements": data["elements"],
        }

    async def _write_document(self, filename: str, document: Dict[str, Any]) -> None:
        """写入并校验一个 sidecar 文档。"""
        content = json.dumps(document, ensure_ascii=False, indent=2)
        await async_write_text_with_retry(
            self._get_file_path(filename),
            content,
            content_validator=lambda written: isinstance(json.loads(written).get("elements"), dict),
        )

    def _get_file_path(self, filename: str) -> Path:
        """返回项目内 sidecar 的绝对路径。"""
        return PathManager.get_workspace_dir() / self.project_path / filename
