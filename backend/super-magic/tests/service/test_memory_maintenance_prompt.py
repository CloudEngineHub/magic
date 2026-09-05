import sys
import types
from importlib import import_module
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

# 只保留本测试需要的包路径，避免加载不相关的云存储依赖。
_storage_package_was_stubbed = "app.infrastructure.storage" not in sys.modules
if _storage_package_was_stubbed:
    storage_package = types.ModuleType("app.infrastructure.storage")
    storage_package.__path__ = [
        str(Path(__file__).resolve().parents[2] / "app" / "infrastructure" / "storage")
    ]
    sys.modules["app.infrastructure.storage"] = storage_package

_tools_package_was_stubbed = "app.tools" not in sys.modules
if _tools_package_was_stubbed:
    tools_package = types.ModuleType("app.tools")
    tools_package.__path__ = [str(Path(__file__).resolve().parents[2] / "app" / "tools")]
    sys.modules["app.tools"] = tools_package

maintenance_module = import_module(
    "app.service.memory.runtime.extraction.memory_maintenance_prompt"
)
prompts_module = import_module(
    "app.service.memory.runtime.extraction.memory_extraction_prompts"
)
AutoReadFileCandidate = import_module("app.service.auto_read_file_service").AutoReadFileCandidate
AutoReadLoadPolicy = import_module("app.service.auto_read_file_service").AutoReadLoadPolicy
AutoReadRuleId = import_module("app.service.auto_read_file_service").AutoReadRuleId
MemoryMaintenancePromptBuilder = maintenance_module.MemoryMaintenancePromptBuilder
MemoryExtractionPromptProvider = import_module(
    "app.service.memory.runtime.extraction.memory_extraction_prompt_provider"
).MemoryExtractionPromptProvider
AgentProviderType = import_module("app.core.models.agent_runtime").AgentProviderType
AgentTarget = import_module("app.core.models.agent_runtime").AgentTarget
MemoryExtractionPromptName = prompts_module.MemoryExtractionPromptName
get_memory_extraction_prompt = prompts_module.get_memory_extraction_prompt

if _tools_package_was_stubbed:
    sys.modules.pop("app.tools", None)
if _storage_package_was_stubbed:
    sys.modules.pop("app.infrastructure.storage", None)


def _candidate(path: Path, rule_id: AutoReadRuleId) -> AutoReadFileCandidate:
    """构造一个已通过路径安全检查的记忆文件候选。"""
    return AutoReadFileCandidate(
        rule_id=rule_id,
        load_policy=AutoReadLoadPolicy.ALWAYS,
        absolute_path=path,
        display_path=str(path),
        scope="user-memory",
        priority=20,
    )


@pytest.mark.asyncio
async def test_memory_maintenance_prompt_only_lists_files_at_or_over_limit(monkeypatch, tmp_path):
    """只有达到 16KB 的文件才进入动态整理提示。"""
    global_path = tmp_path / "global" / "MEMORY.md"
    project_path = tmp_path / "project" / "MEMORY.md"
    candidates = (
        _candidate(global_path, AutoReadRuleId.GLOBAL_MEMORY),
        _candidate(project_path, AutoReadRuleId.PROJECT_MEMORY),
    )

    async def fake_candidates(_context):
        return candidates

    async def fake_stat(path):
        return SimpleNamespace(st_size=16 * 1024 if path == global_path else 15 * 1024)

    monkeypatch.setattr(
        maintenance_module.AutoReadFileService,
        "resolve_memory_file_candidates",
        fake_candidates,
    )
    monkeypatch.setattr(maintenance_module, "async_stat", fake_stat)

    prompt = await MemoryMaintenancePromptBuilder().build(SimpleNamespace())

    assert str(global_path) in prompt
    assert "current size: 16.0 KiB" in prompt
    assert "suggested target: <= 16 KiB" in prompt
    assert str(project_path) not in prompt
    assert "notes/" in prompt


@pytest.mark.asyncio
async def test_memory_maintenance_prompt_skips_missing_files(monkeypatch, tmp_path):
    """单个文件 stat 失败时不阻断 AfterRun，也不生成错误提醒。"""
    path = tmp_path / "global" / "MEMORY.md"

    async def fake_candidates(_context):
        return (_candidate(path, AutoReadRuleId.GLOBAL_MEMORY),)

    async def fake_stat(_path):
        raise FileNotFoundError(path)

    monkeypatch.setattr(
        maintenance_module.AutoReadFileService,
        "resolve_memory_file_candidates",
        fake_candidates,
    )
    monkeypatch.setattr(maintenance_module, "async_stat", fake_stat)

    assert await MemoryMaintenancePromptBuilder().build(SimpleNamespace()) == ""


@pytest.mark.asyncio
async def test_prompt_provider_appends_dynamic_maintenance_prompt():
    """提示词提供器把动态整理段落追加到对应的静态 AfterRun 提示词。"""
    builder = SimpleNamespace(build=AsyncMock(return_value="\n<dynamic-maintenance />"))
    provider = MemoryExtractionPromptProvider(builder)
    target = AgentTarget(AgentProviderType.BUILTIN, "magic")

    prompt = await provider.load(target, agent_context=SimpleNamespace())

    assert prompt.endswith("\n<dynamic-maintenance />")
    builder.build.assert_awaited_once()


def test_memory_extraction_prompt_method_supports_placeholders():
    """公开方法可以使用映射参数和关键字占位符渲染内置模板。"""
    result = get_memory_extraction_prompt(
        MemoryExtractionPromptName.MEMORY_MAINTENANCE,
        {"memory_files": "- /tmp/global/MEMORY.md (16.0 KiB; limit 16 KiB)"},
    )

    assert "Files requiring maintenance:" in result
    assert "/tmp/global/MEMORY.md" in result
    assert "<!--zh" not in result


def test_memory_extraction_prompt_method_supports_keyword_placeholders():
    """公开方法支持关键字占位符。"""
    result = get_memory_extraction_prompt(
        MemoryExtractionPromptName.MEMORY_MAINTENANCE,
        {"prefix": "memory"},
        memory_files="- maintenance",
    )

    assert "- maintenance" in result


def test_memory_extraction_prompt_renderer_reports_missing_placeholder():
    """内置模板缺少占位符时返回可定位的参数错误。"""
    with pytest.raises(ValueError, match="缺少占位符"):
        get_memory_extraction_prompt(
            MemoryExtractionPromptName.MEMORY_MAINTENANCE,
        )


def test_memory_extraction_prompt_source_keeps_developer_annotations():
    """模板源码保留中文开发注释，便于维护提示词时阅读。"""
    source = (
        Path(__file__).resolve().parents[2]
        / "app"
        / "service"
        / "memory"
        / "runtime"
        / "extraction"
        / "memory_extraction_prompts.py"
    ).read_text(encoding="utf-8")

    assert "<!--zh" in source


def test_memory_prompt_keeps_storage_and_retrieval_only():
    """主提示词保留目录和读取说明，不再承载完整写入规则。"""
    prompt_path = (
        Path(__file__).resolve().parents[2] / "agents" / "prompts" / "file_memory_instructions.prompt"
    )
    content = prompt_path.read_text(encoding="utf-8")

    assert "### Storage" in content
    assert "### When to read memory" in content
    assert "notes/" in content
    assert len(content.encode("utf-8")) < 8 * 1024
    assert content.count("<!--zh") == 1
    assert "Normalize every stored fact" not in content
