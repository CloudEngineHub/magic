"""从官方头像库绑定头像：成功、复用、图库不可用、候选顺延；使用假客户端，不访问网络。"""

import io
import json

import pytest
from PIL import Image

from agentlang.context.tool_context import ToolContext
from app.tools.persona_research import assign_persona_portraits as module
from app.tools.persona_research.assign_persona_portraits import (
    AssignPersonaPortraits,
    AssignPersonaPortraitsParams,
    PersonaPortraitRequest,
)
from app.utils.async_file_utils import async_mkdir, async_read_bytes, async_read_text, async_write_text

PID = "p_test_ab12"


def png(color="red"):
    output = io.BytesIO()
    Image.new("RGB", (400, 400), color).save(output, format="PNG")
    return output.getvalue()


class FakeClient:
    def __init__(self, catalog, files=None, catalog_error=None):
        self.catalog, self.files, self.catalog_error = catalog, files or {}, catalog_error
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get_persona_avatar_catalog(self, access):
        self.calls.append("catalog")
        if self.catalog_error:
            raise ConnectionError(self.catalog_error)
        return self.catalog

    async def get_persona_avatar_file_url(self, avatar_id, access):
        self.calls.append(f"url:{avatar_id}")
        return {"id": avatar_id, "file_url": f"https://files.test/{avatar_id}"}

    async def download_url_bytes(self, url, max_bytes):
        self.calls.append(f"download:{url.rsplit('/', 1)[1]}")
        data = self.files.get(url.rsplit("/", 1)[1])
        if data is None:
            raise ConnectionError("gone")
        return data


def install(monkeypatch, client):
    monkeypatch.setattr(module, "MagicServiceClient", lambda: client)


async def profile(root):
    target = root / f"personas/{PID}.json"
    await async_mkdir(target.parent, parents=True, exist_ok=True)
    await async_write_text(target, json.dumps({"schema_version": 1, "id": PID, "name": "Test", "tier": "generated"}))


async def run(root, replace=False, **request):
    params = AssignPersonaPortraitsParams(requests=[PersonaPortraitRequest(persona_id=PID, **request)], replace=replace)
    return await AssignPersonaPortraits(base_dir=root).execute(ToolContext(), params)


def item(entry_id, **tags):
    return {"id": entry_id, "tags": {k: v for k, v in tags.items()}}


@pytest.mark.asyncio
async def test_binds_best_match_as_small_webp_in_workspace(tmp_path, monkeypatch):
    await profile(tmp_path)
    catalog = {"items": [item("a1", country=["CN"], gender=["feminine"], age_band=["35_44"], industry=["C"]),
                         item("a2", country=["US"], gender=["feminine"], age_band=["35_44"], industry=["C"])]}  # fmt: skip
    client = FakeClient(catalog, {"a1": png("blue"), "a2": png("green")})
    install(monkeypatch, client)
    result = await run(tmp_path, age=38, gender="feminine", country="CN", industry="C")
    assert result.ok, result.content
    outcome = result.data["results"][0]
    assert outcome["status"] == "assigned" and outcome["asset_id"] == "a1" and outcome["match"] == "exact"
    saved = json.loads(await async_read_text(tmp_path / f"personas/{PID}.json"))
    assert saved["tier"] == "generated" and saved["portrait"]["file"].startswith(f"personas/portraits/{PID}/")
    with Image.open(io.BytesIO(await async_read_bytes(tmp_path / saved["portrait"]["file"]))) as image:
        assert image.format == "WEBP" and image.size == (320, 320)
    # 原图不落临时文件：工作区只有人设和最终头像
    files = sorted(p.relative_to(tmp_path).as_posix() for p in tmp_path.rglob("*") if p.is_file())
    assert files == [f"personas/{PID}.json", saved["portrait"]["file"]]


@pytest.mark.asyncio
async def test_reuses_existing_portrait_without_calling_the_library(tmp_path, monkeypatch):
    await profile(tmp_path)
    client = FakeClient({"items": [item("a1", gender=["feminine"], age_band=["25_34"])]}, {"a1": png()})
    install(monkeypatch, client)
    first = await run(tmp_path, gender="feminine")
    again_client = FakeClient({"items": []})
    install(monkeypatch, again_client)
    again = await run(tmp_path, gender="feminine")
    assert again.ok and again.data["results"][0]["status"] == "reused"
    assert again.data["results"][0]["portrait"] == first.data["results"][0]["portrait"]
    assert again_client.calls == []


@pytest.mark.asyncio
async def test_library_unavailable_keeps_persona_unchanged(tmp_path, monkeypatch):
    await profile(tmp_path)
    before = await async_read_text(tmp_path / f"personas/{PID}.json")
    install(monkeypatch, FakeClient({}, catalog_error="down"))
    result = await run(tmp_path, gender="feminine")
    assert not result.ok and result.data["results"][0]["status"] == "unavailable"
    assert await async_read_text(tmp_path / f"personas/{PID}.json") == before
    # 空目录同样视为暂不可用，而不是「没有合适的图」
    install(monkeypatch, FakeClient({"items": []}))
    assert (await run(tmp_path)).data["results"][0]["status"] == "unavailable"


@pytest.mark.asyncio
async def test_failed_download_falls_through_to_next_candidate(tmp_path, monkeypatch):
    await profile(tmp_path)
    catalog = {
        "items": [item("best", country=["CN"], age_band=["25_34"]), item("next", country=["US"], age_band=["25_34"])]
    }
    client = FakeClient(catalog, {"next": png()})  # best 下载失败
    install(monkeypatch, client)
    result = await run(tmp_path, age=28, country="CN")
    outcome = result.data["results"][0]
    assert outcome["status"] == "assigned" and outcome["asset_id"] == "next" and outcome["match"] == "generic"
    assert "country" in outcome["unmet"]


@pytest.mark.asyncio
async def test_no_match_is_valid_and_leaves_persona_unchanged(tmp_path, monkeypatch):
    await profile(tmp_path)
    install(monkeypatch, FakeClient({"items": [item("m", gender=["masculine"], age_band=["25_34"])]}, {"m": png()}))
    result = await run(tmp_path, gender="feminine")
    assert result.ok and result.data["results"][0]["status"] == "no_match" and result.data["unresolved"] == 1
    assert "portrait" not in json.loads(await async_read_text(tmp_path / f"personas/{PID}.json"))


@pytest.mark.asyncio
async def test_replace_rebinds_and_unknown_persona_fails_alone(tmp_path, monkeypatch):
    await profile(tmp_path)
    catalog = {"items": [item("a1", age_band=["25_34"])]}
    install(monkeypatch, FakeClient(catalog, {"a1": png("red")}))
    first = await run(tmp_path)
    install(monkeypatch, FakeClient(catalog, {"a1": png("yellow")}))
    second = await run(tmp_path, replace=True)
    assert second.data["results"][0]["status"] == "assigned"
    assert second.data["results"][0]["portrait"]["file"] != first.data["results"][0]["portrait"]["file"]
    params = AssignPersonaPortraitsParams(requests=[PersonaPortraitRequest(persona_id="p_missing_01")])
    missing = await AssignPersonaPortraits(base_dir=tmp_path).execute(ToolContext(), params)
    assert not missing.ok and missing.data["results"][0]["status"] == "failed"


def test_duplicate_persona_ids_are_rejected():
    with pytest.raises(ValueError):
        AssignPersonaPortraitsParams(requests=[PersonaPortraitRequest(persona_id=PID)] * 2)
