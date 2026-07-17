"""Tests for AudioUnderstanding lightweight corruption detection.

The detection walks top-level ISO BMFF (mp4/m4a/mov/3gp) box headers and flags a
file as corrupted when any box claims to extend beyond the real file size, which
means the file is truncated and its sample index (moov) is incomplete.

Synthetic fixtures below mirror the byte structure of two real samples:
- a truncated file whose 'moov' box overflows EOF (corrupted)
- a well-formed file whose boxes all stay within bounds (healthy)

Two extra tests run against the real samples when they exist locally, so the
exact files reported by the user can be verified on the dev machine while CI
stays portable.
"""

import struct
from pathlib import Path

import pytest

from app.tools.audio_understanding import AudioUnderstanding

# Real samples reported by the user; tests using them skip when absent.
REAL_CORRUPTED_FILE = Path("/Users/rockli/Downloads/927490488793640960.m4a")
REAL_HEALTHY_FILE = Path("/Users/rockli/Downloads/927600033708908546.m4a")


def _box32(box_type: bytes, payload: bytes) -> bytes:
    """Build an ISO BMFF box with a 32-bit size header."""
    return struct.pack(">I", 8 + len(payload)) + box_type + payload


def _box64(box_type: bytes, payload: bytes) -> bytes:
    """Build an ISO BMFF box with a 64-bit extended size header (size field == 1)."""
    return struct.pack(">I", 1) + box_type + struct.pack(">Q", 16 + len(payload)) + payload


def _write(tmp_path: Path, name: str, data: bytes) -> Path:
    path = tmp_path / name
    path.write_bytes(data)
    return path


def _make_tool(tmp_path: Path) -> AudioUnderstanding:
    return AudioUnderstanding(base_dir=str(tmp_path))


@pytest.mark.asyncio
async def test_detects_truncated_moov_overflow(tmp_path):
    """Mirrors the corrupted sample: 64-bit mdat is valid, but moov overflows EOF."""
    ftyp = _box32(b"ftyp", b"3gp4" + b"\x00\x00\x00\x00" + b"isom3gp4")
    mdat = _box64(b"mdat", b"\xab" * 2000)
    # moov header claims 5000 bytes but only 200 are actually present -> truncated.
    moov = struct.pack(">I", 5000) + b"moov" + b"\x00" * 200
    audio = _write(tmp_path, "corrupted.m4a", ftyp + mdat + moov)

    reason = await _make_tool(tmp_path)._detect_corruption(audio)

    assert reason is not None
    assert "moov" in reason
    assert "truncated" in reason


@pytest.mark.asyncio
async def test_passes_well_formed_container(tmp_path):
    """Mirrors the healthy sample: every box stays within the file bounds."""
    ftyp = _box32(b"ftyp", b"isom" + b"\x00\x00\x00\x00" + b"isommp42")
    mdat = _box64(b"mdat", b"\xcd" * 2000)
    moov = _box32(b"moov", b"\x00" * 300)
    audio = _write(tmp_path, "healthy.m4a", ftyp + mdat + moov)

    reason = await _make_tool(tmp_path)._detect_corruption(audio)

    assert reason is None


@pytest.mark.asyncio
async def test_reports_missing_byte_count(tmp_path):
    """The reason should quantify how many bytes are missing for actionable feedback."""
    ftyp = _box32(b"ftyp", b"isom" + b"\x00\x00\x00\x00" + b"isommp42")
    # Declared 1000 but only 100 bytes of payload present -> 900 - 200(present diff) missing.
    moov = struct.pack(">I", 1000) + b"moov" + b"\x00" * 100
    audio = _write(tmp_path, "short.m4a", ftyp + moov)

    reason = await _make_tool(tmp_path)._detect_corruption(audio)

    assert reason is not None
    # ftyp(24) + moov header(8) + 100 payload = 132; declared end = 24 + 1000 = 1024.
    assert "892 bytes missing" in reason


@pytest.mark.asyncio
async def test_too_small_file_is_corrupted(tmp_path):
    audio = _write(tmp_path, "tiny.m4a", b"\x00\x00")

    reason = await _make_tool(tmp_path)._detect_corruption(audio)

    assert reason is not None
    assert "too small" in reason


@pytest.mark.asyncio
async def test_non_iso_extension_is_skipped(tmp_path):
    """Non mp4-family formats (e.g. mp3) are not ISO BMFF and must not be flagged."""
    audio = _write(tmp_path, "audio.mp3", b"not-an-iso-container" * 10)

    reason = await _make_tool(tmp_path)._detect_corruption(audio)

    assert reason is None


@pytest.mark.asyncio
@pytest.mark.skipif(
    not REAL_CORRUPTED_FILE.exists(),
    reason=f"real corrupted sample not available: {REAL_CORRUPTED_FILE}",
)
async def test_real_corrupted_sample(tmp_path):
    reason = await _make_tool(tmp_path)._detect_corruption(REAL_CORRUPTED_FILE)

    assert reason is not None
    assert "moov" in reason
    assert "truncated" in reason


@pytest.mark.asyncio
@pytest.mark.skipif(
    not REAL_HEALTHY_FILE.exists(),
    reason=f"real healthy sample not available: {REAL_HEALTHY_FILE}",
)
async def test_real_healthy_sample(tmp_path):
    reason = await _make_tool(tmp_path)._detect_corruption(REAL_HEALTHY_FILE)

    assert reason is None
