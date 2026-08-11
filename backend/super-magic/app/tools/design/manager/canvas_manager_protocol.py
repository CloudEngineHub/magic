"""Canvas Manager 的跨版本业务接口。"""

from __future__ import annotations

from abc import abstractmethod
from typing import Any, Awaitable, Callable, Dict, Optional, Protocol, Sequence, TypeVar, overload

TransactionResultT = TypeVar("TransactionResultT")


class CanvasManagerProtocol(Protocol):
    """为 V1、V2、V3 提供一致的画布读写入口。"""

    project_path: str
    supports_connections: bool

    @abstractmethod
    def supports_content_versions(self) -> bool:
        """返回当前 Canvas 格式是否支持多 Content 版本。"""

    @abstractmethod
    async def initialize_project(self, name: str, project_type: str = "design") -> None:
        """按当前 Manager 的原生格式初始化空项目。"""

    @abstractmethod
    async def read_current_canvas(self, *, use_lock: bool = True) -> Any:
        """读取当前画布快照。"""

    @overload
    async def run_write_transaction(
        self,
        mutator: Callable[[Any], Awaitable[TransactionResultT]],
        verify_content: Optional[Callable[[Any, TransactionResultT], bool]] = None,
        before_write: Optional[Callable[[], Any | Awaitable[Any]]] = None,
        after_write: Optional[Callable[[TransactionResultT], Any | Awaitable[Any]]] = None,
    ) -> TransactionResultT:
        """执行使用异步修改器的统一读、改、写事务。"""
        ...

    @overload
    async def run_write_transaction(
        self,
        mutator: Callable[[Any], TransactionResultT],
        verify_content: Optional[Callable[[Any, TransactionResultT], bool]] = None,
        before_write: Optional[Callable[[], Any | Awaitable[Any]]] = None,
        after_write: Optional[Callable[[TransactionResultT], Any | Awaitable[Any]]] = None,
    ) -> TransactionResultT:
        """执行使用同步修改器的统一读、改、写事务。"""
        ...

    @abstractmethod
    async def run_write_transaction(
        self,
        mutator: Callable[[Any], TransactionResultT | Awaitable[TransactionResultT]],
        verify_content: Optional[Callable[[Any, TransactionResultT], bool]] = None,
        before_write: Optional[Callable[[], Any | Awaitable[Any]]] = None,
        after_write: Optional[Callable[[TransactionResultT], Any | Awaitable[Any]]] = None,
    ) -> TransactionResultT:
        """执行统一的读、改、写事务，并兼容同步和异步修改器。"""

    @abstractmethod
    async def get_element_by_id(self, element_id: str, config: Optional[Any] = None) -> Any:
        """从指定或最新快照读取 Element。"""

    @abstractmethod
    async def resolve_content_target(
        self,
        content_id: str,
        config: Optional[Any] = None,
    ) -> Optional[tuple[str, Optional[str]]]:
        """把外部 Content ID 解析为内部 Element ID 和版本 Content ID。"""

    @abstractmethod
    async def update_element(
        self,
        element_id: str,
        updates: Dict[str, Any],
        config: Any,
        content_id: Optional[str] = None,
    ) -> bool:
        """更新 Element；不支持 Content 版本的 Manager 忽略 content_id。"""

    @abstractmethod
    async def add_element(self, element: Any, config: Any) -> Any:
        """新增 Element。"""

    @abstractmethod
    async def delete_element(self, element_id: str, config: Any) -> bool:
        """删除 Element。"""

    @abstractmethod
    def generate_element_id(self) -> str:
        """生成新的 Element ID。"""

    @abstractmethod
    def generate_initial_content_id(self, element_id: str) -> str:
        """生成指定 Element 的首个 Content ID。"""

    @abstractmethod
    def generate_content_id(
        self,
        element_id: str,
        existing_content_ids: Sequence[str],
    ) -> str:
        """生成指定 Element 下一个可用的 Content ID。"""

    @abstractmethod
    def generate_connection_id(self) -> str:
        """生成新的 Connection ID。"""
