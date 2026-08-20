# Asset reconciliation reference

只有用户主动提到 Canvas 与本地 `images` 或 `videos` 目录存在差异，或明确要求从本地素材恢复时，才加载本 reference。普通生成失败、单个文件不存在或模糊的“修复画布”请求都不能触发它。

## 受控流程

1. 先只读核对 Canvas 详情和用户明确指出的本地素材范围。
2. 向用户说明明确缺失、已存在、路径冲突和无法判断的项目。
3. 只有用户明确要求修复后，才对无歧义且未注册的素材使用 `add_canvas_elements`，`source=imported`，并传入真实工作区相对 `asset_path`。
4. 不删除、不覆盖、不自动处理同名冲突，不修改已有 Content。
5. 导入后查询新增 Element，确认实际状态。

素材恢复不是独立的 dry-run/confirm 工具；模型必须把只读核对、用户确认和明确导入分成不同阶段。
