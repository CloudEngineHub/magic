"""Get slides template package download URL by code."""

from typing import Any, ClassVar, Dict, Optional

from pydantic import Field, field_validator

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
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
    返回结构化数据中的 template_file_url，可直接作为后续下载地址。
    -->
    Get a temporary download URL for a slides template zip package by code.
    Use this only when a skill or Code Mode already has an explicit template code and needs to download
    or inspect the template files.
    The returned data contains template_file_url, which can be used directly as the next download URL.
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
                content=self._build_model_content(payload),
                data=payload,
                extra_info=payload,
            )
        except Exception as exc:
            logger.error(f"Failed to get slides template download URL (code={code}): {exc}")
            return ToolResult.error(f"Failed to get slides template download URL: {exc}")

    @staticmethod
    def _template_label(payload: Dict[str, Any]) -> str:
        label = payload.get("label")
        if isinstance(label, dict):
            return str(label.get("en_US") or label.get("zh_CN") or next(iter(label.values()), "")).strip()
        return str(label or "").strip()

    @classmethod
    def _build_model_content(cls, payload: Dict[str, Any]) -> str:
        lines = [
            "Slides template package URL resolved.",
            f"- code: {payload.get('code', '')}",
        ]
        label = cls._template_label(payload)
        if label:
            lines.append(f"- label: {label}")
        lines.append(f"- template_file_url: {payload.get('template_file_url', '')}")
        return "\n".join(lines)

    @staticmethod
    def _argument_code(arguments: Optional[Dict[str, Any]]) -> str:
        if not arguments:
            return ""
        return str(arguments.get("code") or "").strip()

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Dict[str, Any] | None = None,
    ) -> Dict:
        return {
            "tool_name": tool_name,
            "action": i18n.translate("get_slides_template_download_url", category="tool.actions"),
            "remark": i18n.translate(
                "get_slides_template_download_url.before",
                category="tool.messages",
                template_code=self._argument_code(arguments) or "-",
            ),
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Dict[str, Any] | None = None,
    ) -> Dict:
        action = i18n.translate("get_slides_template_download_url", category="tool.actions")
        code = self._argument_code(arguments)
        if not result.ok:
            return {
                "tool_name": tool_name,
                "action": action,
                "remark": i18n.translate(
                    "get_slides_template_download_url.after_failed",
                    category="tool.messages",
                    template_code=code or "-",
                ),
            }

        data = result.data if isinstance(result.data, dict) else {}
        return {
            "tool_name": tool_name,
            "action": action,
            "remark": i18n.translate(
                "get_slides_template_download_url.after_success",
                category="tool.messages",
                template_code=str(data.get("code") or code or "-"),
            ),
        }

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: Dict[str, Any] | None = None,
    ) -> Optional[ToolDetail]:
        if not result.ok:
            return None

        data = result.data if isinstance(result.data, dict) else {}
        template_file_url = str(data.get("template_file_url") or "")
        if not template_file_url:
            return None

        label = self._template_label(data)
        title = i18n.translate("get_slides_template_download_url.detail_title", category="tool.messages")
        code_label = i18n.translate("get_slides_template_download_url.detail_code", category="tool.messages")
        name_label = i18n.translate("get_slides_template_download_url.detail_label", category="tool.messages")
        url_label = i18n.translate("get_slides_template_download_url.detail_url", category="tool.messages")
        lines = [
            f"# {title}",
            "",
            f"- {code_label}: `{data.get('code', '')}`",
        ]
        if label:
            lines.append(f"- {name_label}: {label}")
        lines.append(f"- {url_label}: [download]({template_file_url})")

        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="slides_template_download_url.md", content="\n".join(lines)),
        )
