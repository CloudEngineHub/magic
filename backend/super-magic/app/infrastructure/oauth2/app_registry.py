"""动态 OAuth2 app 定义的文件注册表。"""

from __future__ import annotations

from app.infrastructure.oauth2.app_definition import OAuth2AppDefinition
from app.infrastructure.oauth2.exceptions import OAuth2AppNotFoundError
from app.infrastructure.oauth2.security import validate_app_name
from app.infrastructure.oauth2.storage_paths import OAuth2StoragePaths
from app.infrastructure.oauth2.time_utils import format_timezone
from app.utils.async_file_utils import async_exists, async_mkdir, async_read_json, async_rmtree, async_scandir, async_write_json


class OAuth2AppRegistry:
    """通过本地 JSON 文件持久化并加载 OAuth2 app 注册信息。"""

    def __init__(self, paths: OAuth2StoragePaths | None = None) -> None:
        """使用可选路径解析器初始化 app 注册表。"""
        self._paths = paths or OAuth2StoragePaths()

    async def save(self, app: OAuth2AppDefinition, timezone_name: str = "UTC") -> OAuth2AppDefinition:
        """创建或更新 app 定义。"""
        now = format_timezone(timezone_name=timezone_name)
        existing = await self.get_optional(app.app_name)
        app.created_at = existing.created_at if existing else (app.created_at or now)
        app.updated_at = now
        app_dir = self._paths.app_dir(app.app_name)
        app_file = self._paths.app_file(app.app_name)
        await async_mkdir(app_dir, parents=True, exist_ok=True)
        await async_write_json(app_file, app.to_dict(), ensure_ascii=False, indent=2)
        return app

    async def get(self, app_name: str) -> OAuth2AppDefinition:
        """加载 app 定义；不存在时抛出异常。"""
        app = await self.get_optional(app_name)
        if app is None:
            raise OAuth2AppNotFoundError(f"OAuth2 app '{app_name}' is not registered.")
        return app

    async def get_optional(self, app_name: str) -> OAuth2AppDefinition | None:
        """在 app 定义存在时加载它。"""
        app = validate_app_name(app_name)
        app_file = self._paths.app_file(app)
        if not await async_exists(app_file):
            return None
        return OAuth2AppDefinition.from_dict(await async_read_json(app_file))

    async def list_apps(self) -> list[OAuth2AppDefinition]:
        """列出已配置 OAuth2 根目录下的所有 app 定义。"""
        root = self._paths.list_root()
        if not await async_exists(root):
            return []

        apps: list[OAuth2AppDefinition] = []
        for entry in sorted(await async_scandir(root), key=lambda item: item.name):
            app_file = self._paths.app_file(entry.name)
            if not await async_exists(app_file):
                continue
            try:
                apps.append(OAuth2AppDefinition.from_dict(await async_read_json(app_file)))
            except Exception:
                continue
        return apps

    async def remove(self, app_name: str) -> bool:
        """删除单个 app 目录，包括 sessions 和 credentials。"""
        app = validate_app_name(app_name)
        app_dir = self._paths.app_dir(app)
        if not await async_exists(app_dir):
            return False
        await async_rmtree(app_dir)
        return True
