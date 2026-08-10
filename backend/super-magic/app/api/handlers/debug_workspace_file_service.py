import shutil
from io import BytesIO
from pathlib import Path
from typing import BinaryIO, Dict, List, Optional, Tuple
from zipfile import ZIP_DEFLATED, ZipFile

from app.path_manager import PathManager


class DebugWorkspaceFileService:
    """为调试客户端提供受控的工作区与长期记忆文件管理。"""

    MAX_READ_BYTES = 5 * 1024 * 1024
    WORKSPACE_SCOPE = "workspace"
    MEMORY_SCOPE = "memory"

    def __init__(self, scope: str = WORKSPACE_SCOPE, workspace_root: Optional[Path] = None):
        """根据受控 scope 初始化文件根目录，不接受前端传入的绝对路径。"""
        self.scope = self.normalize_scope(scope)
        default_root = (
            PathManager.get_memory_root_dir()
            if self.scope == self.MEMORY_SCOPE
            else PathManager.get_workspace_dir()
        )
        self.workspace_root = (workspace_root or default_root).resolve()
        self.workspace_root.mkdir(parents=True, exist_ok=True)

    @classmethod
    def normalize_scope(cls, scope: str) -> str:
        """校验调试文件面板支持的根目录范围。"""
        normalized = str(scope or cls.WORKSPACE_SCOPE).strip().lower()
        if normalized not in {cls.WORKSPACE_SCOPE, cls.MEMORY_SCOPE}:
            raise ValueError(f"不支持的调试文件范围: {scope}")
        return normalized

    def resolve_path(self, relative_path: str = "") -> Path:
        clean_path = self._normalize_relative_path(relative_path)
        target = (self.workspace_root / clean_path).resolve() if clean_path else self.workspace_root
        try:
            target.relative_to(self.workspace_root)
        except ValueError as exc:
            raise ValueError(f"路径超出工作区范围: {relative_path}") from exc
        return target

    def list_tree(self, relative_path: str = "", depth: int = 2) -> Dict:
        target = self.resolve_path(relative_path)
        if not target.exists():
            raise FileNotFoundError(f"路径不存在: {relative_path}")
        if not target.is_dir():
            raise ValueError(f"路径不是目录: {relative_path}")
        normalized_depth = max(0, min(depth, 8))
        return {
            "root": str(self.workspace_root),
            "path": self.to_relative_path(target),
            "entries": self._list_entries(target, normalized_depth),
        }

    def read_file(self, relative_path: str) -> Dict:
        target = self.resolve_path(relative_path)
        if not target.exists():
            raise FileNotFoundError(f"文件不存在: {relative_path}")
        if not target.is_file():
            raise ValueError(f"路径不是文件: {relative_path}")
        size = target.stat().st_size
        if size > self.MAX_READ_BYTES:
            raise ValueError(f"文件超过读取限制 {self.MAX_READ_BYTES} bytes: {relative_path}")
        return {
            "path": self.to_relative_path(target),
            "content": target.read_text(encoding="utf-8"),
            "size": size,
            "updated_at": target.stat().st_mtime,
        }

    def write_file(
        self,
        relative_path: str,
        content: str,
        create_parent_dirs: bool = True,
        overwrite: bool = True,
    ) -> Dict:
        target = self.resolve_path(relative_path)
        if target.exists() and target.is_dir():
            raise ValueError(f"目标路径是目录: {relative_path}")
        if target.exists() and not overwrite:
            raise FileExistsError(f"文件已存在: {relative_path}")
        if create_parent_dirs:
            target.parent.mkdir(parents=True, exist_ok=True)
        elif not target.parent.exists():
            raise FileNotFoundError(f"父目录不存在: {self.to_relative_path(target.parent)}")
        target.write_text(content, encoding="utf-8")
        return self._entry_info(target)

    def create_directory(self, relative_path: str) -> Dict:
        target = self.resolve_path(relative_path)
        if target.exists() and not target.is_dir():
            raise ValueError(f"目标路径已存在且不是目录: {relative_path}")
        target.mkdir(parents=True, exist_ok=True)
        return self._entry_info(target)

    def delete_path(self, relative_path: str, recursive: bool = False) -> Dict:
        target = self.resolve_path(relative_path)
        if target == self.workspace_root:
            raise ValueError("不允许删除工作区根目录")
        if not target.exists():
            raise FileNotFoundError(f"路径不存在: {relative_path}")
        info = self._entry_info(target)
        if target.is_dir():
            if recursive:
                shutil.rmtree(target)
            else:
                target.rmdir()
        else:
            target.unlink()
        return {"deleted": info}

    def move_path(self, source_path: str, target_path: str, overwrite: bool = False) -> Dict:
        source = self.resolve_path(source_path)
        target = self.resolve_path(target_path)
        if source == self.workspace_root:
            raise ValueError("不允许移动工作区根目录")
        if not source.exists():
            raise FileNotFoundError(f"源路径不存在: {source_path}")
        if target.exists():
            if not overwrite:
                raise FileExistsError(f"目标路径已存在: {target_path}")
            if target.is_dir():
                shutil.rmtree(target)
            else:
                target.unlink()
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(target))
        return self._entry_info(target)

    def upload_file(
        self,
        target_dir: str,
        filename: str,
        file_obj: BinaryIO,
        overwrite: bool = True,
    ) -> Dict:
        safe_name = self._sanitize_filename(filename)
        target_directory = self.resolve_path(target_dir)
        if target_directory.exists() and not target_directory.is_dir():
            raise ValueError(f"上传目标不是目录: {target_dir}")
        target_directory.mkdir(parents=True, exist_ok=True)
        target = self.resolve_path(str(Path(self.to_relative_path(target_directory)) / safe_name))
        if target.exists() and not overwrite:
            raise FileExistsError(f"文件已存在: {self.to_relative_path(target)}")
        with target.open("wb") as output:
            shutil.copyfileobj(file_obj, output)
        return self._entry_info(target)

    def build_download_archive(self, relative_path: str) -> Tuple[BytesIO, str]:
        target = self.resolve_path(relative_path)
        if not target.exists():
            raise FileNotFoundError(f"路径不存在: {relative_path}")
        if not target.is_dir():
            raise ValueError(f"路径不是目录: {relative_path}")

        archive = BytesIO()
        root_name = target.name or "workspace"
        with ZipFile(archive, "w", compression=ZIP_DEFLATED) as zip_file:
            for item in target.rglob("*"):
                if item.is_dir():
                    continue
                archive_path = Path(root_name) / item.relative_to(target)
                zip_file.write(item, archive_path.as_posix())
        archive.seek(0)
        return archive, f"{root_name}.zip"

    def to_relative_path(self, path: Path) -> str:
        relative = path.resolve().relative_to(self.workspace_root)
        return "" if str(relative) == "." else relative.as_posix()

    def _list_entries(self, directory: Path, depth: int) -> List[Dict]:
        entries: List[Dict] = []
        for child in sorted(directory.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower())):
            info = self._entry_info(child)
            if child.is_dir() and depth > 0:
                info["children"] = self._list_entries(child, depth - 1)
            entries.append(info)
        return entries

    def _entry_info(self, path: Path) -> Dict:
        stat = path.stat()
        is_dir = path.is_dir()
        return {
            "name": path.name,
            "path": self.to_relative_path(path),
            "type": "directory" if is_dir else "file",
            "size": 0 if is_dir else stat.st_size,
            "updated_at": stat.st_mtime,
        }

    def _normalize_relative_path(self, relative_path: str = "") -> str:
        value = str(relative_path or "").strip().replace("\\", "/")
        if value.startswith("/"):
            value = value.lstrip("/")
        parts = []
        for part in value.split("/"):
            if not part or part == ".":
                continue
            if part == "..":
                raise ValueError(f"路径包含非法片段: {relative_path}")
            if any(ord(ch) < 32 for ch in part):
                raise ValueError(f"路径包含控制字符: {relative_path}")
            parts.append(part)
        return "/".join(parts)

    def _sanitize_filename(self, filename: str) -> str:
        name = Path(filename or "").name
        if not name or name in {".", ".."}:
            raise ValueError("文件名不能为空")
        if any(ord(ch) < 32 for ch in name):
            raise ValueError(f"文件名包含控制字符: {filename}")
        return name
