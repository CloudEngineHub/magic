"""沙箱环境检测工具。"""

from agentlang.logger import get_logger

from app.core.entity.message.client_message import AgentMode
from app.path_manager import PathManager
from app.utils.async_file_utils import async_try_read_json

logger = get_logger(__name__)


async def is_magiclaw_sandbox() -> bool:
    """根据初始化消息顶层的 agent_mode 判断当前沙箱是否为 MagicClaw。"""
    data = await async_try_read_json(PathManager.get_init_client_message_file())
    if not isinstance(data, dict):
        return False

    return data.get("agent_mode") == AgentMode.MAGICLAW.value
