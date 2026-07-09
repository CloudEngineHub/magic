"""Install slides template package by code."""

import asyncio
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any, ClassVar, Dict, Optional
from uuid import uuid4

from pydantic import Field, field_validator

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.infrastructure.magic_service.client import MagicServiceClient
from app.tools.core import BaseToolParams, tool
from app.tools.workspace_tool import WorkspaceTool
from app.utils.async_file_utils import async_copytree, async_exists

logger = get_logger(__name__)


class InstallSlidesTemplateParams(BaseToolParams):
    code: str = Field(
        ...,
        description=(
            "<!--zh: 幻灯片模板 code，例如 PPT- 开头的系统生成值。必须来自模板列表、用户选择或上游明确传入，不要编造、改写大小写。-->"
            "Slides template code, for example a system-generated value starting with PPT-. It must come "
            "from the template list, the user's selection, or an explicit upstream value; do not invent it "
            "or rewrite its casing."
        ),
    )
    install_path: str = Field(
        ...,
        description=(
            "<!--zh: 模板安装目录。相对路径会解析到当前 workspace，绝对路径会原样使用。若目录已存在，工具会安装到追加随机后缀的新目录。-->"
            "Directory where the template package should be installed. Relative paths are resolved inside "
            "the current workspace; absolute paths are used as provided. If the directory already exists, "
            "the tool installs into a new directory with a random suffix."
        ),
    )

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        code = value.strip() if isinstance(value, str) else ""
        if not code:
            raise ValueError("code is required")
        return code

    @field_validator("install_path")
    @classmethod
    def validate_install_path(cls, value: str) -> str:
        install_path = value.strip() if isinstance(value, str) else ""
        if not install_path:
            raise ValueError("install_path is required")
        return install_path


@tool(name="install_slides_template")
class InstallSlidesTemplate(WorkspaceTool[InstallSlidesTemplateParams]):
    """<!--zh
    根据幻灯片模板 code 下载并安装模板包到指定目录。
    仅在 skill 或 Code Mode 已拿到明确模板 code 且需要读取模板文件时使用。
    返回结构化数据中的 installed_directory，后续应从该目录读取可用文件。
    -->
    Download and install a slide template package by code into a target directory.
    Use this only when a skill or Code Mode already has an explicit template code and needs to inspect
    the template files. The returned data contains installed_directory; inspect files in that directory.
    """

    code_mode_only: ClassVar[bool] = True

    def get_prompt_hint(self) -> str:
        return """<!--zh
拿到明确的幻灯片模板 code 后，如需安装并读取模板包，可在 run_sdk_snippet 中调用：

```python
from sdk.tool import tool

result = tool.call("install_slides_template", {
    "code": template_code,
    "install_path": f"slide-templates/{template_code}"
})
installed_directory = result.data["installed_directory"]
```

code 必须原样来自模板列表、用户选择或上游明确传入；不要猜测、编造、转换大小写或重命名。安装后从 installed_directory 读取可用文件。
-->
When you already have an explicit slides template code and need the template package, call this tool from run_sdk_snippet:

```python
from sdk.tool import tool

result = tool.call("install_slides_template", {
    "code": template_code,
    "install_path": f"slide-templates/{template_code}"
})
installed_directory = result.data["installed_directory"]
```

The code must be passed through exactly from the template list, the user's selection, or an explicit upstream value.
Do not guess it, invent it, change its casing, or rename it. After installation, inspect files in installed_directory.
"""

    async def execute(self, tool_context: ToolContext, params: InstallSlidesTemplateParams) -> ToolResult:
        code = params.code.strip()
        if code == "":
            return ToolResult.error("code is required.")

        try:
            async with MagicServiceClient() as client:
                payload = await client.get_slides_template_file_url(code, self._access_context(tool_context))

            template_file_url = str(payload.get("template_file_url") or "").strip()
            if not template_file_url:
                return ToolResult.error(f"Slides template '{code}' does not have a template_file_url.")

            with tempfile.TemporaryDirectory(prefix="slides_template_") as temp_dir:
                download_path = Path(temp_dir) / "template_package"
                extract_dir = Path(temp_dir) / "extract"
                await self._download_template_file(template_file_url, download_path)
                if not await asyncio.to_thread(zipfile.is_zipfile, download_path):
                    return ToolResult.error(
                        f"Slides template '{code}' download is not a readable ZIP package. "
                        "Do not continue reading template files from the install directory."
                    )
                await asyncio.to_thread(self._extract_zip_safely, download_path, extract_dir)
                package_root = await asyncio.to_thread(self._resolve_package_root, extract_dir)
                install_dir, change_reason = await self._copy_package_to_install_dir(
                    package_root,
                    params.install_path,
                )

            result_data = self._build_result_data(code, payload, install_dir, change_reason)
            return ToolResult(
                content=self._build_model_content(result_data),
                data=result_data,
                extra_info=result_data,
            )
        except Exception as exc:
            logger.error(f"Failed to install slides template (code={code}): {exc}")
            return ToolResult.error(f"Failed to install slides template: {exc}")

    @staticmethod
    async def _download_template_file(download_url: str, download_path: Path) -> None:
        process = await asyncio.create_subprocess_exec(
            "curl",
            "-L",
            "--fail",
            "--silent",
            "--show-error",
            "--output",
            str(download_path),
            download_url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(process.communicate(), timeout=120)
        except asyncio.TimeoutError as exc:
            await InstallSlidesTemplate._kill_process(process)
            raise RuntimeError("Template package download timed out after 120 seconds.") from exc
        except asyncio.CancelledError:
            await InstallSlidesTemplate._kill_process(process)
            raise
        if process.returncode != 0:
            stderr = stderr_bytes.decode("utf-8", errors="replace").strip()
            stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
            raise RuntimeError(stderr or stdout or f"curl exited with code {process.returncode}")

    @staticmethod
    async def _kill_process(process: asyncio.subprocess.Process) -> None:
        if process.returncode is None:
            process.kill()
        await process.wait()

    async def _copy_package_to_install_dir(self, package_root: Path, install_path: str) -> tuple[Path, Optional[str]]:
        requested_dir = self.resolve_path(install_path)
        install_dir, change_reason = await self._resolve_install_dir(requested_dir)
        while True:
            try:
                await async_copytree(package_root, install_dir)
                return install_dir, change_reason
            except FileExistsError:
                if change_reason is None:
                    change_reason = "Requested install directory was created by another process during installation."
                install_dir = await self._next_available_install_dir(requested_dir)

    async def _resolve_install_dir(self, requested_dir: Path) -> tuple[Path, Optional[str]]:
        if not await async_exists(requested_dir):
            return requested_dir, None

        return await self._next_available_install_dir(requested_dir), "Requested install directory already exists."

    @staticmethod
    async def _next_available_install_dir(requested_dir: Path) -> Path:
        parent = requested_dir.parent
        stem = requested_dir.name
        while True:
            candidate = parent / f"{stem}_{uuid4().hex[:8]}"
            if not await async_exists(candidate):
                return candidate

    @staticmethod
    def _extract_zip_safely(zip_path: Path, extract_dir: Path) -> None:
        extract_root = extract_dir.resolve()
        extract_root.mkdir(parents=True, exist_ok=False)

        with zipfile.ZipFile(zip_path, "r") as archive:
            for member in archive.infolist():
                target = (extract_root / member.filename).resolve()
                try:
                    target.relative_to(extract_root)
                except ValueError as exc:
                    raise RuntimeError(f"Unsafe path in template package: {member.filename}") from exc

                if member.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue

                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member, "r") as source, open(target, "wb") as destination:
                    shutil.copyfileobj(source, destination)

    @staticmethod
    def _resolve_package_root(extract_dir: Path) -> Path:
        if (extract_dir / "template.json").is_file():
            return extract_dir

        children = [child for child in extract_dir.iterdir() if child.name != "__MACOSX"]
        directories = [child for child in children if child.is_dir()]
        if len(directories) == 1 and len(children) == 1 and (directories[0] / "template.json").is_file():
            return directories[0]

        return extract_dir

    @staticmethod
    def _template_label(payload: Dict[str, Any]) -> str:
        label = payload.get("label")
        if isinstance(label, dict):
            return str(label.get("en_US") or label.get("zh_CN") or next(iter(label.values()), "")).strip()
        return str(label or "").strip()

    @classmethod
    def _build_result_data(
        cls,
        code: str,
        payload: Dict[str, Any],
        install_dir: Path,
        change_reason: Optional[str],
    ) -> Dict[str, Any]:
        return {
            "code": str(payload.get("code") or code).strip(),
            "template_name": cls._template_label(payload),
            "installed_directory": str(install_dir),
            "install_path_changed": change_reason is not None,
            "install_path_change_reason": change_reason,
        }

    @classmethod
    def _build_model_content(cls, data: Dict[str, Any]) -> str:
        lines = [
            "Slides template installed.",
            f"- template code: {data.get('code', '')}",
        ]
        template_name = str(data.get("template_name") or "").strip()
        if template_name:
            lines.append(f"- template name: {template_name}")
        lines.append(f"- installed directory: `{data.get('installed_directory', '')}`")
        change_reason = str(data.get("install_path_change_reason") or "").strip()
        if change_reason:
            lines.append(f"- install path change reason: {change_reason}")
            lines.append("Use the installed directory above, not the originally requested directory.")
        lines.append("Next step: inspect the installed directory and use the available files.")
        return "\n".join(lines)

    @staticmethod
    def _argument_code(arguments: Optional[Dict[str, Any]]) -> str:
        if not arguments:
            return ""
        return str(arguments.get("code") or "").strip()

    @staticmethod
    def _access_context(tool_context: ToolContext) -> Dict[str, Any]:
        task_id = str(tool_context.get_metadata("super_magic_task_id") or "").strip()
        if not task_id:
            task_id = str(tool_context.get_metadata("task_id") or "").strip()
        return {
            "topic_id": tool_context.get_metadata("topic_id"),
            "chat_topic_id": tool_context.get_metadata("chat_topic_id"),
            "project_id": tool_context.get_metadata("project_id"),
            "task_id": task_id,
            "message_id": tool_context.get_metadata("message_id"),
            "source": "super_magic_tool",
        }

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Dict[str, Any] | None = None,
    ) -> Dict:
        return {
            "tool_name": tool_name,
            "action": i18n.translate("install_slides_template", category="tool.actions"),
            "remark": i18n.translate(
                "install_slides_template.before",
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
        action = i18n.translate("install_slides_template", category="tool.actions")
        code = self._argument_code(arguments)
        if not result.ok:
            return {
                "tool_name": tool_name,
                "action": action,
                "remark": i18n.translate(
                    "install_slides_template.after_failed",
                    category="tool.messages",
                    template_code=code or "-",
                ),
            }

        data = result.data if isinstance(result.data, dict) else {}
        return {
            "tool_name": tool_name,
            "action": action,
            "remark": i18n.translate(
                "install_slides_template.after_success",
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
            title = i18n.translate("install_slides_template.detail_title", category="tool.messages")
            code_label = i18n.translate("install_slides_template.detail_code", category="tool.messages")
            error_label = i18n.translate("install_slides_template.detail_error", category="tool.messages")
            lines = [
                f"# {title}",
                "",
                f"- {code_label}: `{self._argument_code(arguments) or '-'}`",
                f"- {error_label}",
            ]
            return ToolDetail(
                type=DisplayType.MD,
                data=FileContent(file_name="slides_template_install_result.md", content="\n".join(lines)),
            )

        data = result.data if isinstance(result.data, dict) else {}
        installed_directory = str(data.get("installed_directory") or "")
        if not installed_directory:
            return None

        title = i18n.translate("install_slides_template.detail_title", category="tool.messages")
        code_label = i18n.translate("install_slides_template.detail_code", category="tool.messages")
        name_label = i18n.translate("install_slides_template.detail_label", category="tool.messages")
        directory_label = i18n.translate("install_slides_template.detail_directory", category="tool.messages")
        lines = [
            f"# {title}",
            "",
            f"- {code_label}: `{data.get('code', '')}`",
        ]
        template_name = str(data.get("template_name") or "").strip()
        if template_name:
            lines.append(f"- {name_label}: {template_name}")
        lines.append(f"- {directory_label}: `{installed_directory}`")

        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="slides_template_install_result.md", content="\n".join(lines)),
        )
