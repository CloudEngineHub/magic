"""Get slides template package download URL by code."""

import json
from typing import ClassVar

from pydantic import Field, field_validator

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.infrastructure.magic_service.client import MagicServiceClient
from app.tools.core import BaseTool, BaseToolParams, tool

logger = get_logger(__name__)


class GetSlidesTemplateDownloadUrlParams(BaseToolParams):
    code: str = Field(
        ...,
        description=(
            "<!--zh: 幻灯片模板 code，例如 PPT- 开头的系统生成值。必须来自模板列表、用户选择或上游明确传入，不要编造、改写大小写。-->"
            "Slides template code, for example a system-generated value starting with PPT-. It must come "
            "from the template list, the user's selection, or an explicit upstream value; do not invent it "
            "or rewrite its casing."
        ),
    )

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        code = value.strip() if isinstance(value, str) else ""
        if not code:
            raise ValueError("code is required")
        return code


@tool(name="get_slides_template_download_url")
class GetSlidesTemplateDownloadUrl(BaseTool[GetSlidesTemplateDownloadUrlParams]):
    """<!--zh
    根据幻灯片模板 code 获取模板 zip 包的临时下载链接。
    仅在 skill 或 Code Mode 已拿到明确模板 code，需要下载或读取模板文件时使用。
    -->
    Get a temporary download URL for a slides template zip package by code.
    Use this only when a skill or Code Mode already has an explicit template code and needs to download
    or inspect the template files.
    """

    code_mode_only: ClassVar[bool] = True

    def get_prompt_hint(self) -> str:
        return """<!--zh
拿到明确的幻灯片模板 code 后，如需下载模板 zip 包，可在 run_sdk_snippet 中调用：

```python
from sdk.tool import tool

result = tool.call("get_slides_template_download_url", {"code": template_code})
template_file_url = result.data["template_file_url"]
```

code 必须原样来自模板列表、用户选择或上游明确传入；不要猜测、编造、转换大小写或重命名。
-->
When you already have an explicit slides template code and need the template zip package, call this tool from run_sdk_snippet:

```python
from sdk.tool import tool

result = tool.call("get_slides_template_download_url", {"code": template_code})
template_file_url = result.data["template_file_url"]
```

The code must be passed through exactly from the template list, the user's selection, or an explicit upstream value.
Do not guess it, invent it, change its casing, or rename it.
"""

    async def execute(self, tool_context: ToolContext, params: GetSlidesTemplateDownloadUrlParams) -> ToolResult:
        code = params.code.strip()
        if code == "":
            return ToolResult.error("code is required.")

        try:
            async with MagicServiceClient() as client:
                payload = await client.get_slides_template_file_url(code)

            if not payload.get("template_file_url"):
                return ToolResult.error(f"Slides template '{code}' does not have a template_file_url.")
            return ToolResult(
                content=json.dumps(payload, ensure_ascii=False, indent=2),
                data=payload,
                extra_info=payload,
            )
        except Exception as exc:
            logger.error(f"Failed to get slides template download URL (code={code}): {exc}")
            return ToolResult.error(f"Failed to get slides template download URL: {exc}")
