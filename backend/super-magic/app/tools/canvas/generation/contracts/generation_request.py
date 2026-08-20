"""生成请求模型。"""

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class GenerationRequest:
    """提交一次生成所需的最小请求。"""

    project_path: str
    element_id: str
    content_id: str
    element_type: str
    parameters: dict[str, Any] = field(default_factory=dict)
