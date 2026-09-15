"""通用沙箱任务运行时。"""

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable

from loguru import logger

from app.path_manager import PathManager
from app.service.sandbox_task.models import SandboxTask, SandboxTaskStatus


TaskWorker = Callable[[SandboxTask, Callable[[SandboxTaskStatus], Awaitable[None]]], Awaitable[dict[str, Any]]]


class SandboxTaskManager:
    """提供任务创建、状态持久化和后台执行能力。"""

    _instance: "SandboxTaskManager | None" = None

    def __init__(self) -> None:
        """初始化任务管理器。"""
        self._tasks: dict[str, SandboxTask] = {}
        self._workers: dict[str, asyncio.Task[Any]] = {}
        self._lock = asyncio.Lock()

    @classmethod
    def instance(cls) -> "SandboxTaskManager":
        """获取进程级任务管理器。"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def state_dir(self) -> Path:
        """获取任务状态文件目录。"""
        return PathManager.get_workspace_dir() / ".magic" / "sandbox-tasks"

    def state_path(self, task_id: str) -> Path:
        """获取指定任务状态文件路径。"""
        return self.state_dir / f"{task_id}.json"

    async def create_or_get(
        self,
        task_id: str,
        capability: str,
        project_path: str,
        payload: dict[str, Any],
        worker: TaskWorker,
    ) -> SandboxTask:
        """幂等创建任务并安排后台执行。"""
        async with self._lock:
            task = self._tasks.get(task_id) or await self._load(task_id)
            if task is None:
                task = SandboxTask(
                    task_id=task_id,
                    capability=capability,
                    project_path=project_path,
                    payload=payload,
                )
                self._tasks[task_id] = task
                await self._persist(task)
            elif task.capability != capability or task.project_path != project_path:
                raise ValueError(f"Task ID already belongs to another task: {task_id}")
            elif task.payload != payload and task.status not in {
                SandboxTaskStatus.FAILED,
                SandboxTaskStatus.CANCELLED,
            }:
                raise ValueError(f"Task ID already belongs to another task: {task_id}")

            if task.status in {SandboxTaskStatus.FAILED, SandboxTaskStatus.CANCELLED}:
                task.payload = payload
                task.status = SandboxTaskStatus.QUEUED
                task.output = None
                task.error_message = None
                task.updated_at = datetime.now()
                self._tasks[task_id] = task
                await self._persist(task)

            if task.status != SandboxTaskStatus.COMPLETED and task_id not in self._workers:
                self._workers[task_id] = asyncio.create_task(self._run(task, worker))
            return task

    async def get(self, task_id: str) -> SandboxTask | None:
        """读取任务当前状态。"""
        async with self._lock:
            task = self._tasks.get(task_id)
            if task is not None:
                return task.model_copy(deep=True)
            task = await self._load(task_id)
            if task is not None:
                self._tasks[task_id] = task
                return task.model_copy(deep=True)
            return None

    async def cancel(self, task_id: str) -> SandboxTask | None:
        """取消尚未完成的任务。"""
        async with self._lock:
            task = self._tasks.get(task_id) or await self._load(task_id)
            if task is None:
                return None
            if task.status in {SandboxTaskStatus.COMPLETED, SandboxTaskStatus.FAILED}:
                return task
            task.status = SandboxTaskStatus.CANCELLED
            task.updated_at = datetime.now()
            await self._persist(task)
            worker = self._workers.get(task_id)
            if worker is not None:
                worker.cancel()
            return task.model_copy(deep=True)

    async def update_output(self, task_id: str, values: dict[str, Any]) -> None:
        """保存任务中间产物，支持服务重启后继续同一 Canvas Content。"""
        async with self._lock:
            task = self._tasks.get(task_id) or await self._load(task_id)
            if task is None:
                return
            task.output = {**(task.output or {}), **values}
            task.updated_at = datetime.now()
            self._tasks[task_id] = task
            await self._persist(task)

    async def recover(self, worker: TaskWorker) -> int:
        """服务启动时恢复未完成任务。"""
        recovered = 0
        if not self.state_dir.exists():
            return recovered
        for path in self.state_dir.glob("*.json"):
            task = await self._load(path.stem)
            if task is None or task.status in {
                SandboxTaskStatus.COMPLETED,
                SandboxTaskStatus.FAILED,
                SandboxTaskStatus.CANCELLED,
            }:
                continue
            self._tasks[task.task_id] = task
            if task.task_id not in self._workers:
                self._workers[task.task_id] = asyncio.create_task(self._run(task, worker))
                recovered += 1
        return recovered

    async def _run(self, task: SandboxTask, worker: TaskWorker) -> None:
        """执行任务并将异常转换为失败状态。"""
        try:
            output = await worker(task, lambda status: self._update_status(task.task_id, status))
            await self._update(task.task_id, status=SandboxTaskStatus.COMPLETED, output=output)
        except asyncio.CancelledError:
            await self._update(task.task_id, status=SandboxTaskStatus.CANCELLED)
        except Exception as error:
            logger.exception("Sandbox task failed: {}", task.task_id)
            await self._update(
                task.task_id,
                status=SandboxTaskStatus.FAILED,
                error_message=str(error)[:2000],
            )
        finally:
            self._workers.pop(task.task_id, None)

    async def _update_status(self, task_id: str, status: SandboxTaskStatus) -> None:
        """更新任务状态。"""
        await self._update(task_id, status=status)

    async def _update(
        self,
        task_id: str,
        *,
        status: SandboxTaskStatus | None = None,
        output: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> None:
        """原子更新任务快照并落盘。"""
        async with self._lock:
            task = self._tasks.get(task_id) or await self._load(task_id)
            if task is None:
                return
            if status is not None:
                task.status = status
            if output is not None:
                task.output = output
            if error_message is not None:
                task.error_message = error_message
            task.updated_at = datetime.now()
            self._tasks[task_id] = task
            await self._persist(task)

    async def _load(self, task_id: str) -> SandboxTask | None:
        """从状态文件读取任务。"""
        path = self.state_path(task_id)
        if not path.exists():
            return None
        try:
            return SandboxTask.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, ValueError, json.JSONDecodeError):
            logger.warning("Unable to read sandbox task state: {}", path)
            return None

    async def _persist(self, task: SandboxTask) -> None:
        """以临时文件替换方式持久化任务。"""
        await asyncio.to_thread(self._persist_sync, task)

    def _persist_sync(self, task: SandboxTask) -> None:
        """同步执行原子状态写入。"""
        path = self.state_path(task.task_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(f".{task.task_id}.tmp")
        temporary.write_text(task.model_dump_json(indent=2), encoding="utf-8")
        temporary.replace(path)
