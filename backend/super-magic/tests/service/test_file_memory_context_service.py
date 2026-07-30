"""文件型持久记忆上下文与生命周期测试。"""

from pathlib import Path
from unittest.mock import AsyncMock, Mock

import pytest

from agentlang.event.data import AfterMainAgentRunEventData, BeforeMainAgentRunEventData
from agentlang.event.event import Event, EventType
from agentlang.interface.context import AgentContextInterface
from app.core.context.agent_context import AgentContext
from app.core.horizon.agent_horizon import AgentHorizon
from app.core.horizon.models import HorizonState
from app.core.horizon.store import HorizonStore
from app.service.memory.runtime.context import memory_core_context_service as context_module
from app.service.memory.runtime.context.memory_core_context_service import (
    MEMORY_CONTEXT_MAX_CHARS,
    MEMORY_FILE_MAX_CHARS,
    MEMORY_FILE_READ_MAX_BYTES,
    MemoryCoreContextService,
)
from app.service.memory.runtime.events.memory_event_listener import MemoryListenerService
from app.utils.file_utils import WorkspaceSnapshot

MEMORY_ROOT = Path("/mock/home/.magic/memory")


class FakeAgentContext:
    """提供 Horizon 依赖的模拟 AgentContext。"""

    def __init__(self, project_id: str | None = None) -> None:
        """初始化模拟上下文、项目 ID 和 Horizon。"""
        self.context_id = "context-1"
        self.horizon = Mock()
        self.horizon.set_memory = AsyncMock()
        self._project_id = project_id

    def get_project_id(self) -> str | None:
        """返回模拟的当前项目 ID。"""
        return self._project_id


def _mock_memory_io(
    monkeypatch,
    contents: dict[Path, str],
) -> tuple[AsyncMock, AsyncMock]:
    """用内存数据模拟软链检查和 Markdown 读取。"""
    is_symlink = AsyncMock(return_value=False)

    def _read_bytes(path: Path, size: int | None = None, offset: int = 0) -> bytes:
        """按真实读取参数返回模拟 Markdown 字节。"""
        content = contents.get(Path(path), "").encode("utf-8")
        end = offset + size if size is not None else None
        return content[offset:end]

    read_bytes = AsyncMock(side_effect=_read_bytes)
    monkeypatch.setattr(context_module, "async_is_symlink", is_symlink)
    monkeypatch.setattr(
        context_module,
        "async_exists",
        AsyncMock(side_effect=lambda path: Path(path) in contents),
    )
    monkeypatch.setattr(context_module, "async_read_bytes", read_bytes)
    return is_symlink, read_bytes


def _create_mock_horizon(
    loaded_state: HorizonState | None = None,
) -> tuple[AgentHorizon, Mock]:
    """创建不落盘的 Horizon 和模拟 Store。"""
    store = Mock(spec=HorizonStore)
    store.agent_name = "test-agent"
    store.path = Path("/mock/chat-history/test-agent.horizon.json")
    store.load = AsyncMock(return_value=loaded_state)
    store.save = AsyncMock()
    return AgentHorizon(store, "agent-1"), store


def _build_large_multiline_memory_context() -> str:
    """构造会触发首包总预算降级的多行核心记忆。"""
    global_memory = "\n".join(f"global line {index:03d} " + "g" * 70 for index in range(60))
    project_memory = "\n".join(f"project line {index:03d} " + "p" * 70 for index in range(60))
    return MemoryCoreContextService._build_memory_context(
        global_memory=global_memory,
        global_path=MEMORY_ROOT / "global" / "MEMORY.md",
        project_memory=project_memory,
        project_path=MEMORY_ROOT / "projects" / "p_project-1" / "MEMORY.md",
        project_id="project-1",
    )


def _assert_global_scope_without_content(memory_context: str) -> None:
    """断言上下文保留全局路径标签，但未注入实际记忆内容。"""
    assert memory_context.startswith("<persistent_memory>")
    global_file = MEMORY_ROOT / "global" / "MEMORY.md"
    assert f'<global_memory path="{global_file}">\n\n</global_memory>' in memory_context
    assert "<project_memory" not in memory_context


def test_agent_context_reads_project_id_from_current_message():
    """AgentContext 应直接从当前聊天消息读取并规范化项目 ID。"""
    chat_client_message = Mock()
    chat_client_message.metadata = Mock()
    chat_client_message.metadata.project_id = " project-1 "
    agent_context = Mock(spec=AgentContext)
    agent_context.get_chat_client_message.return_value = chat_client_message

    assert AgentContext.get_project_id(agent_context) == "project-1"


@pytest.mark.asyncio
async def test_file_memory_context_loads_global_and_current_project(monkeypatch):
    """启动记忆应同时加载全局和当前项目的 MEMORY.md。"""
    global_file = MEMORY_ROOT / "global" / "MEMORY.md"
    project_file = MEMORY_ROOT / "projects" / "p_project-1" / "MEMORY.md"
    _mock_memory_io(
        monkeypatch,
        {
            global_file: "global <preference>",
            project_file: "project decision",
        },
    )
    agent_context = FakeAgentContext(project_id="project-1")

    await MemoryCoreContextService(MEMORY_ROOT).load(agent_context)

    memory_context = agent_context.horizon.set_memory.await_args.args[0]
    assert f'<global_memory path="{global_file}">\nglobal &lt;preference&gt;\n</global_memory>' in memory_context
    assert f'<project_memory project_id="project-1" path="{project_file}">' in memory_context
    assert "project decision" in memory_context


@pytest.mark.asyncio
async def test_file_memory_context_skips_unsafe_project_id(monkeypatch):
    """不安全的项目 ID 不应用于访问项目记忆目录。"""
    global_file = MEMORY_ROOT / "global" / "MEMORY.md"
    _, read_bytes = _mock_memory_io(
        monkeypatch,
        {global_file: "global preference"},
    )
    agent_context = FakeAgentContext(project_id="../other")

    await MemoryCoreContextService(MEMORY_ROOT).load(agent_context)

    memory_context = agent_context.horizon.set_memory.await_args.args[0]
    assert "global preference" in memory_context
    assert "<project_memory" not in memory_context
    assert {Path(call.args[0]) for call in read_bytes.await_args_list} == {global_file}


@pytest.mark.asyncio
async def test_file_memory_context_builds_empty_snapshot_when_files_are_missing(monkeypatch):
    """核心记忆文件尚未创建时仍应推送当前作用域和绝对路径。"""
    _, read_bytes = _mock_memory_io(monkeypatch, {})
    agent_context = FakeAgentContext(project_id="project-1")

    await MemoryCoreContextService(MEMORY_ROOT).load(agent_context)

    memory_context = agent_context.horizon.set_memory.await_args.args[0]
    global_file = MEMORY_ROOT / "global" / "MEMORY.md"
    project_file = MEMORY_ROOT / "projects" / "p_project-1" / "MEMORY.md"
    assert f'<global_memory path="{global_file}">\n\n</global_memory>' in memory_context
    assert f'<project_memory project_id="project-1" path="{project_file}">\n\n</project_memory>' in memory_context
    read_bytes.assert_not_awaited()


@pytest.mark.asyncio
async def test_file_memory_context_refreshes_project_scope_for_each_load(monkeypatch):
    """每轮加载都应使用当前项目 ID，且不得保留上一项目的作用域。"""
    _mock_memory_io(monkeypatch, {})
    agent_context = FakeAgentContext(project_id="project-1")
    service = MemoryCoreContextService(MEMORY_ROOT)

    await service.load(agent_context)
    agent_context._project_id = "project-2"
    await service.load(agent_context)

    first_context = agent_context.horizon.set_memory.await_args_list[0].args[0]
    second_context = agent_context.horizon.set_memory.await_args_list[1].args[0]
    assert 'project_id="project-1"' in first_context
    assert "projects/p_project-1/MEMORY.md" in first_context
    assert 'project_id="project-1"' not in second_context
    assert "projects/p_project-1/MEMORY.md" not in second_context
    assert 'project_id="project-2"' in second_context
    assert "projects/p_project-2/MEMORY.md" in second_context


@pytest.mark.asyncio
async def test_file_memory_context_truncates_oversized_core_file(monkeypatch):
    """过大的核心记忆应在启动注入上限内截断。"""
    global_file = MEMORY_ROOT / "global" / "MEMORY.md"
    _, read_bytes = _mock_memory_io(
        monkeypatch,
        {global_file: "a" * (MEMORY_FILE_MAX_CHARS + 100)},
    )
    agent_context = FakeAgentContext()

    await MemoryCoreContextService(MEMORY_ROOT).load(agent_context)

    memory_context = agent_context.horizon.set_memory.await_args.args[0]
    global_memory = memory_context.split(f'<global_memory path="{global_file}">\n', maxsplit=1)[1].split(
        "\n</global_memory>", maxsplit=1
    )[0]
    assert len(global_memory) == MEMORY_FILE_MAX_CHARS
    assert global_memory.endswith("[Memory content truncated at the startup injection limit.]")
    assert read_bytes.await_args.kwargs["size"] == MEMORY_FILE_READ_MAX_BYTES + 1


@pytest.mark.asyncio
async def test_file_memory_context_limits_xml_escaped_payload(monkeypatch):
    """XML 转义放大后仍应保持在核心记忆和 Horizon 的安全预算内。"""
    global_file = MEMORY_ROOT / "global" / "MEMORY.md"
    project_file = MEMORY_ROOT / "projects" / "p_project-1" / "MEMORY.md"
    amplified_content = "&" * (MEMORY_FILE_MAX_CHARS + 100)
    _mock_memory_io(
        monkeypatch,
        {
            global_file: amplified_content,
            project_file: amplified_content,
        },
    )
    agent_context = FakeAgentContext(project_id="project-1")

    await MemoryCoreContextService(MEMORY_ROOT).load(agent_context)

    memory_context = agent_context.horizon.set_memory.await_args.args[0]
    global_memory = memory_context.split(f'<global_memory path="{global_file}">\n', maxsplit=1)[1].split(
        "\n</global_memory>", maxsplit=1
    )[0]
    project_memory = memory_context.split(
        f'<project_memory project_id="project-1" path="{project_file}">\n', maxsplit=1
    )[1].split("\n</project_memory>", maxsplit=1)[0]
    assert len(global_memory) <= MEMORY_FILE_MAX_CHARS
    assert len(project_memory) <= MEMORY_FILE_MAX_CHARS
    assert len(memory_context) <= MEMORY_CONTEXT_MAX_CHARS


@pytest.mark.asyncio
async def test_file_memory_context_ignores_symlink_path(monkeypatch):
    """核心记忆路径包含软链时不应读取或注入其内容。"""
    global_directory = MEMORY_ROOT / "global"
    _, read_bytes = _mock_memory_io(
        monkeypatch,
        {global_directory / "MEMORY.md": "external secret"},
    )
    monkeypatch.setattr(
        context_module,
        "async_is_symlink",
        AsyncMock(side_effect=lambda path: Path(path) == global_directory),
    )
    agent_context = FakeAgentContext()

    await MemoryCoreContextService(MEMORY_ROOT).load(agent_context)

    memory_context = agent_context.horizon.set_memory.await_args.args[0]
    _assert_global_scope_without_content(memory_context)
    read_bytes.assert_not_awaited()


@pytest.mark.asyncio
async def test_file_memory_context_ignores_symlink_memory_root(monkeypatch):
    """记忆根目录自身是软链时不应读取或注入其内容。"""
    global_file = MEMORY_ROOT / "global" / "MEMORY.md"
    _, read_bytes = _mock_memory_io(
        monkeypatch,
        {global_file: "external secret"},
    )
    monkeypatch.setattr(
        context_module,
        "async_is_symlink",
        AsyncMock(side_effect=lambda path: Path(path) == MEMORY_ROOT),
    )
    agent_context = FakeAgentContext()

    await MemoryCoreContextService(MEMORY_ROOT).load(agent_context)

    memory_context = agent_context.horizon.set_memory.await_args.args[0]
    _assert_global_scope_without_content(memory_context)
    read_bytes.assert_not_awaited()


@pytest.mark.asyncio
async def test_file_memory_context_builds_empty_snapshot_after_load_failure(monkeypatch):
    """读取当前项目 ID 发生意外异常时应推送空快照且不阻断主流程。"""
    _mock_memory_io(monkeypatch, {})
    agent_context = FakeAgentContext()
    agent_context.get_project_id = Mock(side_effect=RuntimeError("mock context failure"))

    await MemoryCoreContextService(MEMORY_ROOT).load(agent_context)

    memory_context = agent_context.horizon.set_memory.await_args.args[0]
    _assert_global_scope_without_content(memory_context)


@pytest.mark.asyncio
async def test_file_memory_context_isolates_single_scope_read_failure(monkeypatch):
    """单个作用域读取失败时仍应注入另一个可用作用域。"""
    global_file = MEMORY_ROOT / "global" / "MEMORY.md"
    project_file = MEMORY_ROOT / "projects" / "p_project-1" / "MEMORY.md"
    _mock_memory_io(
        monkeypatch,
        {
            global_file: "mock existing global file",
            project_file: "mock existing project file",
        },
    )

    async def _read_bytes(path: Path, size: int | None = None, offset: int = 0) -> bytes:
        """模拟全局记忆失败和项目记忆成功。"""
        if Path(path) == global_file:
            raise RuntimeError("mock global read failure")
        if Path(path) == project_file:
            return b"project decision"
        return b""

    monkeypatch.setattr(
        context_module,
        "async_read_bytes",
        AsyncMock(side_effect=_read_bytes),
    )
    agent_context = FakeAgentContext(project_id="project-1")

    await MemoryCoreContextService(MEMORY_ROOT).load(agent_context)

    memory_context = agent_context.horizon.set_memory.await_args.args[0]
    assert f'<global_memory path="{global_file}">\n\n</global_memory>' in memory_context
    assert "project decision" in memory_context


def test_file_memory_context_escapes_absolute_path_attributes():
    """记忆文件绝对路径应作为经过 XML 转义的标签属性注入。"""
    global_path = Path('/mock/home/a & "b"/.magic/memory/global/MEMORY.md')
    project_path = Path('/mock/home/a & "b"/.magic/memory/projects/p_project-1/MEMORY.md')

    memory_context = MemoryCoreContextService._build_memory_context(
        global_memory="global preference",
        global_path=global_path,
        project_memory="project decision",
        project_path=project_path,
        project_id="project-1",
    )

    assert 'path="/mock/home/a &amp; &quot;b&quot;/.magic/memory/global/MEMORY.md"' in memory_context
    assert 'path="/mock/home/a &amp; &quot;b&quot;/.magic/memory/projects/p_project-1/MEMORY.md"' in memory_context


@pytest.mark.asyncio
async def test_memory_listener_delegates_before_run_to_lifecycle(monkeypatch):
    """记忆监听器应通过运行前事件委托核心记忆注入。"""
    agent_context = FakeAgentContext()
    lifecycle_coordinator = Mock()
    lifecycle_coordinator.before_run = AsyncMock()
    monkeypatch.setattr(MemoryListenerService, "_lifecycle_coordinator", lifecycle_coordinator)
    monkeypatch.setattr(
        MemoryListenerService,
        "_resolve_agent_context",
        staticmethod(lambda _context: agent_context),
    )
    monkeypatch.setattr(
        MemoryListenerService,
        "_is_enabled",
        staticmethod(lambda _context: True),
    )
    event = Event(
        EventType.BEFORE_MAIN_AGENT_RUN,
        BeforeMainAgentRunEventData(
            agent_context=Mock(spec=AgentContextInterface),
            agent_name="magic",
            query="continue",
        ),
    )

    await MemoryListenerService._handle_before_main_agent_run(event)

    lifecycle_coordinator.before_run.assert_awaited_once_with(agent_context)


@pytest.mark.asyncio
async def test_memory_listener_preserves_after_run_extraction_hook(monkeypatch):
    """记忆监听器应保留主 Agent 结束后的提取扩展点。"""
    agent_context = FakeAgentContext()
    lifecycle_coordinator = Mock()
    lifecycle_coordinator.after_run = AsyncMock()
    monkeypatch.setattr(MemoryListenerService, "_lifecycle_coordinator", lifecycle_coordinator)
    monkeypatch.setattr(
        MemoryListenerService,
        "_resolve_agent_context",
        staticmethod(lambda _context: agent_context),
    )
    monkeypatch.setattr(
        MemoryListenerService,
        "_is_enabled",
        staticmethod(lambda _context: True),
    )
    event = Event(
        EventType.AFTER_MAIN_AGENT_RUN,
        AfterMainAgentRunEventData(
            agent_context=Mock(spec=AgentContextInterface),
            agent_name="magic",
            agent_state="finished",
            query="continue",
        ),
    )

    await MemoryListenerService._handle_after_main_agent_run(event)

    lifecycle_coordinator.after_run.assert_awaited_once_with(agent_context, event)


def test_memory_listener_only_enables_regular_main_agent():
    """文件记忆生命周期只应对普通主 Agent 启用。"""
    agent_context = Mock()
    agent_context.is_main_agent_context.return_value = True
    agent_context.is_magiclaw.return_value = False
    assert MemoryListenerService._is_enabled(agent_context) is True

    agent_context.is_main_agent_context.return_value = False
    assert MemoryListenerService._is_enabled(agent_context) is False

    agent_context.is_main_agent_context.return_value = True
    agent_context.is_magiclaw.return_value = True
    assert MemoryListenerService._is_enabled(agent_context) is False


@pytest.mark.asyncio
async def test_horizon_injects_prebuilt_memory_in_initial_context():
    """Horizon 首次上下文应注入调用方提供的完整记忆字符串。"""
    horizon, _ = _create_mock_horizon()
    memory_context = MemoryCoreContextService._build_memory_context(
        global_memory="global preference",
        global_path=MEMORY_ROOT / "global" / "MEMORY.md",
        project_memory="project decision",
        project_path=MEMORY_ROOT / "projects" / "p_project-1" / "MEMORY.md",
        project_id="project-1",
    )
    await horizon.set_memory(memory_context)

    context = await horizon.build_context_update("unit-test")

    assert context is not None
    assert memory_context in context


@pytest.mark.asyncio
async def test_horizon_reinjects_memory_after_context_reset():
    """新上下文窗口应重新注入已加载的通用记忆字符串。"""
    horizon, _ = _create_mock_horizon()
    memory_context = MemoryCoreContextService._build_memory_context(
        global_memory="global preference",
        global_path=MEMORY_ROOT / "global" / "MEMORY.md",
        project_memory="project decision",
        project_path=MEMORY_ROOT / "projects" / "p_project-1" / "MEMORY.md",
        project_id="project-1",
    )
    await horizon.set_memory(memory_context)
    await horizon.build_context_update("unit-test")

    await horizon.on_context_reset()
    reset_context = await horizon.build_context_update("unit-test")

    assert reset_context is not None
    assert memory_context in reset_context


@pytest.mark.asyncio
async def test_horizon_injects_full_memory_only_after_change():
    """相同记忆不应重复提示，大幅变化后应输出一次完整新快照。"""
    horizon, _ = _create_mock_horizon()
    initial_memory = "<persistent_memory>initial</persistent_memory>"
    updated_memory = _build_large_multiline_memory_context()
    await horizon.set_memory(initial_memory)
    await horizon.build_context_update("unit-test")

    await horizon.set_memory(initial_memory)
    unchanged_context = await horizon.build_context_update("unit-test")
    await horizon.set_memory(updated_memory)
    changed_context = await horizon.build_context_update("unit-test")
    settled_context = await horizon.build_context_update("unit-test")

    assert unchanged_context is not None
    assert updated_memory not in unchanged_context
    assert changed_context is not None
    assert updated_memory in changed_context
    assert "[summary:" not in changed_context
    assert settled_context is not None
    assert updated_memory not in settled_context


@pytest.mark.asyncio
async def test_horizon_retries_initial_context_after_budget_failure():
    """首包整体超限时不应推进 baseline，预算恢复后应重新注入完整上下文。"""
    horizon, _ = _create_mock_horizon()
    memory_context = _build_large_multiline_memory_context()
    await horizon.set_workspace_snapshot(WorkspaceSnapshot(display="w" * 22_000, entries=[]))
    await horizon.set_memory(memory_context)

    oversized_context = await horizon.build_context_update("unit-test")
    await horizon.set_workspace_snapshot(WorkspaceSnapshot(display="", entries=[]))
    retried_context = await horizon.build_context_update("unit-test")
    settled_context = await horizon.build_context_update("unit-test")

    assert oversized_context is None
    assert retried_context is not None
    assert memory_context in retried_context
    assert settled_context is not None
    assert memory_context not in settled_context


@pytest.mark.asyncio
async def test_horizon_retries_context_reset_after_budget_failure():
    """上下文重置后的首包超限时，应保持首次注入状态并整体重试。"""
    horizon, _ = _create_mock_horizon()
    memory_context = _build_large_multiline_memory_context()
    await horizon.set_memory(memory_context)
    previous_context = await horizon.build_context_update("unit-test")
    assert previous_context is not None
    assert memory_context in previous_context

    await horizon.set_workspace_snapshot(WorkspaceSnapshot(display="w" * 22_000, entries=[]))
    await horizon.on_context_reset()
    oversized_context = await horizon.build_context_update("unit-test")
    await horizon.set_workspace_snapshot(WorkspaceSnapshot(display="", entries=[]))
    retried_context = await horizon.build_context_update("unit-test")
    settled_context = await horizon.build_context_update("unit-test")

    assert oversized_context is None
    assert retried_context is not None
    assert memory_context in retried_context
    assert settled_context is not None
    assert memory_context not in settled_context
