"""ConnectionInput 输入模型。"""

from __future__ import annotations

from pydantic import ConfigDict, Field, model_validator

from app.tools.canvas.application.commands import ConnectionCommand
from app.tools.core import BaseToolParams


class ConnectionInput(BaseToolParams):
    """新增、删除或替换 Connection 参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    source_element_id: str | None = None
    target_element_id: str | None = None
    replace_existing_connections: bool = False
    remove_connection_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_operation(self) -> "ConnectionInput":
        """保证每个 item 只有一个明确的连线操作分支。"""
        has_endpoints = self.source_element_id is not None or self.target_element_id is not None
        if has_endpoints and (not self.source_element_id or not self.target_element_id):
            raise ValueError("source_element_id and target_element_id must be provided together")
        if self.replace_existing_connections and (not has_endpoints or not self.remove_connection_ids):
            raise ValueError("replacement requires endpoints and remove_connection_ids")
        if self.remove_connection_ids and has_endpoints and not self.replace_existing_connections:
            raise ValueError("set replace_existing_connections=true when replacing an existing Connection")
        if not has_endpoints and not self.remove_connection_ids:
            raise ValueError("connection item must add, remove, or replace a Connection")
        return self

    def to_command(self) -> ConnectionCommand:
        """转换为 Connection 应用命令。"""
        return ConnectionCommand(
            item_ref=self.item_ref,
            source_element_id=self.source_element_id,
            target_element_id=self.target_element_id,
            replace_existing_connections=self.replace_existing_connections,
            remove_connection_ids=tuple(self.remove_connection_ids),
        )
