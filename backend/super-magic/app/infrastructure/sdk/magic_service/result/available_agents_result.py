"""
Available Agents Result

Result class for the available-agents API response. The endpoint returns a
flat `{total, list:[{code, name, description}]}` payload, with name and
description already localized by the request `language` header.
"""

from typing import Any, Dict, List

from app.infrastructure.sdk.base import AbstractResult


class AvailableAgentItem:
    """A single available agent: code plus localized name and description."""

    def __init__(self, data: Dict[str, Any]):
        self.code: str = str(data.get("code", "") or "")
        self.name: str = str(data.get("name", "") or "")
        self.description: str = str(data.get("description", "") or "")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "code": self.code,
            "name": self.name,
            "description": self.description,
        }


class AvailableAgentsResult(AbstractResult):
    """Result for the available-agents API."""

    def __init__(self, data: Dict[str, Any]):
        self._agents: List[AvailableAgentItem] = []
        self._total: int = 0
        super().__init__(data)

    def _parse_data(self) -> None:
        data = self._raw_data or {}
        self._total = int(data.get("total", 0) or 0)
        for item in data.get("list") or []:
            if isinstance(item, dict):
                self._agents.append(AvailableAgentItem(item))

    def get_agents(self) -> List[AvailableAgentItem]:
        return self._agents

    def get_total(self) -> int:
        return self._total
