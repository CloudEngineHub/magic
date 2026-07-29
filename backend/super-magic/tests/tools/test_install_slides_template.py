import asyncio
import shutil
import zipfile

import pytest

from agentlang.context.tool_context import ToolContext
from app.i18n import i18n
from app.infrastructure.magic_service.client import MagicServiceClient
from app.infrastructure.magic_service.config import MagicServiceConfig
from app.tools.install_slides_template import (
    InstallSlidesTemplate,
    InstallSlidesTemplateParams,
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
        "/api/v1/open-api/slides-templates/ppt%2Fa%20b%3F/file-url",
        None,
        "幻灯片模板文件链接获取",
        {
            "topic_id": "topic-1",
            "project_id": "project-1",
        },
    )
    assert result["template_file_url"] == "https://example.test/template.zip"


@pytest.mark.asyncio
async def test_install_slides_template_tool_installs_template(monkeypatch, tmp_path):
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

    async def fake_download(download_url, download_path):
        assert download_url == "https://example.test/template.zip"
        with zipfile.ZipFile(download_path, "w") as archive:
            archive.writestr("business/template.json", '{"template_id":"PPT-business-minimal"}')
            archive.writestr("business/theme.css", ":root{}")

    monkeypatch.setattr(
        "app.tools.install_slides_template.MagicServiceClient",
        FakeMagicServiceClient,
    )
    monkeypatch.setattr(
        InstallSlidesTemplate,
        "_download_template_file",
        staticmethod(fake_download),
    )

    async def fake_extract(self, zip_path, code):
        install_dir = tmp_path / "templates" / "business"
        await asyncio.to_thread(self._extract_zip_safely, zip_path, install_dir)
        return install_dir

    monkeypatch.setattr(
        InstallSlidesTemplate,
        "_extract_template_to_temp_dir",
        fake_extract,
    )

    tool = InstallSlidesTemplate()
    params = InstallSlidesTemplateParams(
        code=" ppt-business-minimal ",
    )
    result = await tool.execute(
        ToolContext(
            tool_call_id="call-1",
            tool_name="install_slides_template",
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
    assert result.data["code"] == "ppt-business-minimal"
    assert result.data["template_name"] == "职场白皮书"
    assert result.data["installed_directory"] == str(tmp_path / "templates" / "business")
    assert (tmp_path / "templates" / "business" / "business" / "template.json").exists()
    assert (tmp_path / "templates" / "business" / "business" / "theme.css").exists()
    assert "Slides template installed." in result.content
    assert "- template code: ppt-business-minimal" in result.content
    assert "- template name: 职场白皮书" in result.content
    assert f"- installed directory (absolute path): `{tmp_path / 'templates' / 'business'}`" in result.content


@pytest.mark.asyncio
async def test_install_slides_template_tool_extracts_to_temp_directory(tmp_path):
    zip_path = tmp_path / "template.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("template.json", "{}")

    tool = InstallSlidesTemplate()
    install_dir = await tool._extract_template_to_temp_dir(zip_path, "ppt/business minimal")

    try:
        assert install_dir.name == "template"
        assert install_dir.parent.name.startswith("slides_template_ppt_business_minimal_")
        assert (install_dir / "template.json").exists()
    finally:
        shutil.rmtree(install_dir.parent, ignore_errors=True)


@pytest.mark.asyncio
async def test_install_slides_template_tool_rejects_non_zip_download(monkeypatch, tmp_path):
    class FakeMagicServiceClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get_slides_template_file_url(self, code, access_context=None):
            return {
                "code": code,
                "label": {"zh_CN": "职场白皮书"},
                "template_file_url": "https://example.test/template.bin",
            }

    async def fake_download(download_url, download_path):
        download_path.write_text("not a zip", encoding="utf-8")

    monkeypatch.setattr(
        "app.tools.install_slides_template.MagicServiceClient",
        FakeMagicServiceClient,
    )
    monkeypatch.setattr(
        InstallSlidesTemplate,
        "_download_template_file",
        staticmethod(fake_download),
    )

    tool = InstallSlidesTemplate()
    result = await tool.execute(
        ToolContext(tool_name="install_slides_template", arguments={}),
        InstallSlidesTemplateParams(code="ppt-business-minimal"),
    )

    assert result.ok is False
    assert "not a readable ZIP package" in result.content


@pytest.mark.asyncio
async def test_install_slides_template_tool_rejects_unsafe_zip_paths(monkeypatch, tmp_path):
    class FakeMagicServiceClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get_slides_template_file_url(self, code, access_context=None):
            return {
                "code": code,
                "label": {"zh_CN": "职场白皮书"},
                "template_file_url": "https://example.test/template.zip",
            }

    async def fake_download(download_url, download_path):
        with zipfile.ZipFile(download_path, "w") as archive:
            archive.writestr("../evil.txt", "owned")
            archive.writestr("template.json", "{}")

    monkeypatch.setattr(
        "app.tools.install_slides_template.MagicServiceClient",
        FakeMagicServiceClient,
    )
    monkeypatch.setattr(
        InstallSlidesTemplate,
        "_download_template_file",
        staticmethod(fake_download),
    )

    tool = InstallSlidesTemplate()
    result = await tool.execute(
        ToolContext(tool_name="install_slides_template", arguments={}),
        InstallSlidesTemplateParams(code="ppt-business-minimal"),
    )

    assert result.ok is False
    assert "Unsafe path in template package" in result.content
    assert not (tmp_path / "templates" / "evil.txt").exists()


@pytest.mark.asyncio
async def test_install_slides_template_tool_i18n_and_detail(monkeypatch, tmp_path):
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

    async def fake_download(download_url, download_path):
        with zipfile.ZipFile(download_path, "w") as archive:
            archive.writestr("template.json", "{}")

    monkeypatch.setattr(
        "app.tools.install_slides_template.MagicServiceClient",
        FakeMagicServiceClient,
    )
    monkeypatch.setattr(
        InstallSlidesTemplate,
        "_download_template_file",
        staticmethod(fake_download),
    )

    async def fake_extract(self, zip_path, code):
        install_dir = tmp_path / "template"
        await asyncio.to_thread(self._extract_zip_safely, zip_path, install_dir)
        return install_dir

    monkeypatch.setattr(
        InstallSlidesTemplate,
        "_extract_template_to_temp_dir",
        fake_extract,
    )

    tool = InstallSlidesTemplate()
    arguments = {"code": "ppt-business-minimal"}
    context = ToolContext(tool_name="install_slides_template", arguments=arguments)

    try:
        i18n.set_language("zh_CN")
        before = await tool.get_before_tool_call_friendly_action_and_remark(
            "install_slides_template",
            context,
            arguments,
        )
        assert before["action"] == "安装幻灯片模板"
        assert before["remark"] == "正在安装模板 ppt-business-minimal"

        result = await tool.execute(context, InstallSlidesTemplateParams(**arguments))
        after = await tool.get_after_tool_call_friendly_action_and_remark(
            "install_slides_template",
            context,
            result,
            0.1,
            arguments,
        )
        detail = await tool.get_tool_detail(context, result, arguments)
        assert after["remark"] == "已安装模板 ppt-business-minimal"
        assert detail is not None
        assert "幻灯片模板安装结果" in detail.data.content
        assert str(tmp_path / "template") in detail.data.content

        i18n.set_language("en_US")
        before_en = await tool.get_before_tool_call_friendly_action_and_remark(
            "install_slides_template",
            context,
            arguments,
        )
        assert before_en["action"] == "Install slide template"
        assert before_en["remark"] == "Installing template ppt-business-minimal"
    finally:
        i18n.reset_language()


def test_install_slides_template_tool_is_code_mode_only():
    assert InstallSlidesTemplate.code_mode_only is True


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
