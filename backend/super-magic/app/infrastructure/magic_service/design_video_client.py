"""Client for design video generation APIs."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

import aiohttp
from agentlang.utils.metadata import MetadataUtil

from .config import MagicServiceConfig, MagicServiceConfigLoader


class DesignVideoServiceError(RuntimeError):
    """Raised when magic-service rejects a design video request."""

    def __init__(self, message: str, code: str = "") -> None:
        super().__init__(message)
        self.code = code


class DesignVideoClient:
    """Small wrapper around magic-service design video endpoints."""

    def __init__(
        self,
        config: Optional[MagicServiceConfig] = None,
        session: Optional[aiohttp.ClientSession] = None,
    ) -> None:
        self.config = config or MagicServiceConfigLoader.load_with_fallback()
        self.session = session

    async def ensure_project_directory(self, project_id: str, directory_path: str) -> str:
        """Ensure a project directory exists, creating each segment from root."""
        parent_id = ""
        for directory_name in self._split_directory_path(directory_path):
            data = await self._request_json(
                "POST",
                "/api/v1/super-agent/file",
                {
                    "project_id": project_id,
                    "parent_id": parent_id,
                    "file_name": directory_name,
                    "is_directory": True,
                    "ignore_duplicate": True,
                    "pre_file_id": -1,
                },
            )
            parent_id = str(data.get("file_id") or "")
            if not parent_id:
                raise DesignVideoServiceError(f"创建项目目录失败: {directory_name}")
        return parent_id

    async def generate_video(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request_json("POST", "/api/v1/design/generate-video", payload)

    async def _request_json(
        self,
        method: str,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = f"{self._base_url()}{path}"
        headers = self._build_headers()
        session_to_use = self.session or aiohttp.ClientSession()
        should_close_session = self.session is None

        try:
            async with session_to_use.request(
                method,
                url,
                json=payload,
                headers=headers,
            ) as response:
                response_text = await response.text()
                try:
                    body = json.loads(response_text) if response_text else {}
                except json.JSONDecodeError as exc:
                    raise DesignVideoServiceError(
                        f"magic-service 返回非 JSON 响应: {response_text[:200]}"
                    ) from exc

                if response.status < 200 or response.status >= 300:
                    raise self._build_error(body, f"magic-service HTTP {response.status}")

                return self._extract_data(body)
        except aiohttp.ClientError as exc:
            raise DesignVideoServiceError(f"连接 magic-service 失败: {exc}") from exc
        finally:
            if should_close_session:
                await session_to_use.close()

    def _base_url(self) -> str:
        base_url = self.config.api_base_url.rstrip("/")
        for suffix in ("/api/v1", "/v1"):
            if base_url.endswith(suffix):
                return base_url[: -len(suffix)]
        return base_url

    def _build_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "DesignVideoClient/1.0",
        }
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        MetadataUtil.add_magic_and_user_authorization_headers(headers)

        if MetadataUtil.is_initialized():
            metadata = MetadataUtil.get_metadata()
            user_authorization = metadata.get("authorization")
            if user_authorization:
                headers.setdefault("User-Authorization", str(user_authorization))
            organization_code = metadata.get("organization_code")
            if organization_code:
                headers["organization-code"] = str(organization_code)
            task_id = metadata.get("super_magic_task_id")
            if task_id:
                headers["Magic-Task-Id"] = str(task_id)
            topic_id = metadata.get("topic_id")
            if topic_id:
                headers["Magic-Topic-Id"] = str(topic_id)
            chat_topic_id = metadata.get("chat_topic_id")
            if chat_topic_id:
                headers["Magic-Chat-Topic-Id"] = str(chat_topic_id)
            language = metadata.get("language")
            if language:
                headers["Magic-Language"] = str(language)

        return headers

    @staticmethod
    def _extract_data(body: Dict[str, Any]) -> Dict[str, Any]:
        if "code" not in body:
            return body

        code = str(body.get("code") or "")
        if code in {"0", "1000"}:
            data = body.get("data")
            return data if isinstance(data, dict) else {}

        raise DesignVideoClient._build_error(body, "magic-service 业务错误")

    @staticmethod
    def _build_error(body: Dict[str, Any], fallback_message: str) -> DesignVideoServiceError:
        error = body.get("error") if isinstance(body.get("error"), dict) else {}
        code = str(error.get("code") or body.get("code") or "")
        message = str(error.get("message") or body.get("message") or fallback_message)
        request_id = str(error.get("request_id") or body.get("request_id") or "")
        suffix_parts = []
        if code:
            suffix_parts.append(f"code={code}")
        if request_id:
            suffix_parts.append(f"request_id={request_id}")
        if suffix_parts:
            message = f"{message} ({', '.join(suffix_parts)})"
        return DesignVideoServiceError(message, code=code)

    @staticmethod
    def _split_directory_path(directory_path: str) -> list[str]:
        return [
            segment
            for segment in directory_path.strip("/").split("/")
            if segment and segment not in {".", ".."}
        ]
