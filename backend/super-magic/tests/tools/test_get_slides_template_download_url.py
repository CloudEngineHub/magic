import pytest

from agentlang.context.tool_context import ToolContext
from app.i18n import i18n
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

        async def _request_json(
            self,
            method,
            path,
            payload=None,
            operation_name="Magic Service API",
            params=None,
        ):
            self.call = (method, path, payload, operation_name, params)
            return {
                "code": "ppt/a b?",
                "label": {"zh_CN": "职场白皮书"},
                "template_file_url": "https://example.test/template.zip",
            }

    client = RecordingMagicServiceClient()

    result = await client.get_slides_template_file_url(
        " ppt/a b? ",
        {
            "topic_id": " topic-1 ",
            "project_id": "project-1",
            "task_id": "",
            "message_id": None,
        },
    )

    assert client.call == (
        "GET",
        "/api/v1/slides-templates/ppt%2Fa%20b%3F/file-url",
        None,
        "幻灯片模板文件链接获取",
        {
            "topic_id": "topic-1",
            "project_id": "project-1",
        },
    )
    assert result["template_file_url"] == "https://example.test/template.zip"


@pytest.mark.asyncio
async def test_get_slides_template_download_url_tool_returns_template_url(monkeypatch):
    clients = []

    class FakeMagicServiceClient:
        def __init__(self):
            self.code = None
            self.access_context = None
            clients.append(self)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get_slides_template_file_url(self, code, access_context=None):
            self.code = code
            self.access_context = access_context
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
        ToolContext(
            tool_call_id="call-1",
            tool_name="get_slides_template_download_url",
            arguments={},
            metadata={
                "topic_id": "topic-1",
                "chat_topic_id": "chat-topic-1",
                "project_id": "project-1",
                "super_magic_task_id": "   ",
                "task_id": "legacy-task-1",
                "message_id": "message-1",
            },
        ),
        params,
    )

    assert result.ok is True
    assert clients[0].code == "ppt-business-minimal"
    assert clients[0].access_context == {
        "topic_id": "topic-1",
        "chat_topic_id": "chat-topic-1",
        "project_id": "project-1",
        "task_id": "legacy-task-1",
        "message_id": "message-1",
        "source": "super_magic_tool",
    }
    assert result.data["template_file_url"] == "https://example.test/template.zip"
    assert "Slides template package URL resolved." in result.content
    assert "- code: ppt-business-minimal" in result.content
    assert "- label: 职场白皮书" in result.content
    assert "- template_file_url: https://example.test/template.zip" in result.content


@pytest.mark.asyncio
async def test_get_slides_template_download_url_tool_i18n_and_detail(monkeypatch):
    class FakeMagicServiceClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get_slides_template_file_url(self, code, access_context=None):
            return {
                "code": code,
                "label": {"zh_CN": "职场白皮书", "en_US": "Corporate Whitepaper"},
                "template_file_url": "https://example.test/template.zip",
            }

    monkeypatch.setattr(
        "app.tools.get_slides_template_download_url.MagicServiceClient",
        FakeMagicServiceClient,
    )

    tool = GetSlidesTemplateDownloadUrl()
    arguments = {"code": "ppt-business-minimal"}
    context = ToolContext(tool_name="get_slides_template_download_url", arguments=arguments)

    try:
        i18n.set_language("zh_CN")
        before = await tool.get_before_tool_call_friendly_action_and_remark(
            "get_slides_template_download_url",
            context,
            arguments,
        )
        assert before["action"] == "获取幻灯片模板下载链接"
        assert before["remark"] == "正在获取模板 ppt-business-minimal 的下载链接"

        result = await tool.execute(context, GetSlidesTemplateDownloadUrlParams(**arguments))
        after = await tool.get_after_tool_call_friendly_action_and_remark(
            "get_slides_template_download_url",
            context,
            result,
            0.1,
            arguments,
        )
        detail = await tool.get_tool_detail(context, result, arguments)
        assert after["remark"] == "已获取模板 ppt-business-minimal 的下载链接"
        assert detail is not None
        assert "幻灯片模板下载链接" in detail.data.content
        assert "[download](https://example.test/template.zip)" in detail.data.content

        i18n.set_language("en_US")
        before_en = await tool.get_before_tool_call_friendly_action_and_remark(
            "get_slides_template_download_url",
            context,
            arguments,
        )
        assert before_en["action"] == "Get slide template download URL"
        assert before_en["remark"] == "Getting download URL for template ppt-business-minimal"
    finally:
        i18n.reset_language()


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
