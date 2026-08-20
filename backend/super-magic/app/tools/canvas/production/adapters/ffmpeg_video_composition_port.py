"""FFmpeg 视频合成端口实现。"""

import asyncio
import json
from pathlib import Path

from app.tools.canvas.production.ports.video_composition_port import (
    VideoCompositionPort,
    VideoCompositionRequest,
    VideoCompositionResult,
)
from app.utils.async_file_utils import async_unlink, async_write_text


class FfmpegVideoCompositionPort(VideoCompositionPort):
    """使用系统 FFmpeg 顺序拼接视频并通过 FFprobe 校验输出。"""

    async def compose(self, request: VideoCompositionRequest, interruption_event=None) -> VideoCompositionResult:
        """执行基础顺序拼接，失败时不保留半成品。"""
        if not request.video_paths:
            raise ValueError("At least one video input is required")
        concat_file = request.output_path.with_suffix(".concat.txt")
        lines = []
        for path in request.video_paths:
            lines.append("file " + repr(path.as_posix()))
        await async_write_text(concat_file, "\n".join(lines), encoding="utf-8")
        command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(concat_file)]
        if request.audio_path is not None:
            command.extend(["-i", str(request.audio_path), "-map", "0:v:0", "-map", "1:a:0", "-shortest"])
        command.extend(["-vf", f"scale={request.width}:{request.height}:force_original_aspect_ratio=decrease,pad={request.width}:{request.height}:(ow-iw)/2:(oh-ih)/2", "-c:v", "libx264", "-pix_fmt", "yuv420p"])
        command.extend(["-c:a", "aac"] if request.audio_path is not None else ["-an"])
        command.append(str(request.output_path))
        try:
            await self._run(command, interruption_event)
            width, height, duration, has_audio = await self.inspect_video(request.output_path, interruption_event)
            return VideoCompositionResult(request.output_path, width, height, duration, has_audio)
        finally:
            await async_unlink(concat_file)

    async def inspect_video(self, video_path: Path, interruption_event=None) -> tuple[int, int, float, bool]:
        """使用 FFprobe 读取媒体事实。"""
        stdout = await self._run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(video_path)], interruption_event, capture_stdout=True)
        payload = json.loads(stdout)
        streams = payload.get("streams") or []
        video = next((item for item in streams if item.get("codec_type") == "video"), None)
        if not isinstance(video, dict):
            raise ValueError("Video stream is missing")
        return int(video.get("width") or 0), int(video.get("height") or 0), float((payload.get("format") or {}).get("duration") or 0), any(item.get("codec_type") == "audio" for item in streams)

    async def _run(self, command: list[str], interruption_event, capture_stdout: bool = False) -> str:
        """运行媒体命令并处理用户中断。"""
        process = await asyncio.create_subprocess_exec(*command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        communicate_task = asyncio.create_task(process.communicate())
        interrupt_task = asyncio.create_task(interruption_event.wait()) if interruption_event is not None else None
        try:
            if interrupt_task is None:
                stdout, stderr = await communicate_task
            else:
                done, _ = await asyncio.wait(
                    {communicate_task, interrupt_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if interrupt_task in done and interruption_event.is_set():
                    process.terminate()
                    await communicate_task
                    raise asyncio.CancelledError
                stdout, stderr = await communicate_task
        finally:
            if interrupt_task is not None:
                interrupt_task.cancel()
        if process.returncode != 0:
            raise RuntimeError(stderr.decode("utf-8", errors="replace")[-1000:])
        return stdout.decode("utf-8", errors="replace") if capture_stdout else ""
