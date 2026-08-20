# Video generation reference

本 reference 用于每一次生成视频或恢复视频任务。它不暴露底层驱动或模型实现名称，也不扩大父 Skill 的重试边界。

## 生成流程

1. 查询已有参考 Element 的详情，复用实际媒体路径和精确 ID。
2. 新逻辑视频使用 `add_canvas_elements`；已有逻辑视频的新候选使用 `add_canvas_contents`。
3. `source=generated`、`content_type=video` 必须提供 `prompt`。
4. 如果结果包含 `generation_task_id`，立即调用 `wait_canvas_generation`。
5. `pending`、`processing` 和等待超时都不是失败；超时后使用同一任务 ID继续查询，不能重复发起任务。
6. 只有状态为 `failed` 且用户明确同意时才使用 `retry_canvas_content_generation`。

## 参考输入

根据用户需求使用 `reference_image_paths`、`reference_video_paths`、`reference_audio_paths`、`frame_start_path` 和 `frame_end_path`。这些路径只控制生成输入，只有明确的业务前驱才建立 Canvas Connection。

## 重试与版本

- 同一个 Content 最多重试两次，禁止自动循环。
- 失败重试保留原 Element ID 和 Content ID。
- 新方向或新候选使用 `add_canvas_contents`，不要创建重复逻辑 Element。
- 完成候选必须先向用户展示，用户确认后才调用 `select_canvas_main_content`。
