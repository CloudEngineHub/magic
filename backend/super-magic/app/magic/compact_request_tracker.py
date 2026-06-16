from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from uuid import uuid4


class CompactRequestState(StrEnum):
    """主 Agent 直接注入的 compact 请求当前状态。"""

    NO_REQUEST = "no_request"
    COMPACT_MODEL = "compact_model"
    MAIN_MODEL_FALLBACK = "main_model_fallback"


@dataclass
class CompactRequestTracker:
    """主 Agent 直接注入的 compact 请求跟踪器。

    这个类只记录请求状态，不切模型、不改 chat history、不调用 LLM。它解决的是
    `Agent` 原来用一个 bool 同时表达两件事的问题：

    1. chat history 中是否已经注入过 compact 请求，后续阈值检查不能重复注入。
    2. 当前 compact 请求是否仍然应该保留 compact 模型处理。

    这两件事在 compact 模型失败后会分开：

    ```text
    正常路径
    NO_REQUEST
      -> start()
    COMPACT_MODEL
      -> compact_chat_history 工具返回 summary
      -> finish()
    NO_REQUEST

    compact 模型失败后的 fallback 路径
    NO_REQUEST
      -> start()
    COMPACT_MODEL
      -> compact 模型请求失败，恢复主模型
      -> fallback_to_main_model()
    MAIN_MODEL_FALLBACK
      -> 仍然处理同一条 compact 请求，不能重复注入第二条请求
      -> fallback LLM 成功或失败后 finish()
    NO_REQUEST
    ```

    Mock 例子：

    ```text
    当前默认配置下，main model 和 compact model 都是 deepseek-v4-flash。
    即使模型名相同，Agent 仍会进入 compact 请求状态：
    - has_pending_request 防止重复注入第二条 compact 请求
    - should_keep_compact_model 表示下一次 LLM 调用仍属于 compact 请求
    如果未来 COMPACT_MODEL_ID 覆盖成其它模型，这套状态语义不需要变化。

    当前模型 = deepseek-v4-flash
    chat_history 最后一条 = "请立刻调用 compact_chat_history"
    state = COMPACT_MODEL

    deepseek-v4-flash 请求失败后：
      - Agent 会先恢复主模型 deepseek-v4-flash
      - state 不能立刻变成 NO_REQUEST
      - 因为那条 compact 请求仍在 chat_history 里
      - 所以 state 必须变成 MAIN_MODEL_FALLBACK

    下一次 LLM 调用前再做压缩检查：
      has_pending_request = True
      -> 不重复注入 compact 请求
      should_keep_compact_model = False
      -> 不再保留 compact 模型
    ```

    维护规则：
    - `start()` 只在真正把 compact 请求写入 chat history 前后调用。
    - `fallback_to_main_model()` 只表示「同一条请求改由主模型继续处理」。
    - `finish()` 只在这条 compact 请求已经成功、失败、放弃或 Agent 结束兜底时调用。
    """

    state: CompactRequestState = CompactRequestState.NO_REQUEST
    generation: str = ""
    reason: str = ""

    @property
    def has_pending_request(self) -> bool:
        """是否已有 compact 请求被注入但还没有结束。"""
        return self.state != CompactRequestState.NO_REQUEST

    @property
    def should_keep_compact_model(self) -> bool:
        """下一轮 LLM 调用前是否必须继续保留 compact 模型。"""
        return self.state == CompactRequestState.COMPACT_MODEL

    def start(self, reason: str) -> None:
        """标记一条 compact 请求已开始处理。

        已经有 pending 请求时保持原 generation 和 reason，避免硬阈值、reactive
        compact、重试检查同时触发时覆盖第一条请求的诊断信息。
        """
        if self.has_pending_request:
            return
        self.state = CompactRequestState.COMPACT_MODEL
        self.generation = uuid4().hex
        self.reason = reason

    def fallback_to_main_model(self, reason: str) -> None:
        """compact 模型失败后，改由主模型处理同一条 compact 请求。"""
        if not self.has_pending_request:
            return
        self.state = CompactRequestState.MAIN_MODEL_FALLBACK
        self.reason = reason

    def finish(self) -> None:
        """结束当前 compact 请求；幂等，便于 finally 和兜底清理重复调用。"""
        self.state = CompactRequestState.NO_REQUEST
        self.generation = ""
        self.reason = ""
