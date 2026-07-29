"""天书 teamshare-cli 状态探测实现。"""
from __future__ import annotations

from agentlang.logger import get_logger
from app.service.cli_status.common.interfaces import (
    CliCommandResult,
    CliCommandRunner,
    CliStatusProbe,
    CliStatusSnapshot,
)
from app.service.cli_status.common.parsing import (
    json_contains_truthy,
    json_find_status,
    loads_json,
    parse_auth_from_text,
)
from app.service.cli_status.common.runner import (
    CLI_STATUS_COMMAND_TIMEOUT_SECONDS,
    run_cli_command,
)
from app.service.runtime_cli_catalog import RUNTIME_MANAGED_CLIS

logger = get_logger(__name__)

TEAMSHARE_HORIZON_TEXT = RUNTIME_MANAGED_CLIS["teamshare-cli"].build_authenticated_horizon()


class TeamshareCliStatusProbe(CliStatusProbe):
    """只负责 teamshare-cli 状态命令的授权摘要。"""

    cli_name = "teamshare-cli"

    def __init__(
        self,
        runner: CliCommandRunner = run_cli_command,
        timeout: float = CLI_STATUS_COMMAND_TIMEOUT_SECONDS,
    ) -> None:
        self._runner = runner
        self._timeout = timeout

    async def detect(self) -> CliStatusSnapshot:
        """探测 teamshare-cli 状态并返回最小 Horizon 结构。"""
        auth_status_result = await self._run("teamshare-cli", "auth", "status")
        if auth_status_result.exit_code == 127:
            self._log_summary(auth_status_result, auth="unknown", horizon_enabled=False)
            return CliStatusSnapshot(cli=self.cli_name)

        auth = self._parse_auth_status(auth_status_result)
        horizon_enabled = auth == "authenticated"
        self._log_summary(auth_status_result, auth=auth, horizon_enabled=horizon_enabled)
        return CliStatusSnapshot(
            cli=self.cli_name,
            horizon=TEAMSHARE_HORIZON_TEXT if horizon_enabled else "",
        )

    def _log_summary(self, result: CliCommandResult, auth: str, horizon_enabled: bool) -> None:
        """记录 teamshare-cli 探测摘要，不输出原始命令内容。"""
        logger.info(
            "[CliStatus][teamshare-cli] 检测完成: "
            f"auth={auth}, horizon={'enabled' if horizon_enabled else 'skipped'}, "
            f"argv={' '.join(result.argv)}, exit_code={result.exit_code}, "
            f"timed_out={result.timed_out}, elapsed_ms={result.elapsed_seconds * 1000:.1f}"
        )

    async def _run(self, *argv: str) -> CliCommandResult:
        """用统一 runner 执行 teamshare-cli 探测命令，继承短超时策略。"""
        return await self._runner(argv, self._timeout)

    def _parse_auth_status(self, result: CliCommandResult) -> str:
        """从 auth status 输出中归一化授权状态。"""
        if result.timed_out:
            return "unknown"

        data = loads_json(result.stdout)
        if isinstance(data, dict):
            if data.get("ok") is False:
                error = data.get("error")
                if self._is_missing_or_invalid_auth_error(error):
                    return "not_authenticated"
                return "unknown"

            credential_status = json_find_status(data, {"credentialstatus"})
            has_access_token = json_contains_truthy(data, {"hasaccesstoken"})
            has_organization_code = json_contains_truthy(data, {"hasorganizationcode"})
            if credential_status == "valid":
                if has_access_token is True and has_organization_code is True:
                    return "authenticated"
                return "not_authenticated" if False in (has_access_token, has_organization_code) else "unknown"
            if credential_status in {"invalid", "expired", "missing", "not_found", "no_token"}:
                return "not_authenticated"

        if result.exit_code != 0:
            auth, _detail = parse_auth_from_text(result.combined_output)
            if auth != "unknown":
                return auth
            if self._looks_like_missing_auth_text(result.combined_output):
                return "not_authenticated"
            return "unknown"

        auth, _detail = parse_auth_from_text(result.combined_output)
        return auth

    def _is_missing_or_invalid_auth_error(self, error: object) -> bool:
        """判断结构化错误是否表示未配置、未登录或凭证不可用。"""
        if not isinstance(error, dict):
            return False
        text = " ".join(
            str(error.get(key) or "")
            for key in ("type", "subtype", "code", "message", "hint")
        )
        return self._looks_like_missing_auth_text(text)

    def _looks_like_missing_auth_text(self, text: str) -> bool:
        """识别 teamshare-cli 常见未登录/未配置错误文本。"""
        lowered = text.lower()
        return any(
            marker in lowered
            for marker in (
                "config",
                "credential",
                "not configured",
                "not authenticated",
                "not logged",
                "unauthorized",
                "invalid",
                "expired",
                "不存在",
                "未登录",
                "未授权",
            )
        )
