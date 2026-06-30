"""
服务模块初始化文件
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.service.agent_event.file_storage_listener_service import FileStorageListenerService
    from app.service.agent_service import AgentService
    from app.service.attachment_service import AttachmentService
    from app.service.file_service import FileService


__all__ = [
    'AgentService',
    'AttachmentService',
    'FileStorageListenerService',
    'FileService',
]


def __getattr__(name: str) -> object:
    if name == "AgentService":
        from app.service.agent_service import AgentService

        return AgentService
    if name == "AttachmentService":
        from app.service.attachment_service import AttachmentService

        return AttachmentService
    if name == "FileStorageListenerService":
        from app.service.agent_event.file_storage_listener_service import FileStorageListenerService

        return FileStorageListenerService
    if name == "FileService":
        from app.service.file_service import FileService

        return FileService
    raise AttributeError(f"module 'app.service' has no attribute {name!r}")
