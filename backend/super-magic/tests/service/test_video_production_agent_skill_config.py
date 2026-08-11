from pathlib import Path

from agentlang.agent.define.parser import parse_agent_file
from app.core.entity.message.client_message import AgentMode

AGENTS_DIR = Path(__file__).resolve().parents[2] / "agents"
SKILLS_DIR = AGENTS_DIR / "skills"


def _load_agent(agent_name: str):
    """读取并解析指定的内置 Agent 配置。"""
    content = (AGENTS_DIR / f"{agent_name}.agent").read_text(encoding="utf-8")
    return parse_agent_file(content)[0]


def test_video_production_agent_preloads_independent_skill():
    """视频制作 Agent 必须只预加载独立的视频制作 Skill。"""
    agent_define = _load_agent("video-production")

    assert agent_define.skills_config is not None
    preload_names = [entry.name for entry in agent_define.skills_config.preload]
    assert preload_names == ["video-production"]
    assert (SKILLS_DIR / "video-production" / "SKILL.md").is_file()


def test_design_agent_does_not_preload_video_production_skill():
    """原画布设计 Agent 不得承载完整视频制作 Skill。"""
    agent_define = _load_agent("design")

    assert agent_define.skills_config is not None
    preload_names = [entry.name for entry in agent_define.skills_config.preload]
    assert "canvas-designer" in preload_names
    assert "video-production" not in preload_names


def test_video_production_agent_uses_code_mode_for_business_tools():
    """Canvas 业务工具走 Code Mode，计划维护使用直接文件工具。"""
    agent_define = _load_agent("video-production")
    direct_tool_names = set(agent_define.tools_config.keys())

    assert direct_tool_names.isdisjoint(
        {
            "generate_canvas_images",
            "generate_canvas_videos",
            "generate_video_production_images",
            "generate_video_production_videos",
            "upsert_storyboard",
            "configure_video_edit",
            "compose_canvas_video",
        }
    )
    assert {"list_dir", "grep_search", "read_files", "write_file", "edit_file"} <= direct_tool_names
    assert {"multi_edit_file", "shell_exec"}.isdisjoint(direct_tool_names)


def test_video_production_skill_uses_plain_markdown_plans():
    """视频计划只使用普通 Markdown 和通用文件工具。"""
    content = (SKILLS_DIR / "video-production" / "SKILL.md").read_text(encoding="utf-8")

    assert ".magic/video-production-plans/" in content
    assert "ordinary Markdown" in content
    assert "task-fitting headings and human-readable progress" in content
    assert "prepare_video_production" not in content
    assert "update_video_production_plan" not in content
    assert "workflow_id" not in content
    assert "expected_revision" not in content


def test_video_production_skill_uses_dedicated_media_tools():
    """视频制作 Skill 只能调用封装后的媒体工具，不直接维护 Canvas 关系。"""
    content = (SKILLS_DIR / "video-production" / "SKILL.md").read_text(encoding="utf-8")

    assert 'tool.call("generate_video_production_images"' in content
    assert 'tool.call("generate_video_production_videos"' in content
    assert 'tool.call("generate_canvas_images"' not in content
    assert 'tool.call("generate_canvas_videos"' not in content
    assert "source_element_id" not in content
    assert "target_element_id" not in content


def test_video_production_agent_mode_routes_to_new_agent():
    """新内置模式必须路由到 video-production.agent。"""
    assert AgentMode.VIDEO_PRODUCTION.value == "video-production"
    assert AgentMode.VIDEO_PRODUCTION.get_agent_type() == "video-production"
    assert AgentMode.resolve_agent_type("video-production") == "video-production"
