"""FFmpeg 视频合成端口实现。"""

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from app.tools.canvas.production.ports.video_composition_port import (
    VideoCompositionPort,
    VideoCompositionRequest,
    VideoCompositionResult,
)


@dataclass(frozen=True)
class _SourceMediaInfo:
    """记录源视频的音频存在性和时长。"""

    has_audio: bool
    duration_seconds: float


class FfmpegVideoCompositionPort(VideoCompositionPort):
    """使用系统 FFmpeg 顺序拼接视频并通过 FFprobe 校验输出。"""

    async def compose(self, request: VideoCompositionRequest, interruption_event=None) -> VideoCompositionResult:
        """执行顺序拼接，并在没有外部音频时保留源视频音轨。"""
        if not request.video_paths:
            raise ValueError("At least one video input is required")
        source_media = (
            await self._probe_source_media(request.video_paths, interruption_event)
            if request.audio_policy == "preserve" and request.audio_path is None
            else None
        )
        command = self._build_command(request, source_media)
        await self._run(command, interruption_event)
        width, height, duration, has_audio = await self.inspect_video(request.output_path, interruption_event)
        return VideoCompositionResult(request.output_path, width, height, duration, has_audio)

    def _build_command(
        self,
        request: VideoCompositionRequest,
        source_media: Sequence[_SourceMediaInfo] | None = None,
    ) -> list[str]:
        """构建统一画面规格的 FFmpeg 命令，并选择最终音频来源。"""
        command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
        for video_path in request.video_paths:
            command.extend(["-i", str(video_path)])
        if request.audio_policy == "preserve" and request.audio_path is not None:
            command.extend(["-i", str(request.audio_path)])

        source_audio_enabled = bool(
            request.audio_policy == "preserve"
            and request.audio_path is None
            and source_media
            and any(item.has_audio for item in source_media)
        )
        audio_input_indices = list(range(len(request.video_paths)))
        if source_audio_enabled:
            assert source_media is not None
            next_input_index = len(request.video_paths)
            for index, media in enumerate(source_media):
                if media.has_audio:
                    continue
                audio_input_indices[index] = next_input_index
                command.extend([
                    "-f",
                    "lavfi",
                    "-t",
                    f"{max(media.duration_seconds, 0.001):.6f}",
                    "-i",
                    "anullsrc=r=48000:cl=stereo",
                ])
                next_input_index += 1

        filters: list[str] = []
        video_labels: list[str] = []
        for index in range(len(request.video_paths)):
            video_label = f"v{index}"
            filters.append(
                f"[{index}:v:0]"
                f"scale={request.width}:{request.height}:force_original_aspect_ratio=decrease,"
                f"pad={request.width}:{request.height}:(ow-iw)/2:(oh-ih)/2,"
                f"setsar=1,fps=30,format=yuv420p[{video_label}]"
            )
            video_labels.append(f"[{video_label}]")

        if source_audio_enabled:
            assert source_media is not None
            audio_labels: list[str] = []
            for index in range(len(request.video_paths)):
                audio_label = f"a{index}"
                audio_input = f"[{audio_input_indices[index]}:a:0]"
                filters.append(
                    f"{audio_input}aresample=48000,aformat=sample_fmts=fltp:"
                    f"sample_rates=48000:channel_layouts=stereo[{audio_label}]"
                )
                audio_labels.append(f"[{audio_label}]")
            concat_inputs = "".join(
                f"{video_labels[index]}{audio_labels[index]}"
                for index in range(len(video_labels))
            )
            filters.append(
                f"{concat_inputs}concat=n={len(video_labels)}:v=1:a=1[vout][aout]"
            )
        else:
            filters.append(
                f"{''.join(video_labels)}concat=n={len(video_labels)}:v=1:a=0[vout]"
            )

        command.extend(["-filter_complex", ";".join(filters), "-map", "[vout]"])
        if request.audio_policy == "preserve" and request.audio_path is not None:
            audio_input_index = len(request.video_paths)
            command.extend([
                "-map",
                f"{audio_input_index}:a:0",
                "-af",
                "aresample=async=1:first_pts=0,apad",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-shortest",
            ])
        elif source_audio_enabled:
            command.extend(["-map", "[aout]", "-c:a", "aac", "-b:a", "192k"])
        else:
            command.append("-an")
        command.extend([
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
            str(request.output_path),
        ])
        return command

    async def _probe_source_media(
        self,
        video_paths: Sequence[Path],
        interruption_event=None,
    ) -> list[_SourceMediaInfo]:
        """读取源视频的音频流和时长，供无外部音频时保留原音。"""
        results: list[_SourceMediaInfo] = []
        for video_path in video_paths:
            _, _, duration, has_audio = await self.inspect_video(video_path, interruption_event)
            results.append(_SourceMediaInfo(has_audio=has_audio, duration_seconds=duration))
        return results

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
