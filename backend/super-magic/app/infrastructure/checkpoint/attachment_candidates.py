# -*- coding: utf-8 -*-
"""
从 checkpoint 流水中挑选"用户可见的文件变更"候选。

权威数据源是 agfs 侧按空间分区的 operations.json，聚合后的流水包含
各空间（project / user / topic / chat_history，以及未来新增空间）的
条目。用户可见的变更附件只应来自工作区空间——内部状态空间（topic /
chat_history 等，见空间注册表）是 Agent 的内部状态，随 checkpoint
恢复，不应以文件变更的形式呈现给用户。

注意：隐藏路径（以 "." 开头的段，如 .magic/、.venv/）不在此过滤——
隐藏目录里的持久文件（如用户空间的记忆文件）同样要进入变更附件与
文件版本链路。

本模块为纯函数，无重依赖；监听服务委托本模块做选择，测试可直接导入。
"""

from typing import List

from app.core.entity.checkpoint import (
    FileOperation,
    FileSnapshot,
    FileType,
    is_internal_space,
)


def select_changed_attachment_paths(file_snapshots: List[FileSnapshot]) -> List[str]:
    """从聚合流水中挑出需要构造变更附件的文件路径。

    过滤规则：
    - 只保留工作区空间条目；内部状态空间条目（依据空间注册表判定）
      属于 Agent 内部状态，不呈现给用户
    - 跳过目录快照（附件只针对文件）
    - 跳过 DELETED 操作（文件已不存在）
    - 跳过 RENAMED 操作（内容未变，避免无意义的版本创建）
    - 不按"隐藏路径"过滤：以 "." 开头的目录（.magic/、.venv/ 等）里的
      持久文件同样进入变更附件与文件版本链路
    - 按 file_path 首次出现去重，保持出现顺序

    Returns:
        List[str]: workspace 内文件为相对路径，跨项目挂载/referenced 文件
        为 agent 可见绝对路径（即流水记录的原样路径）。
    """
    seen: set = set()
    ordered: List[str] = []
    for snapshot in file_snapshots:
        if is_internal_space(snapshot.space):
            continue
        if snapshot.file_type == FileType.DIRECTORY:
            continue
        if snapshot.operation == FileOperation.DELETED:
            continue
        if snapshot.operation == FileOperation.RENAMED:
            continue

        path = snapshot.file_path
        if path in seen:
            continue

        seen.add(path)
        ordered.append(path)
    return ordered
