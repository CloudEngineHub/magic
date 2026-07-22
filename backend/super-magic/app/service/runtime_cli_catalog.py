"""超级麦吉运行时预置 CLI 目录。"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RuntimeCliDefinition:
    """描述由运行时镜像负责安装和更新的 CLI。"""

    command: str
    skill_name: str
    capabilities: str

    def build_authenticated_horizon(self) -> str:
        """构建 CLI 已认证时注入 Horizon 的最小提示。"""
        return (
            f"{self.command} is currently authenticated. "
            f"It can connect to {self.capabilities} capabilities. "
            f"To use these capabilities, call read_skills(['{self.skill_name}']). "
            "This CLI is provided by the Super Magic runtime and does not require cli-manager persistence."
        )


# 该目录需要与 Dockerfile 的 prebuilt_cli 阶段保持同步。
RUNTIME_MANAGED_CLIS: dict[str, RuntimeCliDefinition] = {
    "dws": RuntimeCliDefinition(
        command="dws",
        skill_name="dingtalk-cli",
        capabilities="DingTalk/钉钉",
    ),
    "lark-cli": RuntimeCliDefinition(
        command="lark-cli",
        skill_name="lark-cli",
        capabilities="Lark/Feishu/飞书",
    ),
    "teamshare-cli": RuntimeCliDefinition(
        command="teamshare-cli",
        skill_name="teamshare-cli",
        capabilities="Teamshare/天书",
    ),
}

RUNTIME_MANAGED_CLI_COMMANDS = frozenset(RUNTIME_MANAGED_CLIS)
