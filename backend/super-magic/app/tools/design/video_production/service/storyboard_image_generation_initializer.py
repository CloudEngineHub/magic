"""分镜图片生成的预占初始化实现。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence

from app.tools.design.domain.canvas_document import CanvasConnection, CanvasDocumentV3
from app.tools.design.domain.generation_initializer import (
    CanvasGenerationInitializationContext,
)
from app.tools.design.domain.services.canvas_id_generator import CanvasIdGenerator
from app.tools.design.domain.services.connection_service import ConnectionService
from app.tools.design.domain.services.content_service import ContentService
from app.tools.design.video_production.service.video_production_generation_initializer import (
    VideoProductionGenerationInitializer,
)


@dataclass(frozen=True)
class PreparedStoryboardShot:
    """生成开始前确认的分镜 Content 与镜头快照。"""

    storyboard_element_id: str
    storyboard_content_id: str
    shot_id: str


class StoryboardImageGenerationInitializer(VideoProductionGenerationInitializer):
    """在图片生成开始前绑定分镜镜头和 processing 占位图片。"""

    def __init__(
        self,
        storyboard_shots_by_task: Sequence[PreparedStoryboardShot],
    ) -> None:
        """保存分镜镜头快照和按任务归集的关系摘要。"""
        self._storyboard_shots_by_task = tuple(storyboard_shots_by_task)
        self._connections_by_task: dict[int, list[dict[str, str]]] = {}

    @staticmethod
    def prepare_storyboard_shots(
        canvas: CanvasDocumentV3,
        storyboard_element_id: str,
        shot_ids: Sequence[str],
    ) -> list[PreparedStoryboardShot]:
        """校验当前活动分镜 Content，并为每个图片任务生成稳定镜头快照。"""
        storyboard = canvas.get_element(storyboard_element_id)
        if storyboard is None:
            raise ValueError(f"Storyboard Element does not exist: {storyboard_element_id}")
        if storyboard.type != "storyboard":
            raise ValueError(f"Element is not a storyboard: {storyboard_element_id}")
        content = storyboard.get_active_content()
        if content is None:
            raise ValueError(f"Storyboard has no active Content: {storyboard_element_id}")
        shots = content.fields.get("shots")
        if not isinstance(shots, list):
            raise ValueError(f"Storyboard shots are unavailable: {storyboard_element_id}")

        available_shot_ids = {
            shot.get("id")
            for shot in shots
            if isinstance(shot, dict) and isinstance(shot.get("id"), str)
        }
        missing_shot_ids = [shot_id for shot_id in shot_ids if shot_id not in available_shot_ids]
        if missing_shot_ids:
            raise ValueError(
                "Storyboard shot does not exist: " + ", ".join(missing_shot_ids)
            )
        return [
            PreparedStoryboardShot(
                storyboard_element_id=storyboard_element_id,
                storyboard_content_id=content.content_id,
                shot_id=shot_id,
            )
            for shot_id in shot_ids
        ]

    async def apply_batch(
        self,
        config: Any,
        contexts: Sequence[CanvasGenerationInitializationContext],
    ) -> dict[int, dict[str, Any]]:
        """批量绑定镜头输出关系，再按分镜阶段统一布局新增图片。"""
        results: dict[int, dict[str, Any]] = {}
        for context in contexts:
            binding = self._storyboard_shots_by_task[context.task_index]
            connection = self._bind_storyboard_output(
                config.canvas,
                binding,
                context.element_id,
            )
            self._connections_by_task[context.task_index] = [connection]
            results[context.task_index] = {
                "connections": [connection],
                "storyboard_element_id": binding.storyboard_element_id,
                "storyboard_content_id": binding.storyboard_content_id,
                "shot_id": binding.shot_id,
            }
        await super().apply_batch(config, contexts)
        return results

    def get_connections(self) -> list[dict[str, str]]:
        """按任务顺序返回已经随 processing 状态提交的分镜关系。"""
        return [
            connection
            for task_index in sorted(self._connections_by_task)
            for connection in self._connections_by_task[task_index]
        ]

    def discard(self, task_indices: Sequence[int]) -> None:
        """丢弃事务提交失败所对应的分镜关系摘要。"""
        for task_index in task_indices:
            self._connections_by_task.pop(task_index, None)

    @staticmethod
    def _bind_storyboard_output(
        canvas: CanvasDocumentV3,
        binding: PreparedStoryboardShot,
        image_element_id: str,
    ) -> dict[str, str]:
        """把 processing 图片写入确定镜头，并同步分镜拥有的锁定关系。"""
        storyboard = canvas.get_element(binding.storyboard_element_id)
        if storyboard is None or storyboard.type != "storyboard":
            raise ValueError(
                f"Storyboard Element no longer exists: {binding.storyboard_element_id}"
            )
        if storyboard.active_content_id != binding.storyboard_content_id:
            raise ValueError(
                f"Storyboard active Content changed before generation: {binding.storyboard_element_id}"
            )
        content = storyboard.get_content(binding.storyboard_content_id)
        if content is None:
            raise ValueError(
                f"Storyboard Content no longer exists: {binding.storyboard_content_id}"
            )
        image = canvas.get_element(image_element_id)
        if image is None or image.type != "image":
            raise ValueError(f"Storyboard output must be an Image Element: {image_element_id}")

        shots = content.fields.get("shots")
        if not isinstance(shots, list):
            raise ValueError(f"Storyboard shots are unavailable: {binding.storyboard_element_id}")
        updated_shots: list[dict[str, Any]] = []
        matched = False
        for raw_shot in shots:
            if not isinstance(raw_shot, dict):
                raise ValueError("Storyboard shot must be an object")
            shot = dict(raw_shot)
            if shot.get("id") == binding.shot_id:
                shot["outputImageElementId"] = image_element_id
                matched = True
            updated_shots.append(shot)
        if not matched:
            raise ValueError(f"Storyboard shot no longer exists: {binding.shot_id}")
        ContentService.update_content(
            storyboard,
            binding.storyboard_content_id,
            {"shots": updated_shots},
        )

        desired_connections: list[CanvasConnection] = []
        for shot in updated_shots:
            output_element_id = shot.get("outputImageElementId")
            if not isinstance(output_element_id, str):
                continue
            output = canvas.get_element(output_element_id)
            if output is None or output.type != "image":
                raise ValueError(
                    f"Storyboard output must reference an Image Element: {output_element_id}"
                )
            desired_connections.append(
                CanvasConnection(
                    id=CanvasIdGenerator.generate_connection_id(),
                    source_element_id=storyboard.id,
                    target_element_id=output_element_id,
                    locked=True,
                )
            )
        connections = ConnectionService.reconcile_locked_connections(
            canvas,
            desired_connections,
            owner_element_id=storyboard.id,
            direction="outgoing",
            counterpart_types={"image"},
        )
        connection = next(
            item for item in connections if item.target_element_id == image_element_id
        )
        return {
            "connection_id": connection.id,
            "source_element_id": connection.source_element_id,
            "target_element_id": connection.target_element_id,
        }
