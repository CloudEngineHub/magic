"""服务包的懒加载导出。"""

__all__ = [
    "AgentService",
    "AttachmentService",
    "FileStorageListenerService",
    "FileService",
]


def __getattr__(name: str):
    """懒加载服务导出，避免子模块导入时拉起重量级依赖。"""
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
