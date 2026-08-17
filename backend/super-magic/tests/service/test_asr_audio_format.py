"""
ASR 音频多格式支持单元测试

覆盖 wav/ogg 双格式探测、过滤、merged 文件名解析与任务级格式钉住
"""

import shutil
import subprocess
from pathlib import Path

import pytest

from app.api.http_dto.asr_dto import AsrTaskResponse
from app.service.asr.asr_base import AsrServiceBase
from app.service.asr.asr_file_detector import AsrFileDetector
from app.service.asr.asr_merge_operations import AsrMergeOperations
from app.service.asr.asr_merge_service import AsrMergeService
from app.service.asr.asr_merge_task_manager import AsrMergeTaskManager
from app.service.asr.asr_utils import (
    DEFAULT_AUDIO_FORMAT,
    build_merged_filename,
    normalize_audio_format,
    resolve_audio_format_from_directory,
    validate_audio_format_for_write,
)


class TestNormalizeAudioFormat:
    """格式归一化：空值/非法值回退 wav，合法值大小写与点号不敏感"""

    def test_none_and_empty_fallback_to_wav(self):
        assert normalize_audio_format(None) == DEFAULT_AUDIO_FORMAT
        assert normalize_audio_format("") == "wav"
        assert normalize_audio_format("   ") == "wav"

    def test_supported_formats(self):
        assert normalize_audio_format("wav") == "wav"
        assert normalize_audio_format("ogg") == "ogg"

    def test_case_and_dot_insensitive(self):
        assert normalize_audio_format("WAV") == "wav"
        assert normalize_audio_format(".OGG") == "ogg"
        assert normalize_audio_format(" Ogg ") == "ogg"

    def test_unsupported_fallback_to_wav(self):
        assert normalize_audio_format("mp3") == "wav"
        assert normalize_audio_format("webm") == "wav"

    def test_unsupported_format_is_rejected_when_pinning(self):
        with pytest.raises(ValueError, match="Unsupported audio format"):
            validate_audio_format_for_write("mp3")

    def test_empty_format_is_rejected_when_pinning(self):
        with pytest.raises(ValueError, match="Audio format is required"):
            validate_audio_format_for_write(None)

    def test_task_response_exposes_audio_format(self):
        response = AsrTaskResponse(status="running", task_key="task-1", audio_format="ogg")
        assert response.model_dump()["audio_format"] == "ogg"


class TestBuildMergedFilename:
    def test_wav_default(self):
        assert build_merged_filename(None) == "merged.wav"
        assert build_merged_filename("wav") == "merged.wav"

    def test_ogg(self):
        assert build_merged_filename("ogg") == "merged.ogg"

    def test_base_class_entry(self):
        assert AsrServiceBase.get_merged_filename("ogg") == "merged.ogg"
        assert AsrServiceBase.get_merged_filename(None) == AsrServiceBase.MERGED_WAV_FILENAME

    def test_existing_merged_ogg_wins_for_legacy_state(self, tmp_path: Path):
        (tmp_path / "merged.ogg").write_bytes(b"ogg")
        assert resolve_audio_format_from_directory(tmp_path, None) == "ogg"

    def test_conflicting_merged_files_are_reported(self, tmp_path: Path):
        (tmp_path / "merged.wav").write_bytes(b"wav")
        (tmp_path / "merged.ogg").write_bytes(b"ogg")
        with pytest.raises(ValueError, match="Conflicting merged audio files"):
            resolve_audio_format_from_directory(tmp_path, None)

    def test_state_format_conflicts_with_existing_merged_file(self, tmp_path: Path):
        (tmp_path / "merged.ogg").write_bytes(b"ogg")
        with pytest.raises(ValueError, match="conflicts with existing merged file"):
            resolve_audio_format_from_directory(tmp_path, "wav")


class TestAsrFileDetector:
    """分片扫描与格式探测"""

    def test_extract_file_index_supports_wav_and_ogg(self):
        detector = AsrFileDetector()
        assert detector.extract_file_index("0.wav") == 0
        assert detector.extract_file_index("12.ogg") == 12
        assert detector.extract_file_index("3.WAV") == 3
        assert detector.extract_file_index("7.OGG") == 7

    def test_extract_file_index_rejects_other_names(self):
        detector = AsrFileDetector()
        assert detector.extract_file_index("merged.wav") is None
        assert detector.extract_file_index("1.mp3") is None
        assert detector.extract_file_index("notes.md") is None
        assert detector.extract_file_index("wav") is None

    def test_scan_audio_files_mixed_dir(self, tmp_path: Path):
        (tmp_path / "0.wav").write_bytes(b"a")
        (tmp_path / "1.ogg").write_bytes(b"b")
        (tmp_path / "2.wav").write_bytes(b"c")
        (tmp_path / "merged.wav").write_bytes(b"m")
        (tmp_path / "merged.ogg").write_bytes(b"m")
        (tmp_path / "notes.md").write_text("n")

        detector = AsrFileDetector()
        files = detector.scan_audio_files(tmp_path, include_merged=False)
        assert [idx for idx, _ in files] == [0, 1, 2]

        # include_merged=True 时 merged.* 也不会被识别（extract_file_index 过滤），行为不变
        files_with_merged = detector.scan_audio_files(tmp_path, include_merged=True)
        assert [idx for idx, _ in files_with_merged] == [0, 1, 2]

    def test_detect_audio_format(self, tmp_path: Path):
        wav0 = tmp_path / "0.wav"
        ogg1 = tmp_path / "1.ogg"
        wav0.touch()
        ogg1.touch()

        assert AsrFileDetector.detect_audio_format([]) is None
        assert AsrFileDetector.detect_audio_format([(0, wav0)]) == "wav"
        assert AsrFileDetector.detect_audio_format([(1, ogg1)]) == "ogg"
        # 混合目录以防呆策略取最小序号分片的格式
        assert AsrFileDetector.detect_audio_format([(1, ogg1), (0, wav0)]) == "wav"

    def test_filter_by_format(self, tmp_path: Path):
        files = [(0, tmp_path / "0.wav"), (1, tmp_path / "1.ogg"), (2, tmp_path / "2.WAV")]
        wav_files = AsrFileDetector.filter_by_format(files, "wav")
        assert [idx for idx, _ in wav_files] == [0, 2]
        ogg_files = AsrFileDetector.filter_by_format(files, "ogg")
        assert [idx for idx, _ in ogg_files] == [1]

    def test_scan_preserves_duplicate_index_conflicts(self, tmp_path: Path):
        (tmp_path / "0.wav").write_bytes(b"wav")
        (tmp_path / "0.ogg").write_bytes(b"ogg")
        (tmp_path / "1.ogg").write_bytes(b"ogg")

        detector = AsrFileDetector()
        files, conflicts = detector.scan_audio_files_with_conflicts(tmp_path, include_merged=False)

        assert [idx for idx, _ in files] == [0, 0, 1]
        assert conflicts[0]["index"] == 0
        assert {item.name for item in conflicts[0]["files"]} == {"0.wav", "0.ogg"}

    def test_scan_reports_mixed_formats_across_indexes(self, tmp_path: Path):
        (tmp_path / "0.wav").write_bytes(b"wav")
        (tmp_path / "1.ogg").write_bytes(b"ogg")

        _, conflicts = AsrFileDetector().scan_audio_files_with_conflicts(tmp_path, include_merged=False)
        assert any(item.get("type") == "mixed_format" for item in conflicts)

    def test_deduplicate_scanned_files_keeps_latest_file_per_index(self, tmp_path: Path):
        old_file = tmp_path / "0.wav"
        new_file = tmp_path / "0.ogg"
        old_file.write_bytes(b"old")
        new_file.write_bytes(b"new")
        old_file.touch()
        new_file.touch()

        files = AsrFileDetector.deduplicate_files([(0, old_file), (0, new_file)])
        assert files == [(0, new_file)]

    async def test_validate_ogg_requires_opus_and_mono(self, tmp_path: Path, monkeypatch):
        ogg_file = tmp_path / "0.ogg"
        ogg_file.write_bytes(b"ogg")
        detector = AsrFileDetector()

        async def fake_probe(path):
            return {"format_name": "ogg", "codec_name": "opus", "channels": 1, "sample_rate": 16000}

        monkeypatch.setattr(detector, "probe_audio_file", fake_probe)
        valid, reason = await detector.validate_audio_file(ogg_file, "ogg")
        assert valid is True
        assert reason == ""

        async def fake_bad_probe(path):
            return {"format_name": "ogg", "codec_name": "vorbis", "channels": 2, "sample_rate": 44100}

        monkeypatch.setattr(detector, "probe_audio_file", fake_bad_probe)
        valid, reason = await detector.validate_audio_file(ogg_file, "ogg")
        assert valid is False
        assert "Opus" in reason


class TestOggConcatStrategy:
    def test_ogg_concat_is_reencoded_until_copy_mode_is_enabled(self, monkeypatch, tmp_path: Path):
        operations = AsrMergeOperations(AsrFileDetector())
        output = tmp_path / "merged.ogg"
        monkeypatch.setattr("app.service.asr.asr_time_config.asr_time_config.OGG_COPY_CONCAT_ENABLED", False)
        cmd = operations._build_ffmpeg_concat_command(tmp_path / "concat.txt", output)
        assert "-c:a" in cmd
        assert "libopus" in cmd

    def test_ogg_concat_uses_copy_when_explicitly_enabled(self, monkeypatch, tmp_path: Path):
        operations = AsrMergeOperations(AsrFileDetector())
        output = tmp_path / "merged.ogg"
        monkeypatch.setattr("app.service.asr.asr_time_config.asr_time_config.OGG_COPY_CONCAT_ENABLED", True)
        cmd = operations._build_ffmpeg_concat_command(tmp_path / "concat.txt", output)
        assert cmd[cmd.index("-c") + 1] == "copy"

    async def test_real_ogg_segments_reencode_and_validate(self, tmp_path: Path):
        if not shutil.which("ffmpeg"):
            pytest.skip("ffmpeg is required for the real Ogg concat test")

        for index, frequency in enumerate((440, 660)):
            subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    f"sine=frequency={frequency}:duration=1",
                    "-ar",
                    "16000",
                    "-ac",
                    "1",
                    "-c:a",
                    "libopus",
                    "-b:a",
                    "32k",
                    str(tmp_path / f"{index}.ogg"),
                ],
                check=True,
            )
        list_file = tmp_path / "concat.txt"
        list_file.write_text("\n".join(f"file '{tmp_path / f'{index}.ogg'}'" for index in range(2)))

        operations = AsrMergeOperations(AsrFileDetector())
        output = tmp_path / "merged.ogg"
        assert await operations._run_ffmpeg_process(list_file, output, "测试合并") is True
        valid, reason = await AsrFileDetector().validate_audio_file(output, "ogg")
        assert valid, reason


class TestMergeBlocking:
    def test_unresolved_format_with_files_blocks_merge(self, tmp_path: Path):
        assert AsrMergeService.should_block_merge(None, [(0, tmp_path / "0.ogg")], None) is True

    def test_format_error_blocks_merge_even_when_format_is_known(self, tmp_path: Path):
        assert AsrMergeService.should_block_merge("ogg", [(0, tmp_path / "0.ogg")], "bad codec") is True

    def test_empty_directory_without_error_does_not_block_merge(self):
        assert AsrMergeService.should_block_merge(None, [], None) is False


class TestTaskAudioFormatPinning:
    """任务级格式钉住：首次写入生效，后续不再改写"""

    async def test_set_audio_format_only_first_write_wins(self, tmp_path: Path, monkeypatch):
        monkeypatch.setattr(
            AsrMergeTaskManager,
            "get_state_file_path",
            staticmethod(lambda task_key: tmp_path / f"{task_key}.json"),
        )
        manager = AsrMergeTaskManager()
        task_key = "test_format_pinning"

        await manager.create_task(task_key=task_key, source_dir=".asr_recordings/test_format_pinning")
        task = await manager.get_task(task_key)
        assert task is not None
        assert task.audio_format is None

        # 首次写入生效
        assert await manager.set_audio_format(task_key, "ogg") is True
        task = await manager.get_task(task_key)
        assert task.audio_format == "ogg"

        # 再次写入不改写（钉住）
        assert await manager.set_audio_format(task_key, "wav") is True
        task = await manager.get_task(task_key)
        assert task.audio_format == "ogg"

        with pytest.raises(ValueError, match="Unsupported audio format"):
            await manager.set_audio_format(task_key, "mp3")

        # 状态文件落盘后可恢复格式
        manager._invalidate_cached_state(task_key)
        task = await manager.get_task(task_key)
        assert task.audio_format == "ogg"

    async def test_legacy_task_state_without_format_is_compatible(self, tmp_path: Path, monkeypatch):
        """历史状态文件无 audio_format 字段时反序列化为 None，并按 wav 解析 merged 文件名"""
        monkeypatch.setattr(
            AsrMergeTaskManager,
            "get_state_file_path",
            staticmethod(lambda task_key: tmp_path / f"{task_key}.json"),
        )
        manager = AsrMergeTaskManager()
        task_key = "test_legacy_format"

        await manager.create_task(task_key=task_key, source_dir=".asr_recordings/test_legacy_format")
        task = await manager.get_task(task_key)
        assert task.audio_format is None
        assert manager.get_merged_filename(task.audio_format) == "merged.wav"

    async def test_format_error_is_persisted_for_completion_guard(self, tmp_path: Path, monkeypatch):
        monkeypatch.setattr(
            AsrMergeTaskManager,
            "get_state_file_path",
            staticmethod(lambda task_key: tmp_path / f"{task_key}.json"),
        )
        manager = AsrMergeTaskManager()
        task_key = "test_format_conflict"
        await manager.create_task(task_key=task_key, source_dir=".asr_recordings/test_format_conflict")

        assert await manager.set_audio_format_error(task_key, "duplicate shard index 0") is True
        task = await manager.get_task(task_key)
        assert task.audio_format_error == "duplicate shard index 0"
