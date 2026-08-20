"""Canvas 项目内媒体路径解析。"""

from __future__ import annotations

from pathlib import Path

from app.tools.canvas.repository.canvas_path_resolver import CanvasPathResolver


class ProjectAssetPathResolver:
    """统一工作区路径、项目路径和前端媒体 URI 之间的转换。"""

    def __init__(self, workspace: Path):
        """保存工作区根目录。"""
        self.workspace = workspace.resolve()

    def resolve_workspace_path(self, asset_path: str | Path) -> Path:
        """把工作区相对或绝对路径解析为安全的本地路径。"""
        raw = Path(str(asset_path))
        candidate = raw if raw.is_absolute() else self.workspace / raw
        resolved = candidate.resolve()
        self._ensure_inside(resolved, self.workspace, "Asset path must stay inside the Canvas workspace.")
        return resolved

    def to_project_uri(self, project_path: str, asset_path: str | Path) -> str:
        """把已落盘媒体转换为当前项目根目录下的前端 URI。"""
        project_root = CanvasPathResolver.resolve(self.workspace, project_path)
        raw = str(asset_path).replace("\\", "/")
        if raw.startswith("./"):
            candidate = (project_root / raw[2:]).resolve()
        else:
            candidate = self.resolve_workspace_path(asset_path)
        self._ensure_inside(candidate, project_root, "Generated media must stay inside the Canvas project.")
        relative = candidate.relative_to(project_root).as_posix()
        return f"./{relative}"

    def resolve_workspace_path_for_project(self, project_path: str, asset_path: str | Path) -> Path:
        """按 Canvas URI 规则解析项目内路径，兼容工作区相对结果。"""
        raw = str(asset_path).replace("\\", "/")
        project_root = CanvasPathResolver.resolve(self.workspace, project_path)
        if raw.startswith("./"):
            candidate = (project_root / raw[2:]).resolve()
        else:
            candidate = self.resolve_workspace_path(asset_path)
        self._ensure_inside(candidate, self.workspace, "Asset path must stay inside the Canvas workspace.")
        return candidate

    def normalize_existing_asset(self, project_path: str, asset_path: str) -> str:
        """校验已存在素材并优先返回项目内 URI，项目外保留工作区相对路径。"""
        candidate = self.resolve_workspace_path(asset_path)
        project_root = CanvasPathResolver.resolve(self.workspace, project_path)
        try:
            relative = candidate.relative_to(project_root).as_posix()
        except ValueError:
            return candidate.relative_to(self.workspace).as_posix()
        return f"./{relative}"

    @staticmethod
    def _ensure_inside(candidate: Path, root: Path, message: str) -> None:
        """拒绝越过指定根目录的路径。"""
        try:
            candidate.relative_to(root)
        except ValueError as error:
            raise ValueError(message) from error
