"""Canvas 项目初始化用例服务。"""

from __future__ import annotations

from typing import Any

from app.tools.canvas.application.support import CanvasApplicationSupport


class InitializationService(CanvasApplicationSupport):
    """创建或复用 Canvas 项目，不处理 Element 业务。"""

    async def initialize(self, project_path: str) -> dict[str, Any]:
        """创建或复用一个 Canvas 项目。"""
        path, created = await self.repository.initialize(project_path)
        return {"project_path": project_path, "project_name": path.name, "created": created}
