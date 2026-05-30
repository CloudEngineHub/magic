"""Canvas Manager V2 - 2.0.0 格式画布管理器

承载 v2 格式的两件事：canvas 压缩 + 重字段拆分到 element-details.json。

继承 V1 CanvasManager，复用全部查询/统计/增删改/辅助方法，只覆盖写入接缝
`_persist`：把重字段拆到 sidecar，主文件写压缩格式。增、改、删三种情况都由
这一个接缝统一处理，无需单独覆盖 delete_element / delete_elements。
"""

from typing import Callable, Dict, Optional

from agentlang.logger import get_logger
from app.tools.design.manager.canvas_manager import CanvasManager
from app.tools.design.utils.element_details_store import (
    extract_element_details,
    merge_element_details,
    prune_orphan_details,
    read_element_details,
    strip_heavy_fields,
    write_element_details,
)
from app.tools.design.utils.magic_project_design_parser import (
    MAGIC_PROJECT_VERSION_V2,
    MagicProjectConfig,
    write_magic_project_js_v2,
)

logger = get_logger(__name__)


class CanvasManagerV2(CanvasManager):
    """V2 画布管理器：压缩主文件 + element-details.json 拆分。"""

    async def _persist(
        self,
        config: MagicProjectConfig,
        verifier: Optional[Callable[[MagicProjectConfig], bool]],
    ) -> None:
        """在写事务的项目锁内落盘：先写 sidecar，再写压缩主文件。

        注意：verifier 只能断言主文件中的轻字段。重字段在写主文件前已被 strip，
        校验器不得断言 generateImageRequest 等已拆出的字段。
        """
        # 1. 提取本轮内存中带的重字段，合并进已有 sidecar，并清掉已删除元素的孤儿条目
        new_details = extract_element_details(config)
        existing = await read_element_details(self.project_path)
        merged = merge_element_details(existing, new_details)
        merged = prune_orphan_details(merged, config)

        # 2. 从内存 config 上移除重字段，主文件只保留轻字段
        strip_heavy_fields(config)

        # 3. 固定信封 version 为 2.0.0，确保 v2 文件的格式契约一致
        config.version = MAGIC_PROJECT_VERSION_V2

        # 4. 先写 sidecar（孤儿安全），再写压缩主文件 + 写后重读校验
        if merged != existing:
            await write_element_details(self.project_path, merged)
        await write_magic_project_js_v2(
            self.project_path,
            config,
            content_verifier=verifier,
        )

    async def read_element_details(self) -> Dict:
        """读取当前项目的 element-details（供详情/再生成读取重字段）。"""
        return await read_element_details(self.project_path)
