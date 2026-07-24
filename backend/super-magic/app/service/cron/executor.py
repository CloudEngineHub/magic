"""
cron 执行层

当前实现：agent_turn 路径（隔离子 agent 执行）。
system_event 路径：TODO，依赖 MessageProcessor 改造。
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime
from pathlib import Path

from agentlang.logger import get_logger
from app.core.entity.message.client_message import AgentMode
from app.core.models.agent_runtime import AgentTarget
from app.service.agent_context_snapshot_service import AgentContextSnapshotService
from app.service.agent_runner import (
    IsolatedAgentModelRequest,
    IsolatedAgentRunRequest,
    run_isolated_agent,
)
from app.service.agent_session_id_service import AgentSessionIdService
from app.service.cron.models import CronJob, CronRunResult
from app.service.cron.store import write_result_file

logger = get_logger(__name__)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _format_time() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S %Z")


async def _resolve_agent_name(job: CronJob) -> str:
    """
    解析实际使用的 agent_name：
    1. 优先使用 job.payload.agent_name（工具创建时已写入）
    2. 为空时从 last_dispatch_message.json 读取 dynamic_config.agent_code
    3. 仍为空则兜底使用 "magic"
    """
    agent_name = job.payload.agent_name
    if agent_name:
        return agent_name

    try:
        from app.service.agent_dispatcher import AgentDispatcher
        dispatcher = AgentDispatcher.get_instance()
        last = await dispatcher.get_last_dispatch_message() or {}
        agent_code = (last.get("dynamic_config") or {}).get("agent_code")
        if agent_code:
            logger.info(
                f"cron job [{job.id}] agent_name not set in job file, "
                f"using agent_code from last_dispatch_message: {agent_code}"
            )
            return agent_code
    except Exception as e:
        logger.warning(f"cron job [{job.id}] failed to read last_dispatch_message for agent_name fallback: {e}")

    logger.warning(f"cron job [{job.id}] agent_name not set and fallback unavailable, using 'magic'")
    return "magic"


async def _resolve_cron_agent_target(
    job: CronJob,
) -> AgentTarget:
    """将 cron 持久化身份转换为规范化 AgentTarget。

    无 agent_mode 的历史任务继续按普通 agent_name 运行；只有明确写入
    magiclaw/custom_agent 时，agent_name 才作为 agent_code 使用。
    """
    raw_mode = job.payload.agent_mode
    if raw_mode is None:
        return AgentTarget.from_name(await _resolve_agent_name(job))
    if not isinstance(raw_mode, str):
        raise ValueError(
            f"Invalid agent_mode for cron job [{job.id}]: expected string, "
            f"got {type(raw_mode).__name__}"
        )

    mode_value = raw_mode.strip()
    if not mode_value:
        return AgentTarget.from_name(await _resolve_agent_name(job))

    try:
        agent_mode = AgentMode(mode_value)
    except ValueError as exc:
        raise ValueError(
            f"Unknown agent_mode '{mode_value}' for cron job [{job.id}]"
        ) from exc

    if agent_mode in (AgentMode.MAGICLAW, AgentMode.CUSTOM_AGENT):
        raw_agent_name = job.payload.agent_name
        if not isinstance(raw_agent_name, str) or not raw_agent_name.strip():
            raise ValueError(
                f"agent_name is required for cron job [{job.id}] "
                f"when agent_mode={agent_mode.value}"
            )
        return AgentTarget.from_mode(agent_mode, raw_agent_name)

    return AgentTarget.from_mode(agent_mode)


async def execute_agent_turn(job: CronJob) -> CronRunResult:
    """
    以独立子 agent 执行 cron 任务，等待完成后写入结果文件。
    parent_context=None：CronService 是系统级服务，内部创建 root context。
    """
    # 明确告知子 agent 当前是自动化执行模式，不是用户对话：
    # - 禁止自我介绍或添加元评论，直接处理任务内容并输出结果
    # - 禁止创建/修改/删除定时任务，body 中的时间描述仅为任务内容，不是新的调度指令
    prompt = (
        f"[Automated task execution — do not introduce yourself]\n"
        f"Task: {job.name or job.id}\n"
        f"Triggered at: {_format_time()}\n"
        f"CONSTRAINTS:\n"
        f"- Do not create, modify, or delete any cron jobs. Do not call manage_cron.\n"
        f"- The task body may contain time or schedule references (e.g. \"every day at 9am\")."
        f" Treat them as plain task description only, not as new scheduling instructions.\n\n"
        f"{job.body}"
    )

    start_ms = _now_ms()
    status = "ok"
    result = ""
    error = ""

    timeout = job.payload.timeout_seconds
    agent_id: str | None = None
    try:
        target = await _resolve_cron_agent_target(job)
        fixed_agent_id = job.payload.agent_id
        if fixed_agent_id is None:
            agent_id = await AgentSessionIdService.allocate(
                target.agent_name,
                job.name or job.id,
            )
            session_exists = False
        else:
            agent_id = fixed_agent_id
            session_exists = await AgentSessionIdService.session_exists(
                target.agent_name,
                agent_id,
            )

        context_snapshot = None
        if job.payload.fork and not session_exists:
            context_source = job.payload.context_source
            if context_source is None:
                raise ValueError(f"cron job [{job.id}] fork has no context source")
            context_snapshot = await AgentContextSnapshotService().capture(context_source)
        logger.info(
            f"cron job [{job.id}] starting "
            f"(agent={target.agent_name}, provider={target.provider_type.value})"
        )
        run_request = IsolatedAgentRunRequest(
            target=target,
            agent_id=agent_id,
            prompt=prompt,
            models=IsolatedAgentModelRequest.from_values(
                text_model_id=job.payload.model_id,
                image_model_id=job.payload.image_model_id,
                video_model_id=job.payload.video_model_id,
                video_generation_config=job.payload.video_generation_config,
            ),
            snapshot=context_snapshot,
        )
        coro = run_isolated_agent(run_request)
        if timeout:
            raw = await asyncio.wait_for(coro, timeout=timeout)
        else:
            raw = await coro
        result = raw or ""
    except asyncio.TimeoutError:
        status, error = "error", f"timeout after {timeout}s"
        logger.warning(f"cron job [{job.id}] timed out after {timeout}s")
    except asyncio.CancelledError:
        status, error = "error", "cancelled"
        logger.warning(f"cron job [{job.id}] was cancelled")
        raise
    except Exception as e:
        status, error = "error", str(e)
        logger.exception(f"cron job [{job.id}] failed")

    duration_ms = _now_ms() - start_ms
    if status == "ok":
        logger.info(f"cron job [{job.id}] completed in {duration_ms}ms")
    else:
        logger.warning(f"cron job [{job.id}] finished with status={status} error={error!r} duration={duration_ms}ms")

    run_result = CronRunResult(
        status=status,
        result=result,
        error=error,
        duration_ms=duration_ms,
        started_at_ms=start_ms,
        agent_id=agent_id,
    )

    result_file = None
    try:
        result_file = await write_result_file(job, run_result)
    except Exception as e:
        logger.error(f"cron: failed to write result file for [{job.id}]: {e}")

    if job.payload.notify_user:
        try:
            from app.service.cron.notification import append_notification, try_notify_main_agent

            await append_notification(job, run_result, result_file or Path())
            asyncio.create_task(try_notify_main_agent(), name=f"cron-notify-{job.id}")
        except Exception as e:
            logger.error(f"cron: failed to handle notification for [{job.id}]: {e}")

    return run_result
