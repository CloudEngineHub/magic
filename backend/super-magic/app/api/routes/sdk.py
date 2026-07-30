"""
SDK Routes

提供 run_sdk_snippet 执行环境通过 HTTP 调用工具的接口。
"""
import asyncio
import json
import traceback
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agentlang.chat_history.chat_history_models import FunctionCall, ToolCall
from agentlang.logger import get_logger
from app.api.http_dto.response import (
    BaseResponse,
    create_error_response,
    create_success_response,
)
from app.service.agent_dispatcher import AgentDispatcher
from app.service.sdk_call_registry import SdkCallEntry, SdkCallRegistry
from app.tools.core.tool_call_executor import tool_call_executor

router = APIRouter(prefix="/sdk", tags=["SDK"])

logger = get_logger(__name__)

# 创建 AgentDispatcher 实例
agent_dispatcher = AgentDispatcher.get_instance()


class SdkToolCallRequest(BaseModel):
    """SDK 工具调用请求"""

    tool_name: str = Field(..., description="工具名称")
    tool_params: Dict[str, Any] = Field(..., description="工具参数字典")
    tool_call_id: Optional[str] = Field(None, description="工具调用ID，如果不提供则自动生成")
    agent_context_id: str = Field(
        ...,
        description="调用方 AgentContext 的唯一标识符，由 run_sdk_snippet 注入子进程环境变量",
    )
    sdk_execution_id: str = Field(
        "",
        description="本次 Code Mode 执行的唯一标识，用于精确取消本轮发起的服务端请求",
    )


class SdkOAuth2AccessTokenRequest(BaseModel):
    """SDK OAuth2 access token 请求。"""

    app_name: str = Field(..., description="OAuth2 app name")
    agent_context_id: str = Field(
        ...,
        description="调用方 AgentContext 的唯一标识符，由 run_sdk_snippet 注入子进程环境变量",
    )


@router.post("/tool/call", response_model=BaseResponse)
async def sdk_tool_call(request: SdkToolCallRequest):
    """
    SDK 工具调用接口

    供 run_sdk_snippet 子进程通过 HTTP 调用宿主工具。
    """
    from app.core.context.agent_context_registry import AgentContextRegistry

    agent_context = AgentContextRegistry.get_instance().get(request.agent_context_id)
    if agent_context is None:
        error_msg = (
            f"agent_context_id '{request.agent_context_id}' was not found in the registry. "
            "Unable to route this request to the correct AgentContext."
        )
        logger.error(error_msg)
        return create_error_response(
            message=error_msg,
            data={"ok": False, "content": error_msg},
        )

    tool_call_id = request.tool_call_id or f"call_{uuid.uuid4().hex[:24]}"

    agent_label = agent_context.get_agent_session_label()
    logger.info(
        f"SDK tool call: {request.tool_name}, params: {request.tool_params}, "
        f"tool_call_id: {tool_call_id}, agent: {agent_label}, agent_context_id: {request.agent_context_id}"
    )

    # 将当前请求 task 注册到 registry，中断时可精确取消
    registry = SdkCallRegistry.get_instance()
    current_task = asyncio.current_task()
    if current_task and request.sdk_execution_id:
        registry.register(SdkCallEntry(
            agent_context_id=request.agent_context_id,
            sdk_execution_id=request.sdk_execution_id,
            tool_call_id=tool_call_id,
            tool_name=request.tool_name,
            task=current_task,
        ))

    try:
        tool_call = ToolCall(
            id=tool_call_id,
            type="function",
            function=FunctionCall(
                name=request.tool_name,
                arguments=json.dumps(request.tool_params, ensure_ascii=False),
            ),
        )

        results = await tool_call_executor.execute(
            tool_calls=[tool_call],
            agent_context=agent_context,
            is_code_mode=True,
        )

        if results:
            result = results[0]
            logger.debug(f"工具调用完成: {request.tool_name}, ok: {result.ok}")

            result_dict = {
                "ok": result.ok,
                "content": result.content,
                "tool_call_id": result.tool_call_id,
                "execution_time": result.execution_time,
                "name": result.name,
                "data": result.data,
            }
            if request.sdk_execution_id:
                error_code = result.data.get("error_code")
                registry.finish(
                    request.agent_context_id,
                    request.sdk_execution_id,
                    tool_call_id,
                    ok=result.ok,
                    summary=result.content,
                    error_code=error_code if isinstance(error_code, str) else None,
                )

            return create_success_response(
                message="Tool call succeeded" if result.ok else "Tool call failed",
                data=result_dict,
            )

        error_msg = "Tool execution returned no result."
        logger.error(error_msg)
        if request.sdk_execution_id:
            registry.finish(
                request.agent_context_id,
                request.sdk_execution_id,
                tool_call_id,
                ok=False,
                summary=error_msg,
                error_code="no_result",
            )
        return create_error_response(
            message=error_msg,
            data={"ok": False, "content": error_msg},
        )

    except asyncio.CancelledError:
        # 被中断取消，返回明确的取消响应
        logger.info(f"SDK tool call cancelled: {request.tool_name}, tool_call_id: {tool_call_id}")
        if request.sdk_execution_id:
            registry.mark_cancelled(request.agent_context_id, request.sdk_execution_id, tool_call_id)
        return create_error_response(
            message="Tool call cancelled by interruption",
            data={"ok": False, "content": "Tool call cancelled by interruption"},
        )

    except HTTPException as error:
        if request.sdk_execution_id:
            registry.finish(
                request.agent_context_id,
                request.sdk_execution_id,
                tool_call_id,
                ok=False,
                summary=str(error.detail),
                error_code="http_error",
            )
        raise

    except Exception as e:
        logger.error(f"调用工具时发生异常: {e}", exc_info=True)
        logger.error(traceback.format_exc())
        if request.sdk_execution_id:
            registry.finish(
                request.agent_context_id,
                request.sdk_execution_id,
                tool_call_id,
                ok=False,
                summary=str(e),
                error_code="exception",
            )
        return create_error_response(
            message=f"Tool call failed: {e!s}",
            data={"ok": False, "content": str(e)},
        )

    finally:
        if request.sdk_execution_id:
            registry.unregister_task(request.agent_context_id, request.sdk_execution_id, tool_call_id)


@router.post("/oauth2/access-token", response_model=BaseResponse)
async def sdk_oauth2_access_token(request: SdkOAuth2AccessTokenRequest):
    """向 SDK 子进程返回 OAuth2 access token，不创建 ToolResult。"""
    from app.core.context.agent_context_registry import AgentContextRegistry
    from app.infrastructure.oauth2.exceptions import (
        OAuth2AppNotFoundError,
        OAuth2AuthorizationRequiredError,
        OAuth2DependencyError,
        OAuth2TokenRefreshError,
    )
    from app.infrastructure.oauth2.time_utils import format_timestamp
    from app.infrastructure.oauth2.token_service import OAuth2TokenService

    agent_context = AgentContextRegistry.get_instance().get(request.agent_context_id)
    if agent_context is None:
        error_msg = (
            f"agent_context_id '{request.agent_context_id}' was not found in the registry. "
            "Unable to route this request to the correct AgentContext."
        )
        logger.error(error_msg)
        return create_error_response(message=error_msg, data={"status": "failed", "content": error_msg})

    subject = agent_context.get_user_id() or "user"
    timezone_name = (
        agent_context.get_user_timezone()
        if hasattr(agent_context, "get_user_timezone")
        else "UTC"
    )
    service = OAuth2TokenService()
    try:
        access_token = await service.resolve_access_token(request.app_name, subject, timezone_name)
        return create_success_response(
            message="OAuth2 access token resolved",
            data={"status": "authorized", "access_token": access_token},
        )
    except OAuth2AuthorizationRequiredError as exc:
        try:
            auth = await service.start_authorization(request.app_name, subject, timezone_name)
            return create_success_response(
                message="OAuth2 authorization required",
                data={
                    "status": "authorization_required",
                    "content": str(exc),
                    "auth_url": auth.auth_url,
                    "expires_at": format_timestamp(auth.expires_at, timezone_name),
                    "state_hash": auth.state_hash,
                },
            )
        except Exception as start_exc:
            return create_error_response(
                message=f"OAuth2 authorization could not be started: {start_exc}",
                data={"status": "authorization_required", "content": str(start_exc)},
            )
    except OAuth2AppNotFoundError as exc:
        return create_error_response(message=str(exc), data={"status": "app_not_found", "content": str(exc)})
    except OAuth2TokenRefreshError as exc:
        return create_error_response(message=str(exc), data={"status": "token_refresh_failed", "content": str(exc)})
    except OAuth2DependencyError as exc:
        return create_error_response(message=str(exc), data={"status": "dependency_missing", "content": str(exc)})
    except Exception as exc:
        logger.error(f"OAuth2 access token resolve failed: {exc}", exc_info=True)
        return create_error_response(message=str(exc), data={"status": "failed", "content": str(exc)})


class SdkDebugToolCallRequest(BaseModel):
    """SDK 工具调试调用请求（无需 AgentContext，临时创建隔离上下文）"""

    tool_name: str = Field(..., description="工具名称")
    tool_params: Dict[str, Any] = Field(..., description="工具参数字典")
    tool_call_id: Optional[str] = Field(None, description="工具调用ID，如果不提供则自动生成")
    workspace_path: Optional[str] = Field(None, description="工作区路径，不提供则使用服务器默认路径")


@router.post("/tool/debug-call", response_model=BaseResponse)
async def sdk_tool_debug_call(request: SdkDebugToolCallRequest):
    """
    SDK 工具调试调用接口（无需 AgentContext）

    临时创建一个隔离的 AgentContext，执行工具后立即销毁，不污染全局注册表。
    适用于工具调试面板独立运行场景。
    """
    from app.core.context.agent_context import AgentContext

    tool_call_id = request.tool_call_id or f"call_{uuid.uuid4().hex[:24]}"

    logger.info(
        f"SDK tool debug call: {request.tool_name}, params: {request.tool_params}, "
        f"tool_call_id: {tool_call_id}, workspace_path: {request.workspace_path}"
    )

    try:
        ctx = AgentContext(isolated=True)
        if request.workspace_path:
            ctx.set_workspace_dir(request.workspace_path)
            ctx.ensure_workspace_dir()

        tool_call = ToolCall(
            id=tool_call_id,
            type="function",
            function=FunctionCall(
                name=request.tool_name,
                arguments=json.dumps(request.tool_params, ensure_ascii=False),
            ),
        )

        results = await tool_call_executor.execute(
            tool_calls=[tool_call],
            agent_context=ctx,
            is_code_mode=True,
        )

        if results:
            result = results[0]
            logger.debug(f"工具调试调用完成: {request.tool_name}, ok: {result.ok}")

            result_dict = {
                "ok": result.ok,
                "content": result.content,
                "tool_call_id": result.tool_call_id,
                "execution_time": result.execution_time,
                "name": result.name,
                "data": result.data,
            }

            return create_success_response(
                message="Tool debug call succeeded" if result.ok else "Tool debug call failed",
                data=result_dict,
            )

        error_msg = "Tool execution returned no result."
        logger.error(error_msg)
        return create_error_response(
            message=error_msg,
            data={"ok": False, "content": error_msg},
        )

    except Exception as e:
        logger.error(f"调试调用工具时发生异常: {e}", exc_info=True)
        return create_error_response(
            message=f"Tool debug call failed: {e!s}",
            data={"ok": False, "content": str(e)},
        )


@router.get("/tools", response_model=BaseResponse)
async def sdk_list_tools():
    """
    获取所有内置工具列表及其 Schema

    返回每个工具的名称、描述和参数定义（OpenAI function calling 格式）。
    """
    try:
        from app.tools.core.tool_factory import tool_factory

        await tool_factory.ensure_definitions_initialized()
        tool_names = tool_factory.get_code_mode_tool_names()

        tools = []
        for name in tool_names:
            param = tool_factory.get_tool_param_from_definition(name)
            if param is None:
                continue
            func = param.get("function", {})
            tools.append(
                {
                    "name": name,
                    "description": func.get("description", ""),
                    "input_schema": func.get("parameters", {}),
                }
            )

        return create_success_response(
            message=f"获取内置工具列表成功，共 {len(tools)} 个工具",
            data={"tools": tools},
        )

    except Exception as e:
        logger.error(f"获取内置工具列表时发生异常: {e}", exc_info=True)
        return create_error_response(
            message=f"获取工具列表失败: {e!s}",
            data={"tools": []},
        )


@router.get("/contexts", response_model=BaseResponse)
async def sdk_list_contexts():
    """
    获取当前活跃的 AgentContext 列表

    返回可供工具调用的 agent_context_id 列表及其标签信息。
    """
    try:
        from app.core.context.agent_context_registry import AgentContextRegistry

        contexts = AgentContextRegistry.get_instance().list_contexts()
        context_list = []
        for ctx in contexts:
            label = ctx.get_agent_session_label() if hasattr(ctx, "get_agent_session_label") else ""
            context_list.append(
                {
                    "context_id": ctx.context_id,
                    "label": label,
                }
            )

        return create_success_response(
            message=f"获取 AgentContext 列表成功，共 {len(context_list)} 个",
            data={"contexts": context_list},
        )

    except Exception as e:
        logger.error(f"获取 AgentContext 列表时发生异常: {e}", exc_info=True)
        return create_error_response(
            message=f"获取 AgentContext 列表失败: {e!s}",
            data={"contexts": []},
        )


# ── execution cancel ──────────────────────────────────────────────


class SdkExecutionCancelRequest(BaseModel):
    """取消指定 Code Mode 执行的请求"""

    agent_context_id: str = Field(..., description="调用方 AgentContext 标识")
    sdk_execution_id: str = Field(
        "",
        description="要取消的 sdk_execution_id，为空则取消该 context 下所有请求",
    )


@router.post("/execution/cancel", response_model=BaseResponse)
async def sdk_execution_cancel(request: SdkExecutionCancelRequest):
    """
    取消指定 Code Mode 执行下的所有 in-flight SDK 请求。

    内部主链路通过 RunCleanupRegistry 直接调用 registry 取消，无需走 HTTP；
    此接口供外部调试链路或 SDK 外部调用方显式取消。
    """
    try:
        registry = SdkCallRegistry.get_instance()
        if request.sdk_execution_id:
            cancelled = registry.cancel_by_execution(
                request.agent_context_id,
                request.sdk_execution_id,
            )
        else:
            cancelled = registry.cancel_by_context(request.agent_context_id)

        return create_success_response(
            message=f"Cancelled {cancelled} in-flight SDK request(s)",
            data={"cancelled_count": cancelled},
        )

    except Exception as e:
        logger.error(f"取消 SDK 执行时发生异常: {e}", exc_info=True)
        return create_error_response(
            message=f"Cancel failed: {e!s}",
            data={"cancelled_count": 0},
        )
