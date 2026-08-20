"""AddContentInput 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams

from app.tools.canvas.schemas.inputs.content_input import ContentInput

class AddContentInput(BaseToolParams):
    """追加 Content 参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_id: str
    content: ContentInput
