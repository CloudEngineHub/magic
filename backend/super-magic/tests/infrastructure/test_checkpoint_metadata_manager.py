from pathlib import Path

from app.core.entity.checkpoint import CheckpointInfo, VirtualCheckpoint
from app.infrastructure.checkpoint.metadata_manager import CheckpointMetadataManager


class FakeCheckpointStorage:
    """用于验证 checkpoint 元数据管理器异步调用行为的假存储。"""

    def __init__(self, exists: bool, base_dir: Path):
        """初始化假存储的存在状态与测试目录。"""

        self.exists = exists
        self.base_dir = base_dir
        self.exists_calls: list[str] = []
        self.create_calls: list[str] = []

    async def checkpoint_exists(self, checkpoint_id: str) -> bool:
        """记录存在性检查调用，并返回预设结果。"""

        self.exists_calls.append(checkpoint_id)
        return self.exists

    async def create_checkpoint_directory(self, checkpoint_id: str) -> str:
        """记录目录创建调用，并创建测试目录。"""

        self.create_calls.append(checkpoint_id)
        checkpoint_dir = self.base_dir / checkpoint_id
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        return str(checkpoint_dir)

    def get_checkpoint_info_file_path(self, checkpoint_id: str) -> Path:
        """返回 checkpoint 信息文件路径。"""

        return self.base_dir / checkpoint_id / "checkpoint_info.json"


async def test_ensure_initial_checkpoint_creates_missing_initial(tmp_path: Path, monkeypatch):
    """初始 checkpoint 不存在时，应 await 检查、创建目录并保存元信息。"""

    manager = CheckpointMetadataManager()
    storage = FakeCheckpointStorage(exists=False, base_dir=tmp_path)
    saved_infos: list[CheckpointInfo] = []

    async def save_checkpoint_info(checkpoint_info: CheckpointInfo) -> bool:
        """记录保存的 checkpoint 元信息。"""

        saved_infos.append(checkpoint_info)
        return True

    manager.storage = storage
    monkeypatch.setattr(manager, "save_checkpoint_info", save_checkpoint_info)

    assert await manager.ensure_initial_checkpoint_created() is True
    assert storage.exists_calls == [VirtualCheckpoint.INITIAL]
    assert storage.create_calls == [VirtualCheckpoint.INITIAL]
    assert [info.checkpoint_id for info in saved_infos] == [VirtualCheckpoint.INITIAL]


async def test_ensure_initial_checkpoint_skips_existing_initial(tmp_path: Path, monkeypatch):
    """初始 checkpoint 已存在时，应只 await 检查而不重复创建。"""

    manager = CheckpointMetadataManager()
    storage = FakeCheckpointStorage(exists=True, base_dir=tmp_path)
    saved_infos: list[CheckpointInfo] = []

    async def save_checkpoint_info(checkpoint_info: CheckpointInfo) -> bool:
        """记录不应被调用的保存请求。"""

        saved_infos.append(checkpoint_info)
        return True

    manager.storage = storage
    monkeypatch.setattr(manager, "save_checkpoint_info", save_checkpoint_info)

    assert await manager.ensure_initial_checkpoint_created() is True
    assert storage.exists_calls == [VirtualCheckpoint.INITIAL]
    assert storage.create_calls == []
    assert saved_infos == []
