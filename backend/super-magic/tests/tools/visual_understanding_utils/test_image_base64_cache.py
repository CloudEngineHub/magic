from __future__ import annotations

import json
import os

import pytest
from PIL import Image

from app.path_manager import PathManager
from app.tools.visual_understanding_utils.image_base64_cache import (
    CACHE_DIRECTORY_NAME,
    CACHE_VERSION,
    CachedImageBase64,
    ImageBase64Cache,
    ImageBase64CacheKey,
)
from app.tools.visual_understanding_utils.image_compression_service import (
    ImageCompressionService,
    _flatten_alpha_sync,
)


def _make_key(**overrides) -> ImageBase64CacheKey:
    values = {
        "source_path": "/workspace/.tmp/source.png",
        "source_mtime_ns": 1_700_000_000_000_000_000,
        "source_size": 2048,
        "quality": 90,
        "max_dimension": 1920,
        "max_size_bytes": 512 * 1024,
    }
    values.update(overrides)
    return ImageBase64CacheKey(**values)


def _make_value(data_url: str = "data:image/webp;base64,QUJD") -> CachedImageBase64:
    return CachedImageBase64(data_url=data_url, width=100, height=50, output_size=3)


@pytest.fixture
def runtime_root(tmp_path, monkeypatch):
    """把 `.runtime` 根指向临时目录；缓存目录必须位于该根之内。"""
    monkeypatch.setattr(PathManager, "get_runtime_dir", classmethod(lambda cls: tmp_path))
    return tmp_path


@pytest.fixture
def cache(runtime_root) -> ImageBase64Cache:
    return ImageBase64Cache()


def _entry_path(runtime_root, key: ImageBase64CacheKey):
    return runtime_root / CACHE_DIRECTORY_NAME / f"{key.digest()}.json"


@pytest.mark.asyncio
async def test_put_then_get_round_trips(cache):
    """写入后再读取应得到完全相同的结果。"""
    key = _make_key()
    value = _make_value()

    await cache.put(key, value)

    assert await cache.get(key) == value


@pytest.mark.asyncio
async def test_different_compression_inputs_do_not_share_entry(cache):
    """图片版本或压缩参数变化时必须视为未命中。"""
    await cache.put(_make_key(), _make_value())

    assert await cache.get(_make_key(quality=50)) is None
    assert await cache.get(_make_key(source_mtime_ns=2)) is None
    assert await cache.get(_make_key(source_size=4096)) is None
    assert await cache.get(_make_key(max_dimension=1024)) is None
    assert await cache.get(_make_key(max_size_bytes=1024)) is None
    assert await cache.get(_make_key(source_path="/workspace/.tmp/other.png")) is None


@pytest.mark.asyncio
async def test_cache_directory_and_entry_are_private(cache, runtime_root):
    """缓存目录 0700、缓存文件 0600。"""
    key = _make_key()
    await cache.put(key, _make_value())

    cache_dir = runtime_root / CACHE_DIRECTORY_NAME
    assert cache_dir.is_dir()
    assert cache_dir.stat().st_mode & 0o777 == 0o700
    assert _entry_path(runtime_root, key).stat().st_mode & 0o777 == 0o600


@pytest.mark.asyncio
async def test_corrupted_entry_is_treated_as_miss(cache, runtime_root):
    """损坏的缓存文件不能中断主流程，只当作未命中。"""
    key = _make_key()
    await cache.put(key, _make_value())
    _entry_path(runtime_root, key).write_text("{not json", encoding="utf-8")

    assert await cache.get(key) is None


@pytest.mark.asyncio
async def test_version_mismatch_is_treated_as_miss(cache, runtime_root):
    """缓存结构版本变化后旧条目应失效。"""
    key = _make_key()
    await cache.put(key, _make_value())

    path = _entry_path(runtime_root, key)
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["version"] = CACHE_VERSION + 1
    path.write_text(json.dumps(payload), encoding="utf-8")

    assert await cache.get(key) is None


@pytest.mark.asyncio
async def test_entry_with_mismatched_key_is_treated_as_miss(cache, runtime_root):
    """摘要命中但键内容不同时必须未命中，避免串图。"""
    key = _make_key()
    await cache.put(key, _make_value())

    path = _entry_path(runtime_root, key)
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["key"]["source_path"] = "/workspace/.tmp/other.png"
    path.write_text(json.dumps(payload), encoding="utf-8")

    assert await cache.get(key) is None


@pytest.mark.asyncio
async def test_cache_disabled_when_runtime_dir_unavailable(monkeypatch):
    """.runtime 不可用时缓存整体关闭，读写都是无副作用空操作。"""

    def _raise(cls):
        raise RuntimeError("runtime unavailable")

    monkeypatch.setattr(PathManager, "get_runtime_dir", classmethod(_raise))
    disabled = ImageBase64Cache()

    assert disabled.enabled is False
    assert disabled.cache_dir is None
    assert await disabled.get(_make_key()) is None
    await disabled.put(_make_key(), _make_value())


def test_flatten_alpha_composites_transparency_onto_white():
    """降级重试把透明像素合成到白底，不透明像素保持原色。"""
    image = Image.new("RGBA", (2, 1))
    image.putpixel((0, 0), (255, 0, 0, 255))
    image.putpixel((1, 0), (0, 0, 255, 0))

    flattened = _flatten_alpha_sync(image)

    assert flattened.mode == "RGB"
    assert flattened.getpixel((0, 0)) == (255, 0, 0)
    assert flattened.getpixel((1, 0)) == (255, 255, 255)


@pytest.mark.asyncio
async def test_get_base64_reuses_cached_result_without_recompressing(runtime_root, tmp_path, monkeypatch):
    """换一个服务实例处理同一张图时，应直接命中缓存，不再进入压缩搜索。"""
    source = tmp_path / "source.png"
    image = Image.new("RGB", (64, 48), color="red")
    image.save(source, format="PNG")
    image.close()

    cache_dir = runtime_root / CACHE_DIRECTORY_NAME
    first = await ImageCompressionService(base64_cache=ImageBase64Cache(cache_dir)).get_base64(source)

    async def _unexpected_search(*args, **kwargs):
        raise AssertionError("缓存命中时不应重新压缩")

    monkeypatch.setattr(ImageCompressionService, "_search_webp", _unexpected_search)

    second = await ImageCompressionService(base64_cache=ImageBase64Cache(cache_dir)).get_base64(source)

    assert second == first
    assert second.startswith("data:image/webp;base64,")


@pytest.mark.asyncio
async def test_get_base64_recompresses_after_source_changes(runtime_root, tmp_path):
    """图片内容变化后不能复用旧缓存。"""
    source = tmp_path / "source.png"
    cache_dir = runtime_root / CACHE_DIRECTORY_NAME

    Image.new("RGB", (64, 48), color="red").save(source, format="PNG")
    first = await ImageCompressionService(base64_cache=ImageBase64Cache(cache_dir)).get_base64(source)

    Image.new("RGB", (64, 48), color="blue").save(source, format="PNG")
    stat = source.stat()
    os.utime(source, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))

    second = await ImageCompressionService(base64_cache=ImageBase64Cache(cache_dir)).get_base64(source)

    assert second != first


@pytest.mark.asyncio
async def test_rgba_search_failure_falls_back_to_flattened_image(runtime_root, tmp_path, monkeypatch):
    """保留透明无法达标时，第二次搜索必须基于白底展平后的图像。"""
    source = tmp_path / "transparent.png"
    image = Image.new("RGBA", (64, 64), color=(255, 0, 0, 128))
    image.save(source, format="PNG")
    image.close()

    observed_modes: list[str] = []
    original_search = ImageCompressionService._search_webp

    async def _search(self, target, **kwargs):
        observed_modes.append(target.mode)
        if len(observed_modes) == 1:
            return None
        return await original_search(self, target, **kwargs)

    monkeypatch.setattr(ImageCompressionService, "_search_webp", _search)

    data_url = await ImageCompressionService(
        base64_cache=ImageBase64Cache(runtime_root / CACHE_DIRECTORY_NAME)
    ).get_base64(source)

    assert observed_modes == ["RGBA", "RGB"]
    assert data_url.startswith("data:image/webp;base64,")
