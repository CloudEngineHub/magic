"""AgentHorizon 数据模型。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class FileReadRecord:
    """文件读取记录，用于后续变化检测、Diff 生成和编辑校验。"""
    path: str                           # 绝对路径
    file_hash: str                      # 文件级变化探测信号（小文件真 hash，大文件 __mtime__ 伪 hash）
    file_mtime_ms: float                # 读取时的 mtime（毫秒）
    file_size_bytes: int                # 读取时的文件大小（bytes）
    file_content: str                   # 整文件文本快照（小文件存全文，大文件置空）
    tool_name: str                      # 触发读取的工具名
    truncated: bool                     # 是否因 token 限制被截断
    metadata: dict = field(default_factory=dict)
    # 留档字段：不参与主链路判断，但保留用于排查
    read_at: str = ""                   # ISO 8601 datetime
    read_ranges: list[tuple[int, int]] = field(default_factory=list)  # 当时读取的行号区间


@dataclass
class PendingNotification:
    """待注入给 LLM 的系统通知，消费后清除。"""
    pushed_at: str   # ISO 8601 datetime
    source: str      # 推送方标识，如 "asr_service"、"im_channel"
    content: str     # 通知正文


@dataclass
class ImageModelState:
    """持久化的图片生成模型状态，用于跨对话检测 sizes 是否变化。"""
    model_id: str = ""
    sizes: list = field(default_factory=list)  # [{"label": "1:1", "value": "1024x1024", "scale": "1K"}, ...]


@dataclass
class VideoModelState:
    """持久化的视频生成模型状态，用于跨对话检测配置是否变化。"""
    model_id: str = ""
    config: dict = field(default_factory=dict)  # video_generation_config 原始 dict


@dataclass(frozen=True)
class SuperMagicWorkspaceContextState:
    """模型上次看到的 Super Magic 工作区信息。"""

    id: str
    name: str

    def to_dict(self) -> dict[str, str]:
        return {"id": self.id, "name": self.name}


@dataclass(frozen=True)
class SuperMagicProjectContextState:
    """模型上次看到的 Super Magic 项目信息。"""

    id: str
    name: str

    def to_dict(self) -> dict[str, str]:
        return {"id": self.id, "name": self.name}


@dataclass(frozen=True)
class SuperMagicTopicContextState:
    """模型上次看到的 Super Magic 话题信息。"""

    id: str
    name: str

    def to_dict(self) -> dict[str, str]:
        return {"id": self.id, "name": self.name}


@dataclass(frozen=True)
class SuperMagicSandboxContextState:
    """模型上次看到的 Super Magic 逻辑沙盒信息。"""

    id: str

    def to_dict(self) -> dict[str, str]:
        return {"id": self.id}


@dataclass(frozen=True)
class SuperMagicProductContextState:
    """模型上次看到的 Super Magic 产品上下文。"""

    workspace: Optional[SuperMagicWorkspaceContextState]
    project: SuperMagicProjectContextState
    topic: SuperMagicTopicContextState
    sandbox: SuperMagicSandboxContextState

    def to_dict(self) -> dict[str, object]:
        return {
            "workspace": self.workspace.to_dict() if self.workspace is not None else None,
            "project": self.project.to_dict(),
            "topic": self.topic.to_dict(),
            "sandbox": self.sandbox.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: object) -> Optional["SuperMagicProductContextState"]:
        if not isinstance(data, dict):
            return None
        project = data.get("project")
        topic = data.get("topic")
        sandbox = data.get("sandbox")
        if not isinstance(project, dict) or not isinstance(topic, dict) or not isinstance(sandbox, dict):
            return None

        project_id = project.get("id")
        project_name = project.get("name")
        topic_id = topic.get("id")
        topic_name = topic.get("name")
        sandbox_id = sandbox.get("id")
        if not all(
            isinstance(value, str)
            for value in (project_id, project_name, topic_id, topic_name, sandbox_id)
        ):
            return None

        workspace_data = data.get("workspace")
        workspace = None
        if workspace_data is not None:
            if not isinstance(workspace_data, dict):
                return None
            workspace_id = workspace_data.get("id")
            workspace_name = workspace_data.get("name")
            if not isinstance(workspace_id, str) or not isinstance(workspace_name, str):
                return None
            workspace = SuperMagicWorkspaceContextState(
                id=workspace_id,
                name=workspace_name,
            )
        return cls(
            workspace=workspace,
            project=SuperMagicProjectContextState(
                id=project_id,
                name=project_name,
            ),
            topic=SuperMagicTopicContextState(
                id=topic_id,
                name=topic_name,
            ),
            sandbox=SuperMagicSandboxContextState(id=sandbox_id),
        )


@dataclass
class ManualContextWindowState:
    """用户对单个真实模型手动设置的上下文上限。"""

    user_manual_max_context_tokens: int = 0


@dataclass
class ContextUsage:
    """当前 LLM 上下文窗口使用情况，由 AgentHorizon.get_context_usage() 返回。"""
    used: int    # 已使用的 token 数
    total: int   # 总上下文窗口大小（0 表示未知）

    @property
    def remaining(self) -> int:
        return max(0, self.total - self.used) if self.total > 0 else 0

    @property
    def is_known(self) -> bool:
        return self.total > 0


@dataclass
class HorizonState:
    """AgentHorizon 的持久化状态。"""
    agent_id: str
    file_records: dict[str, FileReadRecord] = field(default_factory=dict)        # abs_path -> record
    pending_notifications: list[PendingNotification] = field(default_factory=list)
    loaded_skills: list[str] = field(default_factory=list)
    image_model: ImageModelState = field(default_factory=ImageModelState)
    video_model: VideoModelState = field(default_factory=VideoModelState)
    manual_context_windows: dict[str, ManualContextWindowState] = field(default_factory=dict)
    # LLM 模型 baseline：与 image_model/video_model 对齐，持久化避免重启后误判为"模型变更"
    llm_model_id: str = ""
    llm_model_name: str = ""
    # 以下字段表示模型上次已经看到的 baseline，而不是"本轮刚采集到的最新值"
    process_started_at_ns: int = 0  # 上次注入给 LLM 的 Python 进程启动时间（纳秒）
    super_magic_product_context: Optional[SuperMagicProductContextState] = None
    user_preferred_language: str = ""
    workspace_files: str = ""      # 上次注入给 LLM 的工作区树形字符串
    workspace_entries: list = field(default_factory=list)  # 上次注入给 LLM 的结构化工作区条目
    memory: str = ""               # 上次注入给 LLM 的 memory
    client_context: str = ""          # 上次注入给 LLM 的客户端页面上下文
    cli_status: str = ""              # 上次注入给 LLM 的本地已登录 CLI 状态片段
    context_usage_baseline_used: int = 0       # 上次注入给 LLM 的 used tokens
    context_usage_baseline_total: int = 0      # 上次注入给 LLM 的 context window total
    context_usage_baseline_used_pct: int = 0   # 上次注入给 LLM 的 used_pct 整数百分比
    # 当前上下文窗口是否已经完成过 initial_context 注入
    initial_context_injected: bool = False
    # 上次注入时间的日期部分（YYYY-MM-DD），同一天增量注入时省略周几/周数/时区
    last_injected_date: str = ""
