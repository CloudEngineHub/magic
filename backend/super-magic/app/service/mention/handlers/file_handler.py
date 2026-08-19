"""File mention handler"""
import os
import re
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from urllib.parse import quote

from app.path_manager import PathManager
from app.service.mention.base import BaseMentionHandler, logger

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext
from app.service.mention.utils.canvas_project_detector import find_parent_canvas_project

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".avif"}
_VIDEO_EXTS = {".mp4", ".mov", ".avi", ".webm", ".mkv", ".flv", ".wmv"}

_TEMPORARY_FILE_NOTIFICATION = (
    "These files are stored in `.tmp` and will be removed automatically by the expiration policy. "
    "If any file or derived result must persist, move or copy it to a workspace path outside `.tmp` before "
    "completing the task."
)

_PROJECT_TYPE_LABELS = {
    "design": "canvas",
    "slide": "slide",
}

_PROJECT_TYPE_TIPS = {
    "design": (
        "The referenced file belongs to a Canvas design project. "
        "Use canvas project skill or tools for AI image generation, image search, or design marker processing."
    ),
    "slide": (
        "The referenced file belongs to a Slide project. "
        "Use slide/PPT skill or tools to create, edit, or manage the presentation."
    ),
}


def _file_category(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    if ext in _IMAGE_EXTS:
        return "image"
    if ext in _VIDEO_EXTS:
        return "video"
    return "file"


def _is_temporary_workspace_path(file_path: str) -> bool:
    """判断文件路径是否位于 PathManager 定义的工作区临时目录下。"""
    path = Path(file_path)
    if not path.is_absolute():
        path = PathManager.get_workspace_dir() / path

    normalized_path = Path(os.path.normpath(str(path)))
    temporary_directory = Path(os.path.normpath(str(PathManager.get_tmp_dir())))
    try:
        normalized_path.relative_to(temporary_directory)
        return True
    except ValueError:
        return False


def _workspace_relative_path(file_path: str) -> Optional[str]:
    """将安全的工作区路径转换为 canonical 相对路径。"""
    raw_path = file_path.strip()
    if not raw_path:
        return None

    normalized_input = raw_path.replace("\\", "/")
    if re.match(r"^[A-Za-z][A-Za-z\d+.-]*:", normalized_input):
        return None
    if ".." in Path(normalized_input).parts:
        return None

    normalized_path = Path(os.path.normpath(normalized_input))
    if normalized_path.is_absolute():
        workspace_path = Path(os.path.normpath(str(PathManager.get_workspace_dir())))
        try:
            normalized_path = normalized_path.relative_to(workspace_path)
        except ValueError:
            return None

    relative_path = normalized_path.as_posix()
    if relative_path.startswith("./"):
        relative_path = relative_path[2:]
    if not relative_path or relative_path == "." or relative_path.startswith("../"):
        return None
    return relative_path


def _markdown_label(value: str) -> str:
    return " ".join(value.split()).replace("\\", "\\\\").replace("[", "\\[").replace("]", "\\]")


def _canonical_file_link(file_path: str, file_name: str) -> Optional[str]:
    relative_path = _workspace_relative_path(file_path)
    if not relative_path:
        return None

    encoded_path = "/".join(quote(segment, safe="-._~") for segment in relative_path.split("/"))
    label = _markdown_label(file_name or Path(relative_path).name)
    return f"[{label}](./{encoded_path})"


class FileHandler(BaseMentionHandler):
    """处理文件类型的mention（file、project_file、upload_file）"""

    def __init__(self) -> None:
        """初始化当前构建周期内的临时文件路径集合。"""
        self._temporary_file_paths: List[str] = []

    def get_type(self) -> str:
        return "file"

    async def get_tip(self, mention: Dict[str, Any], agent_context: Optional["AgentContext"] = None) -> str:
        file_path = mention.get("file_path", "") or ""
        _, project_type = await find_parent_canvas_project(file_path)
        if project_type and project_type in _PROJECT_TYPE_TIPS:
            return _PROJECT_TYPE_TIPS[project_type]
        return "Read and understand the referenced file or directory before proceeding"

    async def get_final_tip(self, agent_context: Optional["AgentContext"] = None) -> str:
        """在全部文件 mention 处理完成后统一生成临时文件提示。"""
        if not self._temporary_file_paths:
            return ""

        notification = self._build_temporary_file_notification()
        self._temporary_file_paths.clear()
        if agent_context is not None:
            try:
                agent_context.horizon.push_notification(
                    "temporary_file_mention",
                    notification,
                )
                return ""
            except Exception as error:
                logger.warning(f"推送临时文件 Horizon 通知失败: {error}")
        return f"{notification}\n\nRead and understand the referenced files before proceeding."

    def _build_temporary_file_notification(self) -> str:
        """构建包含临时文件列表的统一英文提示。"""
        file_list = "\n".join(f"- `{file_path}`" for file_path in self._temporary_file_paths)
        return (
            "The user directly submitted the following files through the chat input:\n"
            f"{file_list}\n\n{_TEMPORARY_FILE_NOTIFICATION}"
        )

    async def handle(self, mention: Dict[str, Any], index: int, agent_context: Optional["AgentContext"] = None) -> List[str]:
        file_path = mention.get("file_path", "") or ""
        file_name = str(mention.get("file_name") or "").strip()
        file_url = mention.get("file_url", "")

        if _is_temporary_workspace_path(file_path) and file_path not in self._temporary_file_paths:
            self._temporary_file_paths.append(file_path)

        canonical_link = _canonical_file_link(file_path, file_name)
        if canonical_link:
            context_lines = [f"{index}. {canonical_link}"]
        else:
            readable_reference = file_path or file_url or "missing file path"
            context_lines = [
                f"{index}. File reference (not a valid workspace-relative link): {readable_reference}"
            ]

        project_path, project_type = await find_parent_canvas_project(file_path)
        if project_path and project_type:
            project_label = _PROJECT_TYPE_LABELS.get(project_type, project_type)
            category = _file_category(file_path)
            context_lines.append(f"   - Project ({project_label}): {project_path}")
            context_lines.append(f"   - File type: {project_label} {category}")

        if file_url:
            context_lines.append(f"   - URL: {file_url}")

        logger.info(
            f"用户prompt添加文件引用: {file_path}"
            + (f" (所属项目: {project_path})" if project_path else "")
        )

        return context_lines
