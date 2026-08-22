"""旧 Design Canvas 领域服务兼容层。

本模块计划在下一版本随 ``app.tools.design`` 一并删除。
"""

from app.tools.design.domain.services.connection_service import ConnectionService
from app.tools.design.domain.services.content_service import ContentService
from app.tools.design.domain.services.element_layout_service import ElementLayoutService

__all__ = ["ConnectionService", "ContentService", "ElementLayoutService"]
