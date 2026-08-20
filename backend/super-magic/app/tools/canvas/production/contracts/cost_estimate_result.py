"""积分预估结果模型。"""

from dataclasses import dataclass, field
from typing import Literal

EstimateStatus = Literal["estimated", "unavailable", "not_billable", "failed"]


@dataclass(frozen=True)
class CostEstimateItemResult:
    """描述一个稳定 item_ref 的积分预估结果。"""

    item_ref: str
    status: EstimateStatus
    points: int | float | None = None
    reason: str | None = None
    request_fingerprint: str | None = None

    @property
    def can_continue(self) -> bool:
        """判断该项是否允许进入真实产出。"""
        return self.status in {"estimated", "not_billable"}


@dataclass(frozen=True)
class CostEstimateResult:
    """描述一次批量内容积分预估。"""

    production_rule: str
    items: tuple[CostEstimateItemResult, ...]
    total_points: int | float | None
    estimate_id: str | None
    can_continue: bool
    request_fingerprints: dict[str, str] = field(default_factory=dict)
