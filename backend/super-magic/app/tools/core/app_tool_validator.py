"""
应用层工具验证器实现

提供 ToolValidatorProtocol 的具体实现，处理工具存在性和可用性验证
"""

from typing import Dict, List

from agentlang.logger import get_logger
from agentlang.tools.validator import ToolValidatorProtocol
from app.tools.core.tool_factory import tool_factory
from app.tools.remote.remote_tool_manager import remote_tool_manager

logger = get_logger(__name__)

# 已废弃工具的兼容映射：旧名称 -> 新名称
# 当 .agent 文件中声明了旧名称时，自动替换为新名称并记录 warning
_DEPRECATED_TOOL_ALIASES: Dict[str, str] = {
    "generate_image": "generate_images",
}


class AppToolValidator(ToolValidatorProtocol):
    """应用层工具验证器

    检查工具是否存在且可用，若不存在或不可用则忽略并抛出 warning
    用户自定义 Agent 可将非法工具声明降级为 warning，内置 Agent 保持严格校验
    使用轻量级检查，避免在初始化时加载所有工具类
    """

    def __init__(
        self,
        *,
        ignore_invalid_declarations: bool = False,
        agent_name: str = "",
    ) -> None:
        self._ignore_invalid_declarations = ignore_invalid_declarations
        self._agent_name = agent_name

    def filter_valid_tools(self, tools_definition: Dict[str, Dict]) -> Dict[str, Dict]:
        """过滤无效工具，返回有效工具定义

        Args:
            tools_definition: 原始工具定义字典

        Returns:
            Dict[str, Dict]: 过滤后的有效工具字典
        """
        ignored_tools: Dict[str, str] = {}

        # 先做废弃工具的兼容性重映射，再走后续验证逻辑
        remapped: Dict[str, Dict] = {}
        for tool_name, tool_config in tools_definition.items():
            if tool_name in _DEPRECATED_TOOL_ALIASES:
                new_name = _DEPRECATED_TOOL_ALIASES[tool_name]
                logger.info(
                    f"工具 '{tool_name}' 已废弃，请在 .agent 文件中改为使用 '{new_name}'，本次自动替换"
                )
                # 若 .agent 已同时声明了新名称，跳过，避免重复
                if new_name not in remapped and new_name not in tools_definition:
                    remapped[new_name] = tool_config
            else:
                remapped[tool_name] = tool_config

        code_mode_only_tools: List[str] = []
        auto_mount_tools: List[str] = []
        for tool_name in remapped:
            if remote_tool_manager.is_remote_tool(tool_name):
                continue

            tool_info = tool_factory.get_tool(tool_name)
            if tool_info is not None and tool_info.code_mode_only:
                code_mode_only_tools.append(tool_name)
            if tool_info is not None and tool_info.auto_mount is not None:
                auto_mount_tools.append(tool_name)

        if code_mode_only_tools:
            invalid_tools = ", ".join(
                f"'{tool_name}'" for tool_name in sorted(code_mode_only_tools)
            )
            error_message = (
                f"Code Mode Only 工具不能在 .agent 的 tools 中显式声明: {invalid_tools}。"
                "请从 tools 中删除，并通过对应 Skill 使用 "
                "run_sdk_snippet + sdk.tool.call() 调用。"
            )
            self._reject_or_ignore_invalid_tools(
                remapped=remapped,
                tool_names=code_mode_only_tools,
                error_message=error_message,
                ignored_tools=ignored_tools,
                ignore_reason="仅支持通过 Code Mode 调用",
            )

        if auto_mount_tools:
            invalid_tools = ", ".join(
                f"'{tool_name}'" for tool_name in sorted(auto_mount_tools)
            )
            error_message = (
                f"运行时自动挂载工具不能在 .agent 的 tools 中显式声明: {invalid_tools}。"
                "请从 tools 中删除；实际挂载时机由 @tool(auto_mount=...) 控制。"
            )
            self._reject_or_ignore_invalid_tools(
                remapped=remapped,
                tool_names=auto_mount_tools,
                error_message=error_message,
                ignored_tools=ignored_tools,
                ignore_reason="由运行时自动挂载，不允许在 Agent 中显式声明",
            )

        valid_tools = {}

        for tool_name in remapped.keys():
            try:
                # 检查是否是远程工具
                if remote_tool_manager.is_remote_tool(tool_name):
                    # 远程工具直接通过验证，由 remote_tool_manager 管理
                    valid_tools[tool_name] = remapped[tool_name]
                    logger.debug(f"远程工具 '{tool_name}' 验证通过")
                    continue

                # 对于非远程工具，使用 tool_factory 进行检查
                if not tool_factory.tool_exists(tool_name):
                    self._record_or_log_ignored_tool(
                        ignored_tools=ignored_tools,
                        tool_name=tool_name,
                        reason="工具不存在",
                    )
                    continue

                if not tool_factory.check_tool_availability_light(tool_name):
                    self._record_or_log_ignored_tool(
                        ignored_tools=ignored_tools,
                        tool_name=tool_name,
                        reason="工具不可用（环境变量未配置或依赖缺失）",
                    )
                    continue

                valid_tools[tool_name] = remapped[tool_name]
                logger.debug(f"工具 '{tool_name}' 验证通过")

            except Exception as e:
                # 其他错误
                self._record_or_log_ignored_tool(
                    ignored_tools=ignored_tools,
                    tool_name=tool_name,
                    reason=f"工具验证失败: {e}",
                )
                continue

        if ignored_tools and self._ignore_invalid_declarations:
            logger.warning(
                f"用户 Agent '{self._agent_name}' 包含无法使用的工具声明，"
                f"已忽略这些工具并继续初始化: {ignored_tools}"
            )

        return valid_tools

    def _reject_or_ignore_invalid_tools(
        self,
        *,
        remapped: Dict[str, Dict],
        tool_names: List[str],
        error_message: str,
        ignored_tools: Dict[str, str],
        ignore_reason: str,
    ) -> None:
        if not self._ignore_invalid_declarations:
            raise ValueError(error_message)

        for tool_name in tool_names:
            remapped.pop(tool_name, None)
            ignored_tools[tool_name] = ignore_reason

    def _record_or_log_ignored_tool(
        self,
        *,
        ignored_tools: Dict[str, str],
        tool_name: str,
        reason: str,
    ) -> None:
        if self._ignore_invalid_declarations:
            ignored_tools[tool_name] = reason
            return
        logger.warning(f"工具 '{tool_name}' 将在 Agent 定义中被忽略: {reason}")


# 全局单例实例
app_tool_validator = AppToolValidator()
