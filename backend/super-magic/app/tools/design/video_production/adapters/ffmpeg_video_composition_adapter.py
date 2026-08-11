"""使用 FFmpeg 完成首版基础 MP4 合成。"""

import asyncio
import errno
import json
import tempfile
from pathlib import Path
from typing import Any, Optional, Sequence
from uuid import uuid4

from app.tools.design.video_production.ports.video_composition_port import (
    VideoCompositionRequest,
    VideoCompositionResult,
)
from app.utils.async_file_utils import (
    async_copy2,
    async_exists,
    async_mkdir,
    async_replace,
    async_stat,
    async_unlink,
    async_which,
)


class VideoCompositionError(RuntimeError):
    """表示基础视频合成或输出校验失败。"""


class FfmpegVideoCompositionAdapter:
    """统一规格后顺序拼接视频，并输出 H.264/AAC MP4。"""

    async def compose(
        self,
        request: VideoCompositionRequest,
        *,
        interruption_event: Optional[asyncio.Event] = None,
    ) -> VideoCompositionResult:
        """在系统临时目录执行 FFmpeg，校验后移动到最终路径。"""
        await self._ensure_binaries()
        if not request.video_paths:
            raise VideoCompositionError("At least one video input is required")
        temp_dir = Path(tempfile.gettempdir()) / "super-magic" / "video-composition"
        await async_mkdir(temp_dir, parents=True, exist_ok=True)
        temporary_output = temp_dir / f"composition-{uuid4().hex}.mp4"
        await async_mkdir(request.output_path.parent, parents=True, exist_ok=True)
        try:
            command = self._build_command(request, temporary_output)
            await self._run_process(command, interruption_event=interruption_event)
            probe = await self._probe_output(temporary_output, interruption_event=interruption_event)
            self._validate_probe(
                probe,
                expected_width=request.width,
                expected_height=request.height,
                expected_audio=request.audio_path is not None,
            )
            await self._move_output(temporary_output, request.output_path)
            persisted_probe = await self._probe_output(
                request.output_path,
                interruption_event=interruption_event,
            )
            duration_seconds = self._duration_seconds(persisted_probe)
            return VideoCompositionResult(
                output_path=request.output_path,
                width=request.width,
                height=request.height,
                duration_seconds=duration_seconds,
                has_audio=request.audio_path is not None,
            )
        finally:
            await async_unlink(temporary_output)

    async def _ensure_binaries(self) -> None:
        """确认运行环境同时具备 FFmpeg 和 FFprobe。"""
        if await async_which("ffmpeg") is None or await async_which("ffprobe") is None:
            raise VideoCompositionError("FFmpeg and FFprobe are required for MP4 composition")

    def _build_command(
        self,
        request: VideoCompositionRequest,
        temporary_output: Path,
    ) -> list[str]:
        """构建不包含转场、裁剪或多音轨的固定合成命令。"""
        command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
        for video_path in request.video_paths:
            command.extend(["-i", str(video_path)])
        if request.audio_path is not None:
            command.extend(["-i", str(request.audio_path)])

        filters = []
        video_labels = []
        for index in range(len(request.video_paths)):
            output_label = f"v{index}"
            filters.append(
                f"[{index}:v:0]"
                f"scale={request.width}:{request.height}:force_original_aspect_ratio=decrease,"
                f"pad={request.width}:{request.height}:(ow-iw)/2:(oh-ih)/2,"
                "setsar=1,fps=30,format=yuv420p"
                f"[{output_label}]"
            )
            video_labels.append(f"[{output_label}]")
        filters.append(
            f"{''.join(video_labels)}concat=n={len(video_labels)}:v=1:a=0[vout]"
        )
        command.extend(["-filter_complex", ";".join(filters), "-map", "[vout]"])

        if request.audio_path is not None:
            audio_input_index = len(request.video_paths)
            command.extend(
                [
                    "-map",
                    f"{audio_input_index}:a:0",
                    "-af",
                    "aresample=async=1:first_pts=0,apad",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-shortest",
                ]
            )
        else:
            command.append("-an")
        command.extend(
            [
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(temporary_output),
            ]
        )
        return command

    async def _probe_output(
        self,
        output_path: Path,
        *,
        interruption_event: Optional[asyncio.Event],
    ) -> dict[str, Any]:
        """使用 FFprobe 读取最终媒体流和时长。"""
        stdout = await self._run_process(
            [
                "ffprobe",
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_streams",
                "-show_format",
                str(output_path),
            ],
            interruption_event=interruption_event,
            capture_stdout=True,
        )
        try:
            parsed = json.loads(stdout)
        except json.JSONDecodeError as error:
            raise VideoCompositionError("FFprobe returned invalid output metadata") from error
        if not isinstance(parsed, dict):
            raise VideoCompositionError("FFprobe output metadata must be an object")
        return parsed

    async def _run_process(
        self,
        command: Sequence[str],
        *,
        interruption_event: Optional[asyncio.Event],
        capture_stdout: bool = False,
    ) -> str:
        """执行媒体子进程，并在用户中断时终止进程和抛出取消异常。"""
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        communicate_task = asyncio.create_task(process.communicate())
        interrupt_task = (
            asyncio.create_task(interruption_event.wait())
            if interruption_event is not None
            else None
        )
        try:
            wait_tasks = [communicate_task]
            if interrupt_task is not None:
                wait_tasks.append(interrupt_task)
            done, _ = await asyncio.wait(wait_tasks, return_when=asyncio.FIRST_COMPLETED)
            if interrupt_task is not None and interrupt_task in done:
                await self._terminate_process(process)
                communicate_task.cancel()
                await asyncio.gather(communicate_task, return_exceptions=True)
                raise asyncio.CancelledError
            stdout_bytes, stderr_bytes = await communicate_task
            if process.returncode != 0:
                summary = self._sanitize_stderr(stderr_bytes.decode("utf-8", errors="replace"))
                raise VideoCompositionError(f"Media process failed: {summary}")
            return stdout_bytes.decode("utf-8", errors="replace") if capture_stdout else ""
        except asyncio.CancelledError:
            await self._terminate_process(process)
            raise
        finally:
            if interrupt_task is not None:
                interrupt_task.cancel()
                await asyncio.gather(interrupt_task, return_exceptions=True)
            if not communicate_task.done():
                communicate_task.cancel()
                await asyncio.gather(communicate_task, return_exceptions=True)

    @staticmethod
    async def _terminate_process(process: asyncio.subprocess.Process) -> None:
        """先温和终止媒体进程，超时后强制结束。"""
        if process.returncode is not None:
            return
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=3)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()

    @staticmethod
    def _validate_probe(
        probe: dict[str, Any],
        *,
        expected_width: int,
        expected_height: int,
        expected_audio: bool,
    ) -> None:
        """校验输出包含预期规格的视频流和可选音频流。"""
        streams = probe.get("streams")
        if not isinstance(streams, list):
            raise VideoCompositionError("Composed MP4 has no readable media streams")
        video_stream = next(
            (stream for stream in streams if stream.get("codec_type") == "video"),
            None,
        )
        if video_stream is None:
            raise VideoCompositionError("Composed MP4 has no video stream")
        if video_stream.get("codec_name") != "h264":
            raise VideoCompositionError("Composed MP4 video codec is not H.264")
        if video_stream.get("pix_fmt") != "yuv420p":
            raise VideoCompositionError("Composed MP4 pixel format is not yuv420p")
        if video_stream.get("width") != expected_width or video_stream.get("height") != expected_height:
            raise VideoCompositionError("Composed MP4 resolution does not match the requested output")
        has_audio = any(stream.get("codec_type") == "audio" for stream in streams)
        if has_audio != expected_audio:
            raise VideoCompositionError("Composed MP4 audio stream does not match the requested output")
        if FfmpegVideoCompositionAdapter._duration_seconds(probe) <= 0:
            raise VideoCompositionError("Composed MP4 duration is invalid")

    @staticmethod
    def _duration_seconds(probe: dict[str, Any]) -> float:
        """从 FFprobe format 中读取正数时长。"""
        try:
            return float((probe.get("format") or {}).get("duration") or 0)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    async def _move_output(source_path: Path, target_path: Path) -> None:
        """优先原子移动输出，跨文件系统时复制后校验大小。"""
        try:
            await async_replace(source_path, target_path)
        except OSError as error:
            if error.errno != errno.EXDEV:
                raise
            await async_copy2(source_path, target_path)
        if not await async_exists(target_path) or (await async_stat(target_path)).st_size <= 0:
            raise VideoCompositionError("Composed MP4 was not persisted successfully")

    @staticmethod
    def _sanitize_stderr(stderr: str) -> str:
        """压缩 FFmpeg 错误，只保留单行可诊断摘要。"""
        lines = [line.strip() for line in stderr.splitlines() if line.strip()]
        if not lines:
            return "unknown FFmpeg error"
        return lines[-1][:500]
