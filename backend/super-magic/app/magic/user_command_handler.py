"""用户命令处理器

提供统一的用户命令注册、检测和处理机制。
支持命令变体（如多语言、简写、斜杠前缀等）。
"""

import asyncio
from dataclasses import dataclass
from typing import Callable, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from app.magic.agent import Agent

from agentlang.logger import get_logger

logger = get_logger(__name__)


@dataclass
class Command:
    """命令定义"""
    name: str  # 命令名称标识
    variants: List[str]  # 命令的各种变体形式
    handler: Callable  # 命令处理函数
    accept_args: bool = False  # 是否接受命令后附带参数


@dataclass
class CommandMatch:
    """命令匹配结果"""
    command: Command
    args: str  # 命令后面的参数文本，无参数时为空字符串


class Commands:
    """命令注册中心

    提供命令的注册、查找和处理功能。
    命令在注册时自动构建查找表，支持快速检测。
    """

    _registry: List[Command] = []
    _lookup: dict = {}

    @classmethod
    def register(cls, name: str, variants: List[str], handler: Callable, accept_args: bool = False) -> Command:
        """注册命令

        Args:
            name: 命令名称
            variants: 命令变体列表（支持多语言、简写等）
            handler: 命令处理函数，签名为 (agent: Agent, args: str) -> str
            accept_args: 是否接受命令后附带参数（默认关闭，避免前缀匹配误判）

        Returns:
            Command: 注册的命令对象
        """
        cmd = Command(name, variants, handler, accept_args)
        cls._registry.append(cmd)

        # 立即构建查找表（不区分大小写）
        for variant in variants:
            cls._lookup[variant.lower()] = cmd

        logger.debug(f"注册命令: {name}, 变体: {variants}, 接受参数: {accept_args}")
        return cmd

    @classmethod
    def get(cls, query: str) -> Optional[CommandMatch]:
        """获取命令匹配结果

        匹配策略：
        1. 精确匹配（所有命令）
        2. 前缀匹配（仅 accept_args=True 的命令）

        Args:
            query: 用户输入

        Returns:
            CommandMatch: 匹配成功时返回命令和参数，否则返回 None
        """
        query_lower = query.lower()

        # 精确匹配
        cmd = cls._lookup.get(query_lower)
        if cmd:
            return CommandMatch(command=cmd, args="")

        # 前缀匹配：仅对 accept_args=True 的命令生效
        # 按 variant 长度降序，避免短前缀误匹配
        for variant, cmd in sorted(cls._lookup.items(), key=lambda x: len(x[0]), reverse=True):
            if not cmd.accept_args:
                continue
            # 检查 variant 后跟空格或换行（避免 /c 匹配到 /compact）
            for sep in (" ", "\n"):
                prefix = variant + sep
                if query_lower.startswith(prefix):
                    args = query[len(prefix):].strip()
                    return CommandMatch(command=cmd, args=args)

        return None

    @classmethod
    async def process(cls, query: str, agent: 'Agent') -> str:
        """处理命令

        检测并转换用户输入。如果是命令，调用处理函数并返回转换后的内容；
        如果不是命令，返回原始输入。

        Args:
            query: 用户输入
            agent: Agent 实例

        Returns:
            str: 处理后的查询内容
        """
        match = cls.get(query)
        if not match:
            return query

        logger.info(f"检测到用户命令: {match.command.name}" + (f", 参数: {match.args}" if match.args else ""))

        # 调用处理函数，传入 args
        result = match.command.handler(agent, match.args)

        # 处理异步结果
        if asyncio.iscoroutine(result):
            result = await result

        return result


# ===== 命令处理函数 =====

def handle_compact(agent: 'Agent', args: str = "") -> str:
    """处理压缩命令：返回压缩请求内容"""
    logger.info("用户手动触发聊天历史压缩" + (f"，附带要求: {args}" if args else ""))
    return agent._build_compact_request(user_instruction=args)


def handle_continue(agent: 'Agent', args: str = "") -> str:
    """处理继续命令：返回标准化的继续指令"""
    return "继续"


async def handle_new_session(agent: 'Agent', args: str = "") -> str:
    """处理新会话命令：清空上下文历史，根据 agent 模式发送对应的重置提示词"""
    logger.info("用户触发新会话重置 /new")
    await agent._reset_for_new_session()

    # magiclaw 模式有工作区文件（SOUL.md / USER.md / memory）需要在响应前读取，
    # 其他模式没有这套约定，只需简单问候即可
    chat_message = agent.agent_context.get_chat_client_message()
    is_magiclaw = chat_message and str(chat_message.agent_mode) == "magiclaw"

    if is_magiclaw:
        return (
            "A new session was started via /new. The previous conversation history has been cleared. "
            "The runtime has reset your required-file tracking — a <magiclaw_startup> block "
            "will follow this message listing which workspace files you still need to read. "
            "Read all listed files now, then greet the user in your configured persona. "
            "Keep the greeting to 1-3 sentences and ask what they want to do. "
            "Do not mention internal steps, files, or tools."
        )
    return (
        "A new session was started via /new. The previous conversation history has been cleared. "
        "Greet the user briefly and ask what they want to do. "
        "Keep it to 1-2 sentences. Do not mention internal steps or tools."
    )


def handle_resume(agent: 'Agent', args: str = "") -> str:
    """处理 resume 命令：系统内部专用，用于 ask_user 等工具等待用户答复后恢复 Agent。
    与 continue 的区别：continue 是用户主动发起的继续指令；resume 是系统在 ToolResult
    已写入历史后发出的恢复信号，Agent 收到后应直接让 LLM 响应，不追加任何用户消息。
    """
    return "/resume"


# ===== 注册内置命令 =====

Commands.register(
    name="compact",
    variants=['/compact', '/c', 'compact', '压缩'],
    handler=handle_compact,
    accept_args=True,
)

Commands.register(
    name="continue",
    variants=['/continue'],
    handler=handle_continue
)

Commands.register(
    name="new",
    variants=['/new', '/reset'],
    handler=handle_new_session
)

Commands.register(
    name="resume",
    variants=['/resume'],
    handler=handle_resume
)
