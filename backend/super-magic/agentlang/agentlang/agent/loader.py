from pathlib import Path
from typing import Any, Dict, Optional

from .define import AgentDefine, SkillsConfig, parse_agent_file
from .syntax import SyntaxProcessor


class AgentLoader:
    def __init__(self, agents_dir: Path):
        self._agents: Dict[str, AgentDefine] = {}
        self._agents_dir = agents_dir
        self._syntax_processor = SyntaxProcessor(agents_dir)

    def load_agent(
        self,
        agent_name: str,
        variables: Dict[str, Any] = None,
    ) -> AgentDefine:
        """加载并缓存 agent 文件，返回完整的 AgentDefine（含处理后的 prompt）。"""
        if variables is None:
            variables = {}

        if agent_name in self._agents:
            return self._agents[agent_name]

        content = self._read_agent_file(agent_name)
        metadata, prompt_raw = parse_agent_file(content)

        if variables:
            self._syntax_processor.set_variables(variables)
        metadata.prompt = self._syntax_processor.process_dynamic_syntax(prompt_raw)

        self._agents[agent_name] = metadata
        return metadata

    def get_skills_config(self, agent_name: str) -> Optional[SkillsConfig]:
        """返回 agent 的 SkillsConfig；未配置 skills 时返回 None。"""
        metadata = self._agents.get(agent_name)
        return metadata.skills_config if metadata else None

    def set_variables(self, content: str, variables: Dict[str, Any]) -> str:
        self._syntax_processor.set_variables(variables)
        return self._syntax_processor.process_dynamic_syntax(content)

    def _read_agent_file(self, agent_name: str) -> str:
        agent_file = self._agents_dir / f"{agent_name}.agent"
        if not agent_file.exists():
            raise FileNotFoundError(f"Agent 文件不存在: {agent_file}")
        with open(agent_file, "r", encoding="utf-8") as f:
            return f.read()
