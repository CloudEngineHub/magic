"""安装或接管持久化第三方 CLI 的 Code Mode 工具。"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import ConfigDict, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.service.cli_manager import CliApplyRequest, CliApplyResult, CliManagerError, CliManagerService
from app.tools.core import BaseTool, BaseToolParams, tool

from ._base import CliManagerToolMixin
from .display import (
    as_mapping,
    as_sequence,
    format_commands,
    format_optional,
    get_argument_commands,
    get_argument_mode,
    get_argument_name,
    translate_action,
    translate_error,
    translate_message,
)


class CliManagerApplyParams(BaseToolParams):
    """持久化第三方 CLI 的参数。"""

    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(
        None,
        description="""<!--zh: CLI 的持久化名称，通常与主命令同名。-->
CLI 的持久化名称，通常与主命令同名。""",
    )
    mode: Literal["install", "adopt"] = Field(
        "install",
        description="""<!--zh: install 表示执行安装命令并写入持久目录；adopt 表示接管当前 PATH 中已安装的命令。-->
install 表示执行安装命令并写入持久目录；adopt 表示接管当前 PATH 中已安装的命令。""",
    )
    install_command: Optional[str] = Field(
        None,
        description="""<!--zh: 用户确认后要执行的 CLI 安装命令。mode=install 时必填。-->
用户确认后要执行的 CLI 安装命令。mode=install 时必填。""",
    )
    commands: list[str] = Field(
        default_factory=list,
        description="""<!--zh: 需要暴露的命令名。为空时默认使用 name。-->
需要暴露的命令名。为空时默认使用 name。""",
    )
    config_dirs: list[str] = Field(
        default_factory=list,
        description="""<!--zh: 需要随 CLI 一起保留的 HOME 下配置目录，例如 ~/.foo。不要传入密钥明文。-->
需要随 CLI 一起保留的 HOME 下配置目录，例如 ~/.foo。不要传入密钥明文。""",
    )
    env_keys: list[str] = Field(
        default_factory=list,
        description="""<!--zh: CLI 依赖的环境变量名，仅记录 key，不保存 value。保存 value 请使用 env-manager。-->
CLI 依赖的环境变量名，仅记录 key，不保存 value。保存 value 请使用 env-manager。""",
    )
    confirmed: bool = Field(
        False,
        description="""<!--zh: 只有用户明确同意持久化后才传 true。-->
只有用户明确同意持久化后才传 true。""",
    )


@tool(name="cli_manager_apply")
class CliManagerApply(BaseTool[CliManagerApplyParams], CliManagerToolMixin):
    """<!--zh: 安装或接管第三方 CLI，并持久化命令入口和配置目录。-->
    安装或接管第三方 CLI，并持久化命令入口和配置目录。"""

    code_mode_only = True

    async def execute(self, tool_context: ToolContext, params: CliManagerApplyParams) -> ToolResult:
        """在用户明确确认后执行 CLI 持久化。"""
        try:
            info = await CliManagerService().apply(
                CliApplyRequest(
                    name=params.name or "",
                    mode=params.mode,
                    install_command=params.install_command,
                    commands=params.commands,
                    config_dirs=params.config_dirs,
                    env_keys=params.env_keys,
                    confirmed=params.confirmed,
                )
            )
        except CliManagerError as exc:
            return self.error_result("apply", exc, params.model_dump())

        content = self._build_model_content(info)
        return ToolResult(content=content, extra_info=info, data=info)

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        """构建用户可见的工具调用前提示。"""
        name = get_argument_name(arguments) or format_commands(get_argument_commands(arguments))
        return {
            "tool_name": tool_name,
            "action": translate_action(tool_name),
            "remark": translate_message("apply.before", name=format_optional(name), mode=get_argument_mode(arguments)),
        }

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, object] | None = None,
    ) -> ToolDetail | None:
        """构建用户可见的 CLI 持久化详情。"""
        info = as_mapping(result.extra_info)
        lines = [
            f"# {translate_message('detail.apply_success_title' if result.ok else 'detail.apply_failed_title')}",
            "",
            f"- {translate_message('detail.name')}: `{format_optional(info.get('name') or get_argument_name(arguments))}`",
            f"- {translate_message('detail.mode')}: `{get_argument_mode(arguments)}`",
            f"- {translate_message('detail.commands')}: `{format_commands(as_sequence(info.get('commands')) or get_argument_commands(arguments))}`",
        ]

        if result.ok:
            write_paths = as_mapping(info.get("write_paths"))
            app_links = as_sequence(info.get("app_links"))
            config_dirs = as_sequence(info.get("config_dirs"))
            env_keys = as_sequence(info.get("env_keys"))
            validation = as_mapping(info.get("validation"))
            command_validations = as_sequence(validation.get("commands"))
            lines.extend(
                [
                    f"- {translate_message('detail.strategy')}: `{format_optional(info.get('strategy'))}`",
                    f"- {translate_message('detail.package_manager')}: `{format_optional(info.get('package_manager'))}`",
                    f"- {translate_message('detail.status')}: `{format_optional(info.get('status'))}`",
                    f"- {translate_message('detail.bin_dir')}: `{format_optional(write_paths.get('bin_dir'))}`",
                    f"- {translate_message('detail.registry_file')}: `{format_optional(write_paths.get('registry_file'))}`",
                    f"- {translate_message('detail.app_links')}: {len(app_links)}",
                    f"- {translate_message('detail.config_dirs')}: {len(config_dirs)}",
                    f"- {translate_message('detail.env_keys')}: `{format_commands(env_keys)}`",
                ]
            )
            if command_validations:
                lines.extend(
                    [
                        "",
                        f"## {translate_message('detail.command_routes')}",
                        "",
                        f"| {translate_message('detail.commands')} | {translate_message('detail.command_entry')} | {translate_message('detail.command_target')} |",
                        "| --- | --- | --- |",
                    ]
                )
                for command_validation in command_validations:
                    command_view = as_mapping(command_validation)
                    lines.append(
                        f"| `{format_optional(command_view.get('command'))}` | `{format_optional(command_view.get('shim_path'))}` | `{format_optional(command_view.get('target'))}` |"
                    )
        else:
            lines.append(f"- {translate_message('detail.error')}: {translate_error(info)}")

        return ToolDetail(type=DisplayType.MD, data=FileContent(file_name="cli_manager_apply.md", content="\n".join(lines)))

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        """构建用户可见的工具调用后提示。"""
        info = as_mapping(result.extra_info)
        name = str(info.get("name") or get_argument_name(arguments) or format_commands(get_argument_commands(arguments)))
        if result.ok:
            remark = translate_message("apply.after_success", name=format_optional(name))
        else:
            remark = translate_message("apply.after_failed", name=format_optional(name), error=translate_error(info))
        return {"tool_name": tool_name, "action": translate_action(tool_name), "remark": remark}

    @staticmethod
    def _build_model_content(info: CliApplyResult) -> str:
        """构建只面向模型的简洁结果，明确区分命令入口和真实目标。"""
        commands = ", ".join(info["commands"])
        validation_commands = info["validation"]["commands"]
        command_entries = [
            f"{item['command']}={item['shim_path']}"
            for item in validation_commands
        ]
        install_targets = [
            f"{item['command']}={item['target']}"
            for item in validation_commands
        ]
        content_parts = [
            f"CLI persisted: {info['name']} ({commands}).",
            f"command_entries: {', '.join(command_entries)}.",
            f"install_targets: {', '.join(install_targets)}.",
            f"expose_path: {info['write_paths']['bin_dir']}.",
            "path_note: expose only the command entry directory on PATH; prefix targets are internal install locations.",
        ]
        return " ".join(content_parts)
