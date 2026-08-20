# Video production reference

本 reference 用于多镜头视频制作。它只描述 Canvas Manager 当前真实可用的编排能力，不声称最终 MP4 已经合成。

## 生产阶段

1. 初始化或恢复同一个 `project_path`，查询当前素材。
2. 先确认方向、画幅、镜头数量、时长和素材使用方式。
3. 用 `add_canvas_elements` 创建初始化图片、Storyboard 或其他锚点。
4. 用 `add_canvas_contents` 为已有 Storyboard 或镜头 Element 追加修订候选。
5. 为每个镜头创建首帧图片，再创建对应视频 Element；异步任务统一使用 `wait_canvas_generation`。
6. 用 `add_canvas_connections` 表示直接业务依赖，用 `layout_canvas_elements` 的 `dependency_flow` 整理生产流程。
7. 用 `video-edit` Content 保存确认后的 `videoSequence` 和 `output` 配置。当前主协议不提供独立音频序列字段。

## 依赖边界

直接首帧是镜头视频的业务前驱；仅作为提示词参考的图片、视频或音频不自动建立 Connection。修改一个首帧后，只重新生成真正依赖它的镜头。

## Final composition

After the Video Edit Content and its direct input Connections are confirmed, call `compose_canvas_video` to synchronously create the final MP4 Content. The tool supports an ordered `videoSequence` and zero or one final `audioSequence` item. Verify the returned result Element with `query_canvas_element_details`.

If composition fails, keep the failed Content for diagnosis and preserve the previous active and main Content pointers. Correct the inputs or output configuration before asking the user whether to compose again.
