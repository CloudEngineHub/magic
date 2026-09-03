from dataclasses import field
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator
from pydantic.dataclasses import dataclass


class SubagentStatus(StrEnum):
    IDLE = "idle"
    PENDING = "pending"
    RUNNING = "running"
    INTERRUPTED = "interrupted"
    DONE = "done"
    ERROR = "error"


class SubagentQueryStatus(StrEnum):
    NOT_FOUND = "not_found"
    AMBIGUOUS = "ambiguous"
    IDLE = SubagentStatus.IDLE
    PENDING = SubagentStatus.PENDING
    RUNNING = SubagentStatus.RUNNING
    INTERRUPTED = SubagentStatus.INTERRUPTED
    DONE = SubagentStatus.DONE
    ERROR = SubagentStatus.ERROR


class SubagentExecutionMode(StrEnum):
    SYNC = "sync"
    BACKGROUND = "background"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class SubagentPayload:
    """`call_subagent` 的结构化返回载荷。"""

    agent_name: str
    agent_id: str
    status: SubagentStatus
    mode: SubagentExecutionMode
    # Agent 请求的基础名称，例如 `research`；agent_id 是系统最终分配的 `research-2`。
    requested_agent_id: Optional[str] = None
    resumed: bool = False
    task_label: Optional[str] = None
    display_name: Optional[str] = None
    result: Optional[str] = None
    error: Optional[str] = None
    resume_hint: Optional[str] = None
    warning: Optional[str] = None


@dataclass
class SubagentQueryResult:
    """`wait_for_subagents` 的单项查询结果。"""

    agent_id: str
    status: SubagentQueryStatus
    agent_name: Optional[str] = None
    task_label: Optional[str] = None
    display_name: Optional[str] = None
    result: Optional[str] = None
    error: Optional[str] = None
    # 仅在 status=running（超时但仍在执行）时填充，内容为子 Agent 最近一条 assistant 消息，供父 Agent 了解进度
    last_activity: Optional[str] = None
    # 仅在 pattern 匹配时填充，内容为匹配到的 assistant 消息（截断至 _LAST_ACTIVITY_MAX_CHARS）
    matched_content: Optional[str] = None


@dataclass
class SubagentSessionConfigBlock:
    """`.session.json` 中沿用的模型配置块。"""

    model_id: Optional[str] = None
    image_model_id: Optional[str] = None
    image_model_sizes: Any = None


@dataclass
class SubagentSessionDocument:
    """包含 subagent 运行态的完整 `.session.json` 文档。

        session.json
        ├─ last / current -> ChatHistory 管理的模型与 Agent 配置
        ├─ subagent       -> SubagentRuntimeStore 管理的执行状态
        └─ extra_fields   -> 当前代码不认识、但必须原样保留的未来字段

    多个 owner 共用同一个文件时，谁更新自己的区域，谁就必须保留其他区域。否则保存
    一次运行状态就可能把模型配置或未来新增字段整个覆盖掉。
    """

    last: SubagentSessionConfigBlock = field(default_factory=SubagentSessionConfigBlock)
    current: SubagentSessionConfigBlock = field(default_factory=SubagentSessionConfigBlock)
    subagent: Optional["SubagentSessionState"] = None
    extra_fields: dict[str, Any] = field(default_factory=dict)


class SubagentSessionState(BaseModel):
    """持久化到 .session.json 的 subagent 会话运行态。"""

    agent_name: str
    agent_id: str
    # 只记录直接父 Agent，不通过目录层级推断父子关系。
    parent_agent_name: Optional[str] = None
    parent_agent_id: Optional[str] = None
    # 保留基础名称和最终 ID，便于排查“模型请求名”和“实际会话地址”不一致的情况。
    requested_agent_id: Optional[str] = None
    # 不能仅凭文件是否存在推断继续意图；这里记录调用方是否显式传了 resume=true。
    resumed: bool = False
    task_label: Optional[str] = None
    status: SubagentStatus = SubagentStatus.IDLE
    last_prompt_digest: Optional[str] = None
    last_result: Optional[str] = None
    last_error: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    active_tool_call_id: Optional[str] = None
    last_tool_call_id: Optional[str] = None
    cached_tool_result: Optional[SubagentPayload] = None
    interrupt_requested: bool = False
    display_name: Optional[str] = None
    warning: Optional[str] = None
    interrupt_reason: Optional[str] = None

    @model_validator(mode="after")
    def validate_lifecycle(self) -> "SubagentSessionState":
        if self.status in {SubagentStatus.PENDING, SubagentStatus.RUNNING} and self.started_at is None:
            raise ValueError("started_at is required when subagent status is pending or running")

        if self.status in {SubagentStatus.DONE, SubagentStatus.INTERRUPTED, SubagentStatus.ERROR}:
            if self.started_at is None:
                raise ValueError("started_at is required when subagent status is terminal")
            if self.finished_at is None:
                raise ValueError("finished_at is required when subagent status is terminal")

        return self
