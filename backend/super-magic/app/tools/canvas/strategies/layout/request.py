"""布局策略请求模型。"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class LayoutStrategyRequest:
    """描述一次布局计算所需的稳定输入。"""

    element_id: str
    options: dict[str, Any]
    index: int = 0
