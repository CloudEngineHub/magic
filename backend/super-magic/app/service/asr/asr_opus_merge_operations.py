"""Opus finish 合并操作。

该模块只负责 Opus 在 finish 后的一次性全量合并，不参与 WAV 增量合并。
"""

import asyncio
import time
from pathlib import Path
from uuid import uuid4

from loguru import logger

from app.service.asr.asr_base import AsrServiceBase
from app.service.asr.asr_file_detector import AsrFileDetector
from app.service.asr.asr_local_proxy import AsrLocalWorkspaceProxy
from app.service.asr.asr_merge_task_manager import AsrMergeTaskManager
from app.service.asr.asr_time_config import asr_time_config


class OpusShardsNotReadyError(RuntimeError):
    """finish 已到达，但 Opus 分片集合尚未完整或尚未稳定。"""


class AsrOpusMergeOperations(AsrServiceBase):
    """Use original numbered Opus shards to build one committed staging file."""

    def __init__(self, file_detector: AsrFileDetector):
        self.file_detector = file_detector

    async def merge_opus_on_finish(
        self,
        task_key: str,
        source_dir: Path,
        all_files: list[tuple[int, Path]],
        expected_shard_count: int | None = None,
        merge_attempt_id: str | None = None,
    ) -> bool:
        started_at = time.monotonic()
        ordered_files = sorted(all_files, key=lambda item: item[0])
        indices = [index for index, _ in ordered_files]
        self._validate_shard_indices(ordered_files, expected_shard_count)

        proxy = AsrLocalWorkspaceProxy(task_key, source_dir, audio_format="opus")
        filenames = [path.name for _, path in ordered_files]
        try:
            local_paths = await asyncio.wait_for(
                proxy.ensure_remote_files_to_local_batch(
                    filenames,
                    required=True,
                    concurrency=asr_time_config.OPUS_SHARD_SYNC_CONCURRENCY,
                ),
                timeout=asr_time_config.OPUS_SHARD_SYNC_TIMEOUT,
            )
        except asyncio.TimeoutError as exc:
            raise RuntimeError("Opus 分片同步超时") from exc

        strict_local_paths = [path for path in local_paths if path is not None]
        if len(strict_local_paths) != len(ordered_files):
            raise OpusShardsNotReadyError(
                f"Opus 本地同步未完成: {len(strict_local_paths)}/{len(ordered_files)}"
            )

        await self._validate_local_shards(ordered_files, strict_local_paths)

        token = merge_attempt_id or uuid4().hex
        list_file = proxy.get_local_path(f".concat_list_opus_finish_{token}.txt")
        temp_output = proxy.get_local_path(f".concat_temp_opus_finish_{token}.opus")
        local_merged_path = proxy.get_local_path(proxy.merged_filename)

        try:
            await self._create_concat_list_file(strict_local_paths, list_file)
            cmd = self._build_ffmpeg_command(list_file, temp_output)
            logger.info(
                f"{self.LOG_PREFIX} 🎙️ task_key={task_key} Opus finish 全量合并开始: "
                f"attempt_id={token}, input_count={len(strict_local_paths)}, "
                f"index_range={indices[0]}-{indices[-1]}, codec=libopus, "
                f"sample_rate=16000, channels=1, bitrate={asr_time_config.OGG_REENCODE_BITRATE}"
            )
            await self._run_ffmpeg(cmd)

            valid_output, reason = await self.file_detector.validate_audio_file(temp_output, "opus")
            if not valid_output:
                raise RuntimeError(f"Opus finish 输出校验失败: {reason}")
            duration = await self._get_audio_duration(temp_output)
            if duration <= 0:
                raise RuntimeError("Opus finish 输出时长无效")

            await asyncio.to_thread(temp_output.replace, local_merged_path)
            upload_ok = await proxy.sync_local_to_remote_atomic(
                proxy.merged_filename,
                timeout=asr_time_config.OPUS_STAGING_UPLOAD_TIMEOUT,
            )
            if not upload_ok:
                raise RuntimeError("Opus finish staging 原子上传失败")

            merged_size = await asyncio.to_thread(lambda: local_merged_path.stat().st_size)
            metadata_ok = await proxy.save_metadata(
                indices[-1],
                extra={
                    "audio_format": "opus",
                    "merge_strategy": "opus_finish_full_rebuild_v1",
                    "merge_mode": "normalized_reencode",
                    "audio_signature": "opus:opus:16000:1:0",
                    "audio_signature_details": {
                        "format": "opus",
                        "codec": "opus",
                        "sample_rate": 16000,
                        "channels": 1,
                        "bits_per_sample": 0,
                    },
                    "merge_attempt_id": token,
                    "source_shard_count": len(indices),
                    "source_last_index": indices[-1],
                    "merged_duration": duration,
                    "merged_size": merged_size,
                },
                atomic=True,
            )
            if not metadata_ok:
                raise RuntimeError("Opus finish metadata 原子上传失败")

            progress_saved = await AsrMergeTaskManager.instance().update_progress(
                task_key, indices[-1], len(indices)
            )
            if not progress_saved:
                raise RuntimeError("Opus finish 进度写入失败")

            logger.info(
                f"{self.LOG_PREFIX} ✅ task_key={task_key} Opus finish 全量合并成功: "
                f"attempt_id={token}, size={merged_size}B, duration={duration}s, "
                f"elapsed={time.monotonic() - started_at:.2f}s"
            )
            return True
        finally:
            await asyncio.to_thread(list_file.unlink, missing_ok=True)
            await asyncio.to_thread(temp_output.unlink, missing_ok=True)

    @staticmethod
    def _validate_shard_indices(
        ordered_files: list[tuple[int, Path]], expected_shard_count: int | None
    ) -> None:
        if not ordered_files:
            raise OpusShardsNotReadyError("尚未扫描到 Opus 分片")

        indices = [index for index, _ in ordered_files]
        for index, path in ordered_files:
            if path.name != f"{index}.opus":
                raise ValueError(f"Opus 分片文件名非法: index={index}, filename={path.name}")

        if expected_shard_count is not None and expected_shard_count >= 0:
            expected_indices = list(range(expected_shard_count))
            if indices == expected_indices:
                return
            if len(indices) <= expected_shard_count and set(indices).issubset(expected_indices):
                missing = sorted(set(expected_indices) - set(indices))
                raise OpusShardsNotReadyError(f"Opus 分片尚未齐全，缺少索引: {missing[:20]}")
            raise ValueError(
                f"Opus 分片与声明数量冲突: declared={expected_shard_count}, indices={indices[:20]}"
            )

        expected_indices = list(range(indices[-1] + 1))
        if indices != expected_indices:
            missing = sorted(set(expected_indices) - set(indices))
            raise OpusShardsNotReadyError(f"Opus 分片索引不连续，缺少: {missing[:20]}")

    async def _validate_local_shards(
        self,
        ordered_files: list[tuple[int, Path]],
        local_paths: list[Path],
    ) -> None:
        semaphore = asyncio.Semaphore(asr_time_config.OPUS_SHARD_PROBE_CONCURRENCY)

        async def validate(index: int, local_path: Path) -> tuple[int, bool, str]:
            async with semaphore:
                valid, reason = await self.file_detector.validate_audio_file(local_path, "opus")
                return index, valid, reason

        results = await asyncio.gather(
            *(validate(index, local_path) for (index, _), local_path in zip(ordered_files, local_paths, strict=True))
        )
        for index, valid, reason in results:
            if not valid:
                raise OpusShardsNotReadyError(f"Opus 分片 {index} 尚不可用: {reason}")

    @staticmethod
    async def _create_concat_list_file(files: list[Path], list_file: Path) -> None:
        lines = [f"file '{path.absolute()}'" for path in files]
        await asyncio.to_thread(list_file.write_text, "\n".join(lines), encoding="utf-8")

    @staticmethod
    def _build_ffmpeg_command(list_file: Path, temp_output: Path) -> list[str]:
        return [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-map",
            "0:a:0",
            "-vn",
            "-c:a",
            "libopus",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-b:a",
            asr_time_config.OGG_REENCODE_BITRATE,
            "-application",
            "audio",
            str(temp_output),
        ]

    async def _run_ffmpeg(self, cmd: list[str]) -> None:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=asr_time_config.OPUS_FINISH_FFMPEG_TIMEOUT,
            )
        except asyncio.TimeoutError as exc:
            process.kill()
            raise RuntimeError("Opus finish FFmpeg 超时") from exc
        if process.returncode != 0:
            stderr_text = stderr.decode("utf-8", errors="replace")[-4000:]
            raise RuntimeError(f"Opus finish FFmpeg 失败: {stderr_text}")

    @staticmethod
    async def _get_audio_duration(audio_file: Path) -> float:
        process = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(audio_file),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, _ = await asyncio.wait_for(
                process.communicate(), timeout=asr_time_config.FFPROBE_TIMEOUT
            )
        except asyncio.TimeoutError:
            process.kill()
            return 0
        if process.returncode != 0 or not stdout:
            return 0
        try:
            return float(stdout.decode().strip())
        except ValueError:
            return 0
