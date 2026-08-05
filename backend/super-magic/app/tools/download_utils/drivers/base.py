import asyncio
from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import TypeAlias


class DownloadPhase(StrEnum):
    """下载过程的稳定阶段。"""

    STARTING = "starting"
    DOWNLOADING = "downloading"
    RETRYING = "retrying"
    COMPLETED = "completed"


@dataclass(frozen=True)
class DownloadTimeouts:
    """下载引擎内部使用的分阶段超时。"""

    connect_seconds: float = 30.0
    read_idle_seconds: float = 120.0
    total_seconds: float | None = None


@dataclass(frozen=True)
class DownloadRequest:
    """下载驱动的内部强类型请求，不直接暴露给模型。"""

    url: str
    destination: Path
    headers: Mapping[str, str] = field(default_factory=dict)
    timeouts: DownloadTimeouts = field(default_factory=DownloadTimeouts)
    max_retries: int = 3
    resume: bool = True


@dataclass(frozen=True)
class DownloadProgress:
    """下载驱动上报给工具编排层的进度。"""

    phase: DownloadPhase
    downloaded_bytes: int
    total_bytes: int | None
    retry_count: int
    resumed: bool
    request_strategy: str

    @property
    def percentage(self) -> int | None:
        if self.total_bytes is None or self.total_bytes <= 0:
            return None
        return min(100, int(self.downloaded_bytes * 100 / self.total_bytes))


ProgressCallback: TypeAlias = Callable[[DownloadProgress], Awaitable[None]]


@dataclass(frozen=True)
class DownloadResultItem:
    """下载完成后的结构化结果。"""

    file_path: Path
    content_type: str
    file_size: int
    final_url: str
    filename: str = ""
    resumed: bool = False
    retry_count: int = 0
    request_strategy: str = "auto_same_origin"


class DownloadError(Exception):
    """携带恢复信息的下载错误。"""

    def __init__(
        self,
        message: str,
        *,
        retryable: bool,
        status_code: int | None = None,
        resume_available: bool = False,
        downloaded_bytes: int = 0,
        total_bytes: int | None = None,
        request_strategy: str = "auto_same_origin",
        retry_after_seconds: float | None = None,
    ) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.status_code = status_code
        self.resume_available = resume_available
        self.downloaded_bytes = downloaded_bytes
        self.total_bytes = total_bytes
        self.request_strategy = request_strategy
        self.retry_after_seconds = retry_after_seconds


class DownloadDriverInterface(ABC):
    """下载驱动接口。"""

    @abstractmethod
    def is_available(self) -> bool:
        """检查驱动是否可用。"""
        ...

    @abstractmethod
    async def download(
        self,
        request: DownloadRequest,
        *,
        progress_callback: ProgressCallback | None = None,
        interruption_event: asyncio.Event | None = None,
    ) -> DownloadResultItem:
        """下载文件并在需要时自动恢复内部 partial state。"""
        ...
