from typing import Any, Dict, Optional


def normalize_archive_name(file_key: str) -> str:
    normalized_key = file_key.replace("\\", "/").strip()
    if not normalized_key:
        raise ValueError("file_key 不能为空")
    if normalized_key.startswith("/"):
        raise ValueError(f"file_key 不能是绝对路径: {file_key}")

    parts = [part for part in normalized_key.split("/") if part not in {"", "."}]
    if not parts:
        raise ValueError(f"file_key 非法: {file_key}")
    if any(part == ".." for part in parts):
        raise ValueError(f"file_key 包含非法路径段 '..': {file_key}")

    return "/".join(parts)


def normalize_archive_base_path(archive_base_path: Any) -> str:
    if not isinstance(archive_base_path, str):
        raise ValueError("archive_base_path 必须是字符串")

    normalized = archive_base_path.replace("\\", "/").strip()
    if not normalized:
        return ""
    if normalized.startswith("/"):
        raise ValueError("archive_base_path 不能是绝对路径")

    parts = [part for part in normalized.split("/") if part not in {"", "."}]
    if any(part == ".." for part in parts):
        raise ValueError("archive_base_path 包含非法路径段 '..'")

    return "/".join(parts)


def resolve_archive_name(file_key: str, options: Optional[Dict[str, Any]] = None) -> str:
    path_mode = (options or {}).get("path_mode", "workspace_relative")
    if path_mode not in {"workspace_relative", "relative_lca"}:
        raise ValueError(f"不支持的打包路径模式: {path_mode}")

    archive_name = normalize_archive_name(file_key)
    if path_mode == "workspace_relative":
        return archive_name

    archive_base_path = normalize_archive_base_path((options or {}).get("archive_base_path", ""))
    if not archive_base_path:
        return archive_name

    prefix = f"{archive_base_path}/"
    if not archive_name.startswith(prefix):
        raise ValueError(
            f"archive_base_path 不是 file_key 的目录前缀: {archive_base_path}, {file_key}"
        )

    return normalize_archive_name(archive_name[len(prefix) :])
