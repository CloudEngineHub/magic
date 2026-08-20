"""RetryContentInput 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams
from app.tools.canvas.application.commands import RetryContentCommand

from app.tools.canvas.schemas.inputs.generation_override_input import GenerationOverrideInput

class RetryContentInput(BaseToolParams):
    """失败 Content 重试参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_id: str
    content_id: str
    generation_override: GenerationOverrideInput | None = None

    def to_command(self) -> RetryContentCommand:
        """转换为失败 Content 重试应用命令。"""
        return RetryContentCommand(
            item_ref=self.item_ref,
            element_id=self.element_id,
            content_id=self.content_id,
            generation_override=self.generation_override.to_command() if self.generation_override else None,
        )
