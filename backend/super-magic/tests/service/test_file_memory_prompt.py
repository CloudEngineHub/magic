"""主 Agent 文件型持久记忆 Prompt 测试。"""

import re
from pathlib import Path

from agentlang.agent.loader import AgentLoader

AGENTS_DIR = Path(__file__).resolve().parents[2] / "agents"
MEMORY_ROOT = "/mock/home/.magic/memory"


def _load_magic_agent():
    """使用模拟静态变量加载主 Agent 配置。"""
    variables = {
        "agent_name": "mock-agent",
        "agent_profile": "Mock agent profile.",
        "workspace_dir": "/tmp/mock-workspace",
        "workspace_skills_dir": ".magic/skills",
        "project_root": "/tmp/mock-project",
        "memory_root": MEMORY_ROOT,
        "cwd": "/tmp/mock-workspace",
        "python_version": "mock-python",
        "nodejs_version": "mock-node",
        "typescript_version": "mock-tsc",
        "slide_template_html": "",
        "managed_agent_code": "",
        "crew_skills_dir": "",
        "preloaded_skills_content": "",
        "skills_content": "",
        "system_skills_dir": "/tmp/mock-project/agents/skills",
    }
    return AgentLoader(AGENTS_DIR).load_agent("magic", variables)


def test_magic_agent_uses_file_based_memory_prompt():
    """主 Agent 应加载文件记忆规则和通用文件工具。"""
    agent = _load_magic_agent()

    assert "File-Based Persistent Memory" in agent.prompt
    assert f"Persistent Memory Root (absolute): `{MEMORY_ROOT}`" in agent.prompt
    assert "<current_project_id>" not in agent.prompt
    assert f"{MEMORY_ROOT}/" in agent.prompt
    assert "$HOME/.magic/memory" not in agent.prompt
    assert "do not run shell commands to discover or resolve the home directory" in agent.prompt
    assert "global/" in agent.prompt
    assert "projects/p_<project_id>/" in agent.prompt
    assert ".credentials/init_client_message.json" not in agent.prompt
    assert "Core memory appears inside `<persistent_memory>`" in agent.prompt
    assert '<project_memory project_id="..." path="...">' in agent.prompt
    assert "<memory_filesystem>" in agent.prompt
    assert "<persistent_memory>" in agent.prompt
    assert 'include="*.md"' in agent.prompt
    assert "By default, use `grep_search`" in agent.prompt
    assert 'include="MEMORY.md"' in agent.prompt
    assert "You may search and use another project's memory" in agent.prompt
    assert "never assume that another project's conventions apply to the current project" in agent.prompt
    assert "project-specific knowledge in the source project's directory" in agent.prompt
    assert "Files under `notes/` are not loaded automatically" in agent.prompt
    assert "Modify an existing memory file only with an edit capability" in agent.prompt
    assert "Use `write_file` only to create a new file" in agent.prompt
    assert "use `delete_files` and follow its confirmation workflow" in agent.prompt
    assert "Never use shell deletion for memory files" in agent.prompt
    assert "Do not create or use symbolic links inside the memory tree" in agent.prompt
    assert {"grep_search", "read_files", "write_file", "edit_file", "shell_exec"}.issubset(agent.tools_config)
    memory_prompt = agent.prompt.split("<memory_filesystem>", maxsplit=1)[1].split("</memory_filesystem>", maxsplit=1)[
        0
    ]
    assert "Horizon" not in memory_prompt
    assert "AgentContext" not in memory_prompt
    assert "initialization messages" not in memory_prompt
    assert "credential files" not in memory_prompt
    assert "VM restarts" not in memory_prompt
    assert re.search(r"[\u4e00-\u9fff]", memory_prompt) is None


def test_magic_agent_does_not_expose_dedicated_memory_capabilities():
    """主 Agent 不应引用专用记忆工具或管理 Skill。"""
    agent = _load_magic_agent()
    skill_names = set(agent.skills_config.get_system_skill_names())

    assert "memory-manager" not in skill_names
    for name in (
        "create_memory",
        "update_memory",
        "delete_memory",
        "search_memory",
        "get_memory",
        "save_memory",
        "forget_memory",
        "list_memory",
    ):
        assert name not in agent.prompt
        assert name not in agent.tools_config


def test_magic_agent_memory_prompt_requires_explicit_subject_attribution():
    """文件记忆 Prompt 应按原始说话者视角解析并显式记录主体。"""
    agent = _load_magic_agent()

    assert "original speaker's perspective" in agent.prompt
    assert "first-person references normally identify the current user" in agent.prompt
    assert "second-person references normally identify the current assistant" in agent.prompt
    assert "normalize each fact into an explicit-subject statement" in agent.prompt
    assert "do not store durable facts with ambiguous first- or second-person pronouns" in agent.prompt
    assert "The user prefers to call the assistant <name>" in agent.prompt
    assert "The user's name is <name>" in agent.prompt
