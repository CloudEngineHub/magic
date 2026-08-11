"""Canvas V3 实时读写事务管理器。"""

import inspect
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Optional, TypeVar
from uuid import uuid4

from app.tools.design.codec.v3_codec import (
    COMMON_CONTENT_FIELDS,
    CONTENT_FIELDS_BY_TYPE,
    MAGIC_PROJECT_VERSION_V3,
    V3CanvasCodec,
)
from app.tools.design.domain.canvas_document import (
    CanvasDocumentV3,
    CanvasElementV3,
    MagicProjectConfigV3,
)
from app.tools.design.domain.content import ElementContent
from app.tools.design.domain.services.connection_service import ConnectionService
from app.tools.design.domain.services.element_layout_service import ElementLayoutService
from app.tools.design.manager.canvas_lock_manager import canvas_lock_manager
from app.tools.design.manager.canvas_manager_protocol import CanvasManagerProtocol
from app.tools.design.sidecar.content_details_store import ContentDetailsStore
from app.tools.design.utils.magic_project_design_parser import get_project_file_path
from app.utils.async_file_utils import async_read_text, async_write_text_with_retry

TransactionResultT = TypeVar("TransactionResultT")


class CanvasManagerV3(CanvasManagerProtocol):
    """V3 画布实时读写入口，具体实现 CanvasManagerProtocol。"""

    supports_connections = True

    def supports_content_versions(self) -> bool:
        """V3 原生支持 Element 下的多 Content 版本。"""
        return True

    def __init__(self, project_path: str):
        """初始化指定项目的 V3 manager。"""
        self.project_path = project_path
        self._sidecar_store = ContentDetailsStore(project_path)

    async def initialize_project(self, name: str, project_type: str = "design") -> None:
        """按当前默认结构创建空项目。"""
        config = MagicProjectConfigV3(
            version=MAGIC_PROJECT_VERSION_V3,
            type=project_type,
            name=name,
            canvas=CanvasDocumentV3(elements=[]),
        )
        await write_magic_project_js_v3(self.project_path, config)

    async def _read_current_canvas_once(self) -> MagicProjectConfigV3:
        """执行一次真实文件读取并合并 Content sidecar。"""
        content = await async_read_text(get_project_file_path(self.project_path))
        config = V3CanvasCodec.decode(content)
        await self._sidecar_store.hydrate(config)
        return config

    async def read_current_canvas(self, *, use_lock: bool = True) -> MagicProjectConfigV3:
        """实时读取当前 V3 文件，默认参与项目级读写串行。"""
        if not use_lock:
            return await self._read_current_canvas_once()
        async with canvas_lock_manager.lock_canvas(Path(self.project_path)):
            return await self._read_current_canvas_once()

    async def run_write_transaction(
        self,
        mutator: Callable[
            [MagicProjectConfigV3],
            TransactionResultT | Awaitable[TransactionResultT],
        ],
        verify_content: Optional[
            Callable[[MagicProjectConfigV3, TransactionResultT], bool]
        ] = None,
        before_write: Optional[Callable[[], Any | Awaitable[Any]]] = None,
        after_write: Optional[Callable[[TransactionResultT], Any | Awaitable[Any]]] = None,
    ) -> TransactionResultT:
        """在同一项目锁内完成 V3 的实时读、内存改、sidecar 写和主文件写。"""
        async with canvas_lock_manager.lock_canvas(Path(self.project_path)):
            current_config = await self.read_current_canvas(use_lock=False)
            existing_element_ids = {
                element.id for element in current_config.canvas.iter_elements()
            }
            if before_write is not None:
                before_result = before_write()
                if inspect.isawaitable(before_result):
                    await before_result

            result = mutator(current_config)
            if inspect.isawaitable(result):
                result = await result

            ElementLayoutService.layout_new_elements(
                current_config.canvas,
                existing_element_ids,
            )
            V3CanvasCodec.validate_document(current_config.canvas)
            await self._persist(current_config, result, verify_content)

            if after_write is not None:
                after_result = after_write(result)
                if inspect.isawaitable(after_result):
                    await after_result
            return result

    async def _persist(
        self,
        config: MagicProjectConfigV3,
        result: TransactionResultT,
        verifier: Optional[Callable[[MagicProjectConfigV3, TransactionResultT], bool]],
    ) -> None:
        """先写 Content sidecar，再写压缩主文件并执行写后重读校验。"""
        config.version = MAGIC_PROJECT_VERSION_V3
        await self._sidecar_store.persist_from_config(config)
        main_file_config = config.clone()
        self._sidecar_store.strip_heavy_fields(main_file_config)
        encoded = V3CanvasCodec.encode(main_file_config)

        def validate_written_content(content: str) -> bool:
            """验证写后主文件仍是合法 V3，并执行调用方语义校验。"""
            written_config = V3CanvasCodec.decode(content)
            return verifier is None or verifier(written_config, result)

        await async_write_text_with_retry(
            get_project_file_path(self.project_path),
            encoded,
            content_validator=validate_written_content,
        )

    async def read_element_details(self) -> Dict[str, Any]:
        """读取 V3 可消费的 Content 级 sidecar。"""
        agent_doc = await self._sidecar_store.read_agent_document()
        user_doc = await self._sidecar_store.read_user_document()
        return self._sidecar_store.merge_readable_documents(agent_doc, user_doc)

    async def get_element_by_id(
        self,
        element_id: str,
        config: Optional[MagicProjectConfigV3] = None,
    ) -> Optional[CanvasElementV3]:
        """从当前或指定快照查询一个 V3 Element。"""
        current_config = config or await self.read_current_canvas()
        return current_config.canvas.get_element(element_id)

    async def resolve_content_target(
        self,
        content_id: str,
        config: Optional[MagicProjectConfigV3] = None,
    ) -> Optional[tuple[str, Optional[str]]]:
        """按 Content ID 定位所属 Element，并保留版本 ID。"""
        current_config = config or await self.read_current_canvas()
        for element in current_config.canvas.iter_elements():
            if element.get_content(content_id) is not None:
                return element.id, content_id
        return None

    async def read_current_element_by_id(self, element_id: str) -> Optional[CanvasElementV3]:
        """从最新文件读取一个 V3 Element。"""
        return await self.get_element_by_id(element_id)

    async def add_element(
        self,
        element: Any,
        config: MagicProjectConfigV3,
    ) -> bool:
        """向顶层 Canvas 新增业务 Element。"""
        normalized = self._coerce_element(element)
        if config.canvas.get_element(normalized.id) is not None:
            raise ValueError(f"Element already exists: {normalized.id}")
        ElementLayoutService.layout_element(config.canvas, normalized)
        config.canvas.elements.append(normalized)
        return True

    async def update_element(
        self,
        element_id: str,
        updates: Dict[str, Any],
        config: MagicProjectConfigV3,
        content_id: Optional[str] = None,
    ) -> bool:
        """更新 Element 外壳或指定 Content；未指定时更新 active Content。"""
        element = config.canvas.get_element(element_id)
        if element is None:
            return False
        content_fields = COMMON_CONTENT_FIELDS | CONTENT_FIELDS_BY_TYPE[element.type]
        for field_name, value in updates.items():
            if field_name in content_fields:
                target_content = element.get_content(content_id) if content_id else element.get_active_content()
                if target_content is None:
                    target_label = content_id or element.active_content_id
                    raise ValueError(f"Element {element_id} Content does not exist: {target_label}")
                target_content.fields[field_name] = value
            elif field_name == "activeContentId":
                if element.get_content(value) is None:
                    raise ValueError(f"Content does not exist: {value}")
                element.active_content_id = value
            elif field_name == "mainContentId":
                if element.get_content(value) is None:
                    raise ValueError(f"Content does not exist: {value}")
                element.main_content_id = value
            elif field_name in element.properties or field_name in {
                "name",
                "visible",
                "locked",
                "opacity",
                "x",
                "y",
                "width",
                "height",
                "scaleX",
                "scaleY",
                "zIndex",
                "interactionConfig",
            }:
                element.properties[field_name] = value
            else:
                raise ValueError(f"Unsupported V3 Element update field: {field_name}")
        return True

    async def delete_element(
        self,
        element_id: str,
        config: MagicProjectConfigV3,
    ) -> bool:
        """删除顶层业务 Element，并清理其全部 Connection。"""
        element = next((item for item in config.canvas.elements if item.id == element_id), None)
        if element is None:
            return False
        config.canvas.elements.remove(element)
        ConnectionService.remove_for_element(config.canvas, element_id)
        return True

    @staticmethod
    def generate_element_id(prefix: str = "element") -> str:
        """生成稳定且不依赖布局的 Element ID。"""
        return f"{prefix}-{uuid4()}"

    @staticmethod
    def _coerce_element(element: Any) -> CanvasElementV3:
        """把旧工具创建的媒体 dataclass 转换为标准 V3 Content Element。"""
        if isinstance(element, CanvasElementV3):
            return element
        element_id = getattr(element, "id", None)
        element_type = getattr(element, "type", None)
        if not isinstance(element_id, str) or not element_id:
            raise ValueError("V3 Element id must be a non-empty string")
        if element_type not in CONTENT_FIELDS_BY_TYPE:
            raise ValueError(f"Unsupported V3 Element type: {element_type}")

        properties: Dict[str, Any] = {}
        for field_name in (
            "name",
            "visible",
            "locked",
            "opacity",
            "x",
            "y",
            "width",
            "height",
            "scaleX",
            "scaleY",
            "zIndex",
            "interactionConfig",
        ):
            value = getattr(element, field_name, None)
            if value is not None:
                properties[field_name] = value

        content_fields: Dict[str, Any] = {}
        for field_name in COMMON_CONTENT_FIELDS | CONTENT_FIELDS_BY_TYPE[element_type]:
            value = getattr(element, field_name, None)
            if value is not None:
                content_fields[field_name] = value
        content_id = f"{element_id}-content-1"
        return CanvasElementV3(
            id=element_id,
            type=element_type,
            properties=properties,
            contents=[ElementContent(content_id=content_id, fields=content_fields)],
            active_content_id=content_id,
            main_content_id=content_id,
        )


async def write_magic_project_js_v3(
    project_path: str,
    config: MagicProjectConfigV3,
) -> None:
    """写入一个不包含 sidecar 重字段的新 V3 项目。"""
    encoded = V3CanvasCodec.encode(config)
    await async_write_text_with_retry(
        get_project_file_path(project_path),
        encoded,
        content_validator=lambda content: V3CanvasCodec.decode(content).version
        == MAGIC_PROJECT_VERSION_V3,
    )
