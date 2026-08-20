# Video storyboard reference

本 reference 只在 Storyboard、镜头顺序、首帧或镜头依赖工作中加载。

## Storyboard Content

使用 `add_canvas_elements` 创建 `element_type=storyboard` 的 Element，Content 使用 `source=user`、`content_type=storyboard`、`generationConfig` 和 `shots`。后续修订使用 `add_canvas_contents`，不要覆盖已确认的 Storyboard Content。

每个 shot 应包含稳定的镜头标识、时长和清晰的镜头描述。镜头顺序由 `shots` 顺序表达；镜头之间的业务依赖由独立 Connection 表达。

## 首帧和视频

确认 Storyboard 后，为每个需要的镜头创建首帧图片，再用首帧 Element 作为对应镜头视频的直接来源。生成返回任务 ID 时调用 `wait_canvas_generation`。首帧或镜头失败时，只处理受影响 Content，并遵守同一 Content 最多两次重试。

## 布局和确认

使用 `dependency_flow` 布局生产链；不要手算坐标。Storyboard、首帧、镜头视频和 Video Edit 的关键节点都应在用户确认后进入下一阶段。
