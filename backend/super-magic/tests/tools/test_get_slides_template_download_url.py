import json

import pytest

from agentlang.context.tool_context import ToolContext
from app.infrastructure.magic_service.client import MagicServiceClient
from app.infrastructure.magic_service.config import MagicServiceConfig
from app.tools.get_slides_template_download_url import (
    GetSlidesTemplateDownloadUrl,
    GetSlidesTemplateDownloadUrlParams,
)


@pytest.mark.asyncio
async def test_magic_service_client_resolves_slides_template_file_url_endpoint():
    class RecordingMagicServiceClient(MagicServiceClient):
        def __init__(self):
            super().__init__(MagicServiceConfig(api_base_url="https://magic.example.test"))
            self.call = None

        async def _request_json(self, method, path, payload=None, operation_name="Magic Service API"):
            self.call = (method, path, payload, operation_name)
            return {
                "code": "ppt/a b?",
                "label": {"zh_CN": "职场白皮书"},
                "template_file_url": "https://example.test/template.zip",
            }

    client = RecordingMagicServiceClient()

    result = await client.get_slides_template_file_url(" ppt/a b? ")

    assert client.call == (
        "GET",
        "/api/v1/slides-templates/ppt%2Fa%20b%3F/file-url",
        None,
        "幻灯片模板文件链接获取",
    )
    assert result["template_file_url"] == "https://example.test/template.zip"


@pytest.mark.asyncio
async def test_get_slides_template_download_url_tool_returns_template_url(monkeypatch):
    clients = []

    class FakeMagicServiceClient:
        def __init__(self):
            self.code = None
            clients.append(self)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get_slides_template_file_url(self, code):
            self.code = code
            return {
                "code": code,
                "label": {"zh_CN": "职场白皮书"},
                "template_file_url": "https://example.test/template.zip",
            }

    monkeypatch.setattr(
        "app.tools.get_slides_template_download_url.MagicServiceClient",
        FakeMagicServiceClient,
    )

    tool = GetSlidesTemplateDownloadUrl()
    params = GetSlidesTemplateDownloadUrlParams(code=" ppt-business-minimal ")
    result = await tool.execute(
        ToolContext(tool_name="get_slides_template_download_url", arguments={}),
        params,
    )

    payload = json.loads(result.content)

    assert result.ok is True
    assert clients[0].code == "ppt-business-minimal"
    assert result.data["template_file_url"] == "https://example.test/template.zip"
    assert payload["code"] == "ppt-business-minimal"
    assert payload["template_file_url"] == "https://example.test/template.zip"


def test_get_slides_template_download_url_tool_is_code_mode_only():
    assert GetSlidesTemplateDownloadUrl.code_mode_only is True


def test_magic_service_client_keeps_magic_and_user_authorization_headers(monkeypatch):
    monkeypatch.setattr(
        "app.infrastructure.magic_service.client.MetadataUtil.add_magic_and_user_authorization_headers",
        lambda headers: headers.update({
            "Magic-Authorization": "magic-token",
            "User-Authorization": "user-token",
        }),
    )
    monkeypatch.setattr(
        "app.infrastructure.magic_service.client.MetadataUtil.get_llm_request_headers",
        lambda: {},
    )
    monkeypatch.setattr(
        "app.infrastructure.magic_service.client.MetadataUtil.get_metadata",
        lambda: {
            "authorization": "user-token",
            "organization_code": "DT001",
        },
    )

    client = MagicServiceClient(MagicServiceConfig(api_base_url="https://magic.example.test"))

    headers = client._build_json_headers()

    assert headers["Magic-Authorization"] == "magic-token"
    assert headers["User-Authorization"] == "user-token"
    assert headers["organization-code"] == "DT001"
