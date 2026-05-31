"""Element Details Store

管理 element-details.json 的读写，以及把重字段从主文件元素上拆分出来。

element-details.json 承载从 canvas 元素上拆出的重字段（按 element.id 归档），
让主文件 magic.project.js 只保留渲染必要的轻字段。

数据形态：
    {
      "version": "1.0.0",
      "elements": {
        "<element-id>": { "generateImageRequest": {...}, ... }
      }
    }
"""

import json
import os
from dataclasses import asdict, is_dataclass
from typing import Any, Dict

from agentlang.logger import get_logger
from agentlang.path_manager import PathManager
from app.tools.design.utils.magic_project_design_parser import (
    MagicProjectConfig,
    flatten_all_elements,
)
from app.utils.async_file_utils import (
    async_mkdir,
    async_try_read_json,
    async_write_text_with_retry,
)

logger = get_logger(__name__)

ELEMENT_DETAILS_FILENAME = "element-details.json"
ELEMENT_DETAILS_USER_FILENAME = "element-details-user.json"
ELEMENT_DETAILS_VERSION = "1.0.0"
ELEMENT_DETAIL_SOURCE_USER = "user"

# 需要从主文件拆出的重字段（与方案 2.4 表一致）
HEAVY_FIELDS = ("generateImageRequest", "generateVideoRequest", "visualUnderstanding")


def _get_element_details_path(
    project_path: str, filename: str = ELEMENT_DETAILS_FILENAME
) -> str:
    """获取 element-details sidecar 的绝对路径。"""
    workspace_dir = PathManager.get_workspace_dir()
    base_path = workspace_dir / project_path
    return str(base_path / filename)


def _empty_document() -> Dict[str, Any]:
    return {"version": ELEMENT_DETAILS_VERSION, "elements": {}}


def _serialize_heavy_value(value: Any) -> Any:
    """把重字段的值序列化为可 JSON 化的结构，dataclass 转 dict 并去除 None。"""
    if is_dataclass(value) and not isinstance(value, type):
        data = asdict(value)
        return {k: v for k, v in data.items() if v is not None}
    return value


def extract_element_details(config: MagicProjectConfig) -> Dict[str, Dict[str, Any]]:
    """从内存 config 的元素上提取 HEAVY_FIELDS，按 element.id 归档。

    只收集当前内存里确实带重字段的元素（通常是本轮 mutator 刚写上去的）。
    返回 {element_id: {heavy_field: value}}，不含没有任何重字段的元素。
    """
    result: Dict[str, Dict[str, Any]] = {}
    for element in flatten_all_elements(config):
        detail: Dict[str, Any] = {}
        for field_name in HEAVY_FIELDS:
            value = getattr(element, field_name, None)
            if value is None:
                continue
            detail[field_name] = _serialize_heavy_value(value)
        if detail:
            result[element.id] = detail
    return result


def strip_heavy_fields(config: MagicProjectConfig) -> None:
    """原地把 config 元素上的 HEAVY_FIELDS 置空，供主文件写入。"""
    for element in flatten_all_elements(config):
        for field_name in HEAVY_FIELDS:
            if getattr(element, field_name, None) is not None:
                setattr(element, field_name, None)


def merge_element_details(
    existing: Dict[str, Any], new: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    """按 element.id 增量合并；同 id 内 shallow-merge，新值覆盖旧值。

    Args:
        existing: 已有的完整 sidecar 文档（含 version / elements）
        new: extract_element_details 的输出 {element_id: detail}

    Returns:
        合并后的完整 sidecar 文档
    """
    merged_elements: Dict[str, Any] = dict(existing.get("elements", {}))
    for element_id, detail in new.items():
        base = dict(merged_elements.get(element_id, {}))
        base.update(detail)
        merged_elements[element_id] = base
    return {"version": ELEMENT_DETAILS_VERSION, "elements": merged_elements}


def prune_orphan_details(
    details: Dict[str, Any], config: MagicProjectConfig
) -> Dict[str, Any]:
    """删除在 config 中已不存在的 element.id 详情条目（处理删除）。"""
    valid_ids = {element.id for element in flatten_all_elements(config)}
    pruned = {
        element_id: detail
        for element_id, detail in details.get("elements", {}).items()
        if element_id in valid_ids
    }
    return {"version": ELEMENT_DETAILS_VERSION, "elements": pruned}


async def _read_element_details_file(project_path: str, filename: str) -> Dict[str, Any]:
    """读取指定 element-details sidecar，不存在或损坏时返回空文档。"""
    file_path = _get_element_details_path(project_path, filename)
    data = await async_try_read_json(file_path)

    if not isinstance(data, dict) or not isinstance(data.get("elements"), dict):
        return _empty_document()

    return {
        "version": data.get("version", ELEMENT_DETAILS_VERSION),
        "elements": data["elements"],
    }


async def read_element_details(project_path: str) -> Dict[str, Any]:
    """读取后端维护的 element-details.json，不存在或损坏时返回空文档。"""
    return await _read_element_details_file(project_path, ELEMENT_DETAILS_FILENAME)


async def read_user_element_details(project_path: str) -> Dict[str, Any]:
    """读取前端维护的 element-details-user.json，不存在或损坏时返回空文档。"""
    return await _read_element_details_file(project_path, ELEMENT_DETAILS_USER_FILENAME)


def merge_readable_element_details(
    agent_details: Dict[str, Any], user_details: Dict[str, Any]
) -> Dict[str, Any]:
    """合并消费侧可读详情。

    与前端回填优先级保持一致：
    source=user 的用户条目 > 后端 baseline 条目 > 无 source 的用户条目。
    该合并只用于读取，不用于后端写入，避免污染后端 baseline。
    """
    agent_elements = agent_details.get("elements", {})
    user_elements = user_details.get("elements", {})
    merged_elements: Dict[str, Any] = {}

    for element_id in set(agent_elements) | set(user_elements):
        user_entry = user_elements.get(element_id)
        agent_entry = agent_elements.get(element_id)

        if (
            isinstance(user_entry, dict)
            and user_entry.get("source") == ELEMENT_DETAIL_SOURCE_USER
        ):
            winner = user_entry
        elif agent_entry is not None:
            winner = agent_entry
        else:
            winner = user_entry

        if isinstance(winner, dict):
            merged_elements[element_id] = {
                key: value
                for key, value in winner.items()
                if key in HEAVY_FIELDS and value is not None
            }

    return {"version": ELEMENT_DETAILS_VERSION, "elements": merged_elements}


async def read_readable_element_details(project_path: str) -> Dict[str, Any]:
    """读取后端 baseline，并退避合并前端 user sidecar 供消费链路使用。"""
    agent_details = await read_element_details(project_path)
    user_details = await read_user_element_details(project_path)
    return merge_readable_element_details(agent_details, user_details)

async def write_element_details(project_path: str, details: Dict[str, Any]) -> None:
    """写入 element-details.json（异步 + 写后校验，适应 TOS 同步延迟）。"""
    file_path = _get_element_details_path(project_path)

    parent_dir = os.path.dirname(file_path)
    await async_mkdir(parent_dir, parents=True, exist_ok=True)

    content = json.dumps(details, ensure_ascii=False, indent=2)
    await async_write_text_with_retry(
        file_path,
        content,
        content_validator=lambda c: '"elements"' in c,
    )
    logger.info(f"element-details.json written: {file_path}")
