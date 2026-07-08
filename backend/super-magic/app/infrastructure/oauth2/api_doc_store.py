"""OAuth2 业务接口文档的 OpenAPI 文件存储。"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from app.infrastructure.oauth2.storage_paths import OAuth2StoragePaths
from app.infrastructure.oauth2.time_utils import format_timezone
from app.utils.async_file_utils import async_exists, async_read_json, async_write_json

_HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}
_SENSITIVE_HEADER_NAMES = {"authorization", "proxy-authorization", "access-token", "x-access-token"}


@dataclass
class OAuth2ApiDocOperation:
    """OpenAPI 中单个接口 operation 的检索结果。"""

    app_name: str
    method: str
    path: str
    operation_id: str
    summary: str
    description: str
    tags: list[str]
    verified: bool
    updated_at: str
    operation: dict[str, Any]

    def to_public_dict(self, include_operation: bool = False) -> dict[str, Any]:
        """转换为工具可返回给模型和用户的脱敏结构。"""
        payload: dict[str, Any] = {
            "app_name": self.app_name,
            "method": self.method.upper(),
            "path": self.path,
            "operation_id": self.operation_id,
            "summary": self.summary,
            "description": self.description,
            "tags": self.tags,
            "verified": self.verified,
            "updated_at": self.updated_at,
        }
        if include_operation:
            payload["operation"] = self.operation
        return payload


class OAuth2ApiDocStore:
    """以 OpenAPI 3.1 JSON 文件管理 OAuth2 app 的业务接口文档。"""

    def __init__(self, paths: OAuth2StoragePaths | None = None) -> None:
        """使用可选 OAuth2 路径解析器初始化接口文档存储。"""
        self._paths = paths or OAuth2StoragePaths()

    async def list_operations(
        self,
        app_name: str,
        query: str | None = None,
        method: str | None = None,
        path: str | None = None,
        limit: int = 50,
    ) -> list[OAuth2ApiDocOperation]:
        """按关键词、方法和路径过滤接口文档列表。"""
        spec = await self.load_openapi(app_name)
        query_text = (query or "").strip().lower()
        method_text = (method or "").strip().lower()
        path_text = (path or "").strip().lower()
        operations = self._iter_operations(app_name, spec)

        matched: list[OAuth2ApiDocOperation] = []
        for operation in operations:
            if method_text and operation.method.lower() != method_text:
                continue
            if path_text and path_text not in operation.path.lower():
                continue
            if query_text and not self._operation_matches_query(operation, query_text):
                continue
            matched.append(operation)
            if len(matched) >= limit:
                break
        return matched

    async def get_operation(self, app_name: str, operation_id: str) -> OAuth2ApiDocOperation | None:
        """根据 operationId 获取单个接口文档。"""
        target = operation_id.strip()
        if not target:
            return None
        spec = await self.load_openapi(app_name)
        for operation in self._iter_operations(app_name, spec):
            if operation.operation_id == target:
                return operation
        return None

    async def upsert_operation(self, app_name: str, payload: dict[str, Any], timezone_name: str = "UTC") -> OAuth2ApiDocOperation:
        """新增或更新一个 OpenAPI operation 文档。"""
        spec = await self.load_openapi(app_name)
        now_text = format_timezone(timezone_name=timezone_name)
        method = self._normalize_method(payload.get("method"))
        path = self._normalize_path(payload.get("path"), payload.get("url"))
        operation_id = (payload.get("operation_id") or self._build_operation_id(method, path)).strip()
        operation = self._build_operation(payload, operation_id, now_text)

        paths = spec.setdefault("paths", {})
        path_item = paths.setdefault(path, {})
        path_item[method] = operation
        self._merge_server(spec, payload.get("url"))
        self._touch_spec(spec, app_name, now_text)
        await self.save_openapi(app_name, spec)

        return OAuth2ApiDocOperation(
            app_name=app_name,
            method=method,
            path=path,
            operation_id=operation_id,
            summary=str(operation.get("summary") or ""),
            description=str(operation.get("description") or ""),
            tags=list(operation.get("tags") or []),
            verified=bool(operation.get("x-magic-usage", {}).get("verified")),
            updated_at=str(operation.get("x-magic-usage", {}).get("updated_at") or now_text),
            operation=operation,
        )

    async def delete_operation(self, app_name: str, operation_id: str, timezone_name: str = "UTC") -> bool:
        """根据 operationId 删除接口文档，路径为空时同步清理路径节点。"""
        target = operation_id.strip()
        if not target:
            return False
        spec = await self.load_openapi(app_name)
        paths = spec.setdefault("paths", {})
        for path, path_item in list(paths.items()):
            if not isinstance(path_item, dict):
                continue
            for method, operation in list(path_item.items()):
                if method not in _HTTP_METHODS or not isinstance(operation, dict):
                    continue
                if operation.get("operationId") != target:
                    continue
                del path_item[method]
                if not path_item:
                    del paths[path]
                self._touch_spec(spec, app_name, format_timezone(timezone_name=timezone_name))
                await self.save_openapi(app_name, spec)
                return True
        return False

    async def load_openapi(self, app_name: str) -> dict[str, Any]:
        """加载 OpenAPI 文档，不存在时返回默认空文档。"""
        file_path = self._paths.openapi_file(app_name)
        if not await async_exists(file_path):
            return self._default_spec(app_name, format_timezone(timezone_name="UTC"))
        data = await async_read_json(file_path)
        if not isinstance(data, dict):
            return self._default_spec(app_name, format_timezone(timezone_name="UTC"))
        return data

    async def save_openapi(self, app_name: str, spec: dict[str, Any]) -> None:
        """保存 OpenAPI 文档到 app 的接口文档文件。"""
        await async_write_json(self._paths.openapi_file(app_name), spec, ensure_ascii=False, indent=2)

    @staticmethod
    def _default_spec(app_name: str, now_text: str) -> dict[str, Any]:
        """构造一个用于本地接口文档库的 OpenAPI 3.1 空文档。"""
        return {
            "openapi": "3.1.0",
            "info": {
                "title": f"{app_name} OAuth2 API Usage",
                "version": "local",
            },
            "servers": [],
            "components": {
                "securitySchemes": {
                    "oauth2AccessToken": {
                        "type": "http",
                        "scheme": "bearer",
                    }
                }
            },
            "security": [{"oauth2AccessToken": []}],
            "paths": {},
            "x-magic-usage": {
                "app_name": app_name,
                "created_at": now_text,
                "updated_at": now_text,
            },
        }

    @staticmethod
    def _iter_operations(app_name: str, spec: dict[str, Any]) -> list[OAuth2ApiDocOperation]:
        """遍历 OpenAPI paths 下的所有 HTTP operation。"""
        operations: list[OAuth2ApiDocOperation] = []
        for path, path_item in (spec.get("paths") or {}).items():
            if not isinstance(path_item, dict):
                continue
            for method, operation in path_item.items():
                if method not in _HTTP_METHODS or not isinstance(operation, dict):
                    continue
                usage = operation.get("x-magic-usage") or {}
                operations.append(
                    OAuth2ApiDocOperation(
                        app_name=app_name,
                        method=method,
                        path=path,
                        operation_id=str(operation.get("operationId") or ""),
                        summary=str(operation.get("summary") or ""),
                        description=str(operation.get("description") or ""),
                        tags=list(operation.get("tags") or []),
                        verified=bool(usage.get("verified")),
                        updated_at=str(usage.get("updated_at") or ""),
                        operation=operation,
                    )
                )
        operations.sort(key=lambda item: (item.path, item.method, item.operation_id))
        return operations

    @staticmethod
    def _operation_search_text(operation: OAuth2ApiDocOperation) -> str:
        """将接口文档中的可检索字段合并为小写文本。"""
        usage = operation.operation.get("x-magic-usage") or {}
        parts = [
            operation.operation_id,
            operation.method,
            operation.path,
            operation.summary,
            operation.description,
            " ".join(operation.tags),
            str(usage.get("url") or ""),
            str(usage.get("notes") or ""),
            " ".join(str(item) for item in usage.get("source_refs") or []),
            str(usage.get("example_tool_call") or ""),
        ]
        return " ".join(parts).lower()

    @staticmethod
    def _operation_matches_query(operation: OAuth2ApiDocOperation, query_text: str) -> bool:
        """使用关键词命中数判断接口文档是否匹配查询。"""
        search_text = OAuth2ApiDocStore._operation_search_text(operation)
        terms = [term for term in re.split(r"[\s,，;；]+", query_text) if term]
        if not terms:
            return True
        matched_count = sum(1 for term in terms if term in search_text)
        required_count = 1 if len(terms) <= 2 else 2
        return matched_count >= required_count

    @staticmethod
    def _normalize_method(method: Any) -> str:
        """校验并标准化 HTTP method。"""
        value = str(method or "").strip().lower()
        if value not in _HTTP_METHODS:
            raise ValueError("method must be one of GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE.")
        return value

    @staticmethod
    def _normalize_path(path: Any, url: Any) -> str:
        """从 path 或 URL 中解析 OpenAPI path。"""
        path_value = str(path or "").strip()
        if path_value:
            return path_value if path_value.startswith("/") else f"/{path_value}"
        parsed = urlparse(str(url or "").strip())
        if parsed.path:
            return parsed.path
        raise ValueError("path or url is required.")

    @staticmethod
    def _build_operation_id(method: str, path: str) -> str:
        """根据 method 和 path 生成稳定 operationId。"""
        path_part = re.sub(r"[^a-zA-Z0-9]+", "_", path.strip("/")).strip("_").lower() or "root"
        return f"{method}_{path_part}"

    @staticmethod
    def _build_operation(payload: dict[str, Any], operation_id: str, now_text: str) -> dict[str, Any]:
        """根据工具入参构造 OpenAPI operation。"""
        operation: dict[str, Any] = {
            "operationId": operation_id,
            "summary": str(payload.get("summary") or ""),
            "description": str(payload.get("description") or ""),
            "tags": list(payload.get("tags") or []),
            "parameters": OAuth2ApiDocStore._build_parameters(payload),
            "responses": OAuth2ApiDocStore._build_responses(payload),
            "x-magic-usage": {
                "verified": bool(payload.get("verified", True)),
                "url": str(payload.get("url") or ""),
                "source_refs": list(payload.get("source_refs") or []),
                "example_tool_call": payload.get("example_tool_call") or {},
                "notes": str(payload.get("notes") or ""),
                "updated_at": now_text,
            },
        }
        request_body_schema = payload.get("request_body_schema")
        if request_body_schema:
            operation["requestBody"] = {
                "required": False,
                "content": {
                    "application/json": {
                        "schema": request_body_schema,
                    }
                },
            }
        return operation

    @staticmethod
    def _build_parameters(payload: dict[str, Any]) -> list[dict[str, Any]]:
        """将 headers 和 query_schema 转换为 OpenAPI parameters。"""
        parameters: list[dict[str, Any]] = []
        for name, value in (payload.get("headers") or {}).items():
            if name.lower() in _SENSITIVE_HEADER_NAMES:
                continue
            parameters.append(OAuth2ApiDocStore._build_parameter("header", name, value))
        for name, value in (payload.get("query_schema") or {}).items():
            parameters.append(OAuth2ApiDocStore._build_parameter("query", name, value))
        return parameters

    @staticmethod
    def _build_parameter(location: str, name: str, value: Any) -> dict[str, Any]:
        """构造单个 OpenAPI parameter，兼容简单字符串和 schema 对象。"""
        if isinstance(value, dict):
            schema = value.get("schema")
            if schema is None:
                schema = {key: item for key, item in value.items() if key not in {"description", "required"}}
            if not schema:
                schema = {"type": "string"}
            description = str(value.get("description") or "")
            required = bool(value.get("required", False))
        else:
            schema = {"type": "string"}
            description = str(value or "")
            required = False
        return {
            "name": name,
            "in": location,
            "required": required,
            "description": description,
            "schema": schema,
        }

    @staticmethod
    def _build_responses(payload: dict[str, Any]) -> dict[str, Any]:
        """构造 OpenAPI responses 节点。"""
        status_code = str(payload.get("response_status_code") or "200")
        response_schema = payload.get("response_schema")
        response: dict[str, Any] = {"description": str(payload.get("response_description") or "Successful response")}
        if response_schema:
            response["content"] = {
                "application/json": {
                    "schema": response_schema,
                }
            }
        return {status_code: response}

    @staticmethod
    def _merge_server(spec: dict[str, Any], url: Any) -> None:
        """从 URL 中提取 server 并合并到 OpenAPI servers。"""
        parsed = urlparse(str(url or "").strip())
        if not parsed.scheme or not parsed.netloc:
            return
        server_url = f"{parsed.scheme}://{parsed.netloc}"
        servers = spec.setdefault("servers", [])
        if not any(isinstance(item, dict) and item.get("url") == server_url for item in servers):
            servers.append({"url": server_url})

    @staticmethod
    def _touch_spec(spec: dict[str, Any], app_name: str, now_text: str) -> None:
        """更新 OpenAPI 文档的本地维护时间。"""
        spec.setdefault("openapi", "3.1.0")
        spec.setdefault("info", {"title": f"{app_name} OAuth2 API Usage", "version": "local"})
        usage = spec.setdefault("x-magic-usage", {"app_name": app_name})
        usage.setdefault("created_at", now_text)
        usage["app_name"] = app_name
        usage["updated_at"] = now_text
