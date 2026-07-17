"""临时文件清理结果。"""

from dataclasses import dataclass


@dataclass(slots=True)
class TemporaryFileCleanupResult:
    """记录一次临时文件清理的统计结果。"""

    scanned_files: int = 0
    deleted_files: int = 0
    deleted_directories: int = 0
    failed_files: int = 0
