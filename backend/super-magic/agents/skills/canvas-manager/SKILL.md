---
name: canvas-manager
description: Unified Canvas design and video-production skill for managing Elements, Content versions, Frames, layouts, Connections, image generation, video generation, storyboards, and video-edit configuration.
---

# Canvas Manager

这是 Canvas 设计与视频制作的统一 Skill。它把 `canvas-designer` 与 `video-production` 的业务流程组合到同一套 Canvas 工具上。所有 Canvas 状态都通过业务工具读取和修改；工具只能通过 Code Mode 调用，并且只能根据 `result.content` 继续决策。

## 基本执行约束

```python
from sdk.tool import tool

result = tool.call("query_canvas_overview", {
    "project_path": "Canvas/Product Launch",
    "page": 1,
    "limit": 50
})
print(result.content)
```

- `result.content` 是给模型使用的唯一结果；不要读取 `result.data`，不要把结果对象当字典下标访问。
- 保留用户或运行时提供的完整 `project_path`，不得猜测、缩短、重命名或替换。
- 不使用文件、目录或 Shell 工具读取、解析、修改或推断 Canvas 状态。
- 后续调用只能使用之前结果返回的精确 `element_id`、`content_id`、`connection_id`、`generation_task_id`。
- `item_ref` 只是在当前批次中关联请求和结果的标签，不是持久化 Canvas ID。
- 写操作后，如果下一步依赖持久化状态，必须重新查询。

## 能力范围与真实缺口

当前可以完成：

- 初始化、恢复和查询 Canvas 项目。
- 创建文本、形状、导入图片/视频/音频、生成图片/视频、Storyboard 和 Video Edit Element。
- 为已有普通 Element 追加 Content 版本。
- 在失败状态下重试生成 Content，并限制重试次数。
- 用户确认后选择完成的主 Content。
- 对精确的同层级节点创建 Frame。
- 使用命名布局策略独立修改布局。
- 新增、删除或替换精确 Connection。
- 等待任何返回异步任务 ID 的生成策略。
- 编排普通设计、普通视频生成和多镜头视频制作。

必须明确说明的后端缺口：

- `video-edit` Element 可以保存确认后的镜头顺序和输出配置，但当前没有执行最终 MP4 合成的 Canvas 工具，不得声称已经生成最终视频文件。
- 当前没有 `search_canvas_images` 等价的专用图片搜索并落盘工具。可以使用通用搜索了解素材，但只有拿到真实的工作区相对素材路径并成功调用导入工具后，才能说素材已加入 Canvas。
- 素材恢复是受控的只读比对加明确导入编排，不是独立恢复事务。

## Element、Content、Frame 与可修改字段

- 一个 Element 可以有多个 Content 版本。已有逻辑节点新增候选时使用 `add_canvas_contents`，不要创建重复 Element。
- 普通已有 Content 不直接覆盖；修订通过新增 Content 版本完成。
- 只有状态为 `failed` 的 generated Content 可以由 `retry_canvas_content_generation` 原地重试。
- 状态、结果路径、任务绑定、重试计数、active/main 指针和 Frame 结构 Content 都由程序维护。
- Agent 允许修改的业务维度只有：新增 Element、追加 Content、失败 Content 重试、选择主 Content、创建 Frame、修改布局、修改 Connection。
- 不提供 Element 或 Content 删除能力。需要删除时，只能告诉用户在画布上手动移除。
- Connection 删除只允许通过精确 `remove_connection_ids`，并且必须有用户明确意图。
- Element and Content deletion are not available to the Agent.

## 项目选择与恢复

1. 默认复用当前项目；只有用户明确要求新项目时才初始化新项目。
2. 已知路径时，所有调用都使用同一个完整路径。
3. 新项目或项目可能不存在时，先调用 `initialize_canvas`；该操作幂等。
4. 不知道 Element ID 时调用 `query_canvas_overview`。
5. 查询返回 `PROJECT_NOT_FOUND` 时，用同一个路径调用 `initialize_canvas`，不要搜索其他目录。
6. 需要完整 Content、层级、媒体或 Connection 时调用 `query_canvas_element_details`。

## 三个可插拔维度

- Content：`add_canvas_elements`、`add_canvas_contents`、`retry_canvas_content_generation`、`select_canvas_main_content`。
- Layout：新增时的可选 `layout`，或独立调用 `layout_canvas_elements`。
- Connection：新增时的可选 `connections`，或独立调用 `add_canvas_connections`。
- Hierarchy：使用 `frame_canvas_elements` 独立创建 Frame。

不要为了改布局重新生成 Content，不要为了新增 Content 移动节点，也不要根据视觉距离推断 Connection。

## 布局策略

| 策略 | 真实名称 | 使用规则 |
|---|---|---|
| `row_incremental` | 行递增布局 | 设计场景默认策略；不传 `position` |
| `dependency_flow` | 依赖流布局 | Storyboard、首帧、镜头视频等有明确依赖链时使用；不传 `position` |
| `explicit_position` | 显式位置布局 | 只有用户明确给出坐标时使用，并传入 `position.x`、`position.y` |

Frame 子节点使用直接父 Frame 的局部坐标，不能混用根坐标和局部坐标。Frame 本身可以布局，子节点只与同一直接父级下的兄弟节点参与碰撞计算。

## Frame 规则

- Frame 是一等容器 Element，拥有程序维护的结构 Content 和 `children`。
- 框选前先查询并确认精确的同层级普通 Element ID。
- 第一阶段不支持把已有 Frame/Group、嵌套节点、不同父级节点、重复 ID 或锁定节点混合框选。
- 不传 `children`、`x`、`y`、`width`、`height`；工具会计算包围盒并转换为 Frame 局部坐标。
- 后续只使用返回的真实 `frame_element_id` 和 `child_element_ids`。
- Frame 可以查询、布局，也可以作为 Connection 端点。
- 不得向 Frame 追加普通 Content、重试生成、切换主 Content 或等待 Frame 任务。
- 不提供解除框选和删除 Frame；告诉用户直接在画布上处理。
- The first phase does not frame existing Frames/Groups and does not provide unframing.
- Child positions are local to their direct Frame.

## Content 输入

```python
{"source": "user", "content_type": "text", "content": "发布会标题"}
{"source": "imported", "content_type": "image", "asset_path": "Canvas/Product Launch/images/product.png"}
{"source": "generated", "content_type": "image", "prompt": "高级产品主视觉", "size": "2048x2048"}
{"source": "generated", "content_type": "video", "prompt": "产品缓慢旋转展示", "duration_seconds": 5}
{"source": "user", "content_type": "storyboard", "generationConfig": {"aspect_ratio": "16:9"}, "shots": []}
{"source": "user", "content_type": "video-edit", "videoSequence": [], "output": {"format": "mp4"}}
```

- 文本使用 `source="user"`、`content_type="text"`，文本值放在 `content`；不要使用 `source="text"`、`text` 或 `value`。
- imported 媒体必须有工作区相对 `asset_path`，不能填写状态、任务或结果字段。
- generated 当前只支持 `image` 和 `video`，并且必须填写 `prompt`。
- 图片通常同步完成；视频通常返回任务 ID，需要调用 `wait_canvas_generation`。
- 等待机制是通用的；未来图片、音频或其他生成策略返回任务 ID 时也使用同一工具。
- Storyboard 和 Video Edit 是结构化用户 Content，不是普通媒体生成。

## 图片设计工作流

需要图片生成、图片修订、参考图或图片重试时才加载 `references/image-generation.md`。

1. 查询 Canvas 和精确参考 Element。
2. 需要理解主体、构图、尺寸或保持约束时先调用 `visual_understanding`。
3. 方向有重大歧义时先确认创意方向。
4. 新逻辑图片使用 `add_canvas_elements`。
5. 已有图片新增候选使用 `add_canvas_contents`。
6. 明确失败且用户同意重试时使用 `retry_canvas_content_generation`。
7. 用户明确选择完成候选后，使用 `select_canvas_main_content`。

提示词应说明主体身份约束、场景、构图、光线、风格和需要避免的伪影，并区分必须保持不变的内容与允许变化的表现。参考路径是生成输入，Connection 是业务依赖，两者不能混淆。

## 普通视频工作流

任何生成视频请求都加载 `references/video-generation.md`。

1. 查询精确参考 Element 和媒体路径。
2. 对时长、比例、参考模式等关键未决参数先确认。
3. 新视频使用 `add_canvas_elements`，已有视频候选使用 `add_canvas_contents`。
4. 返回任务 ID 后立即调用 `wait_canvas_generation`。
5. 超时不是失败，使用同一个任务 ID 继续等待，不提交重复任务。
6. 失败后先报告，用户明确同意且未超限时才重试。
7. 用户确认完成候选后才选择主 Content。

## 精细视频制作工作流

多镜头制作、Storyboard、首帧、镜头依赖或 Video Edit 配置时加载 `references/video-production.md` 和 `references/video-storyboard.md`。

1. 初始化或恢复项目并检查已有素材。
2. 确认方向、画幅、总时长、镜头数量和已有素材。
3. 创建并确认初始化图片或视觉锚点。
4. 先起草有序 Storyboard，确认后保存为 Storyboard Content。
5. 为确认后的镜头生成首帧并确认受影响候选。
6. 按直接依赖关系连接 Storyboard、首帧和镜头视频。
7. 从对应首帧生成镜头视频，异步任务使用等待工具。
8. 保留成功镜头，只修订受影响的 Content 和下游结果。
9. 使用确认后的镜头 Video Element ID 配置 `video-edit` Content。
10. 明确告知当前不能执行最终 MP4 合成。

生产流程使用 `dependency_flow` 布局。只有直接业务前驱才建立 Connection；仅作为生成参考的素材不自动建立 Connection。

### Storyboard、镜头视频与 Video Edit 参数示例

创建 Storyboard：

```python
from sdk.tool import tool
result = tool.call("add_canvas_elements", {
    "project_path": "Canvas/Product Launch",
    "items": [{
        "item_ref": "storyboard",
        "element_type": "storyboard",
        "name": "产品发布短片分镜",
        "layout": {"strategy": "dependency_flow"},
        "content": {
            "source": "user",
            "content_type": "storyboard",
            "generationConfig": {"aspect_ratio": "16:9", "resolution": "1080p"},
            "shots": [
                {"id": "S01", "description": "产品在暗色展台中亮相，镜头缓慢推进"},
                {"id": "S02", "description": "产品三分之四角度旋转，展示材质细节"}
            ]
        }
    }]
})
print(result.content)
```

从确认首帧生成异步镜头视频：

```python
from sdk.tool import tool
result = tool.call("add_canvas_elements", {
    "project_path": "Canvas/Product Launch",
    "items": [{
        "item_ref": "shot-s01",
        "element_type": "video",
        "name": "S01 产品亮相镜头",
        "layout": {"strategy": "dependency_flow"},
        "content": {
            "source": "generated",
            "content_type": "video",
            "prompt": "使用确认的首帧，产品保持稳定，镜头缓慢推进，灯光逐渐点亮，无文字水印",
            "reference_image_paths": ["Canvas/Product Launch/images/s01-first-frame.png"],
            "duration_seconds": 4,
            "aspect_ratio": "16:9",
            "resolution": "1080p"
        },
        "connections": [{"source_element_id": "element-740000000000000006"}]
    }]
})
print(result.content)
```

保存确认后的 Video Edit 配置：

```python
from sdk.tool import tool
result = tool.call("add_canvas_elements", {
    "project_path": "Canvas/Product Launch",
    "items": [{
        "item_ref": "final-edit",
        "element_type": "video-edit",
        "name": "产品发布短片剪辑配置",
        "layout": {"strategy": "dependency_flow"},
        "content": {
            "source": "user",
            "content_type": "video-edit",
            "videoSequence": [
                "element-740000000000000010",
                "element-740000000000000011"
            ],
            "output": {"aspectRatio": "16:9", "resolution": "1080p", "format": "mp4"}
        },
        "connections": [
            {"source_element_id": "element-740000000000000010"}
        ]
    }]
})
print(result.content)
```

如果 Video Edit 已存在，使用 `add_canvas_contents` 追加新的配置版本，并使用 `add_canvas_connections` 补齐其他确认镜头的直接 Connection。保存配置不等于执行最终合成。

## 失败、重试与修订

- 只允许重试当前状态为 `failed` 的 generated Content。
- 用户必须明确请求或同意重试。
- 同一个 Content 最多重试 2 次，包含首次尝试最多 3 次。
- 禁止自动重试循环。
- A single Content may be retried at most 2 times. Never loop retries automatically.
- 修改 `item_ref`、提示词、模型或尺寸不会重置计数。
- 达到上限后停止；用户需要新结果时，通过 `add_canvas_contents` 创建新的候选版本。
- `pending`、`processing` 和等待超时都不是失败。

## Connection 规则

- 新增：精确 `source_element_id` 与 `target_element_id`。
- 删除：精确 `remove_connection_ids`。
- 替换：新端点、`replace_existing_connections=true` 和精确旧 Connection ID。
- 只有用户明确要求断开或重连时才删除或替换。
- 不能根据名称、位置或端点猜旧 Connection ID。
- 新增 Element 的初始 Connection 只提供一个锚点：`source_element_id`、`source_item_ref`、`target_element_id`、`target_item_ref` 四者之一。

# 工具使用说明

以下每个公开工具都包含参数、Code Mode 示例、结果读取和下一步串联方式。

## `initialize_canvas`

初始化新项目或处理 `PROJECT_NOT_FOUND`。只接受完整工作区相对路径。

参数：`project_path`（必填）。

```python
from sdk.tool import tool
result = tool.call("initialize_canvas", {"project_path": "Canvas/Product Launch"})
print(result.content)
```

读取创建或已存在状态；下一步在需要读取状态时调用 `query_canvas_overview`。

## `query_canvas_overview`

不知道 Element ID、恢复任务或查看 Canvas 概览时使用。参数：`project_path`（必填）、`page`（可选，默认 1）、`limit`（可选，1-100，默认 50）。

```python
from sdk.tool import tool
result = tool.call("query_canvas_overview", {
    "project_path": "Canvas/Product Launch", "page": 1, "limit": 50
})
print(result.content)
```

如果结果表示还有下一页，递增 `page`。需要完整 Content、层级或连线时，把返回的精确 ID 传给 `query_canvas_element_details`。

## `query_canvas_element_details`

查询 1-10 个精确 Element ID，返回 Content、状态、媒体路径、Frame 层级和相关 Connection。参数：`project_path`、`element_ids`（均必填）。

```python
from sdk.tool import tool
result = tool.call("query_canvas_element_details", {
    "project_path": "Canvas/Product Launch",
    "element_ids": ["element-740000000000000001", "element-740000000000000002"]
})
print(result.content)
```

重试、选择主版本、删除或替换 Connection、依赖敏感的生成前必须先查询详情。

## `add_canvas_elements`

创建新的逻辑 Element。每项必填 `item_ref`、`element_type`；`name`、`layout`、`content`、`connections` 可插拔。

参数：`project_path`、`items`（均必填）；每项可含 `name`、`layout`、`content`、`connections`。

```python
from sdk.tool import tool
result = tool.call("add_canvas_elements", {
    "project_path": "Canvas/Product Launch",
    "items": [
        {
            "item_ref": "headline", "element_type": "text", "name": "发布会标题",
            "layout": {"strategy": "row_incremental"},
            "content": {"source": "user", "content_type": "text", "content": "Meet the next generation"}
        },
        {
            "item_ref": "hero-image", "element_type": "image", "name": "产品主视觉",
            "layout": {"strategy": "row_incremental"},
            "content": {"source": "generated", "content_type": "image", "prompt": "高级产品主视觉，干净背景，无文字", "size": "2048x2048"},
            "connections": [{"source_item_ref": "headline"}]
        }
    ]
})
print(result.content)
```

读取每项真实 `element_id`、`content_id`、状态和任务 ID；有任务 ID 就调用 `wait_canvas_generation`。已有逻辑节点不要重复创建，改用 `add_canvas_contents`。

## `frame_canvas_elements`

将精确的同层级普通 Element 框选为新 Frame。参数：`project_path`、`items`；每项必填 `item_ref`、`element_ids`，可选 `name`、`padding`。

```python
from sdk.tool import tool
result = tool.call("frame_canvas_elements", {
    "project_path": "Canvas/Product Launch",
    "items": [{
        "item_ref": "hero-section",
        "element_ids": ["element-740000000000000001", "element-740000000000000002"],
        "name": "主视觉区域", "padding": 80
    }]
})
print(result.content)
```

读取 `frame_element_id` 和 `child_element_ids`；需要层级详情时继续查询 Frame。不要传坐标、尺寸或 children。

## `add_canvas_contents`

向已有普通 Element 追加一个新的 Content 版本，不覆盖旧版本。参数：`project_path`、`items`；每项必填 `item_ref`、`element_id`、`content`。

```python
from sdk.tool import tool
result = tool.call("add_canvas_contents", {
    "project_path": "Canvas/Product Launch",
    "items": [{
        "item_ref": "hero-v2", "element_id": "element-740000000000000002",
        "content": {"source": "generated", "content_type": "image", "prompt": "保留产品身份，改为三分之四近景，柔和轮廓光，无文字"}
    }]
})
print(result.content)
```

读取新 `content_id` 和状态；有任务 ID 就等待。候选完成后展示给用户，不能未经确认选择主版本。Frame 不能调用此工具。

## `retry_canvas_content_generation`

只重试状态为 `failed` 的已有 generated Content。参数：`project_path`、`items`；每项必填 `item_ref`、`element_id`、`content_id`，可选 `generation_override`。

```python
from sdk.tool import tool
result = tool.call("retry_canvas_content_generation", {
    "project_path": "Canvas/Product Launch",
    "items": [{
        "item_ref": "shot-1-retry",
        "element_id": "element-740000000000000010",
        "content_id": "element-740000000000000010-content-2",
        "generation_override": {"prompt": "重试确认过的产品镜头，动作自然，无文字水印"}
    }]
})
print(result.content)
```

读取重试次数、状态和任务 ID。只有用户明确同意才能执行；同一 Content 最多重试两次，不能对 processing 或 completed Content 重试。

## `select_canvas_main_content`

用户明确选择完成候选后，将其设为主 Content。参数：`project_path`、`items`；每项必填 `item_ref`、`element_id`、`content_id`。

```python
from sdk.tool import tool
result = tool.call("select_canvas_main_content", {
    "project_path": "Canvas/Product Launch",
    "items": [{
        "item_ref": "select-hero-v2",
        "element_id": "element-740000000000000002",
        "content_id": "element-740000000000000002-content-2"
    }]
})
print(result.content)
```

读取前后主 Content ID；后续依赖选择结果时查询 Element。不能对 Frame、失败或 processing Content 使用。

## `layout_canvas_elements`

只修改布局，不修改 Content 或 Connection。参数：`project_path`、`items`；每项必填 `item_ref`、`element_id`、`layout`。

```python
from sdk.tool import tool
result = tool.call("layout_canvas_elements", {
    "project_path": "Canvas/Product Launch",
    "items": [
        {"item_ref": "layout-storyboard", "element_id": "element-740000000000000005", "layout": {"strategy": "dependency_flow"}},
        {"item_ref": "layout-shot-1", "element_id": "element-740000000000000010", "layout": {"strategy": "dependency_flow"}}
    ]
})
print(result.content)
```

只有用户明确提供坐标时才使用 `{"strategy": "explicit_position", "position": {"x": 120, "y": 480}}`；否则不传 `position`。

## `add_canvas_connections`

新增、删除或替换明确 Connection。参数：`project_path`、`items`；新增需 `source_element_id`、`target_element_id`；删除需 `remove_connection_ids`；替换还需 `replace_existing_connections=true` 和新端点。

新增示例：

```python
from sdk.tool import tool
result = tool.call("add_canvas_connections", {
    "project_path": "Canvas/Product Launch",
    "items": [{"item_ref": "storyboard-to-frame", "source_element_id": "element-740000000000000005", "target_element_id": "element-740000000000000006"}]
})
print(result.content)
```

删除示例：

```python
from sdk.tool import tool
result = tool.call("add_canvas_connections", {
    "project_path": "Canvas/Product Launch",
    "items": [{"item_ref": "remove-wrong-link", "remove_connection_ids": ["connection-740000000000000001"]}]
})
print(result.content)
```

替换示例：

```python
from sdk.tool import tool
result = tool.call("add_canvas_connections", {
    "project_path": "Canvas/Product Launch",
    "items": [{
        "item_ref": "replace-shot-source",
        "source_element_id": "element-740000000000000007",
        "target_element_id": "element-740000000000000010",
        "replace_existing_connections": True,
        "remove_connection_ids": ["connection-740000000000000001"]
    }]
})
print(result.content)
```

删除或替换前必须先查询并取得精确 Connection ID；不能按名称、位置或端点猜测。

## `wait_canvas_generation`

所有新增、追加或重试返回异步任务 ID 时使用。参数：`project_path`、`tasks`（每项必填 `generation_task_id`）、`max_wait_seconds`（1-600，默认 60）。

```python
from sdk.tool import tool
result = tool.call("wait_canvas_generation", {
    "project_path": "Canvas/Product Launch",
    "tasks": [{"generation_task_id": "generation-task-740000000000000001"}],
    "max_wait_seconds": 120
})
print(result.content)
```

`completed` 后按需查询详情；`processing`、`pending` 或 `timed_out=true` 都使用相同任务 ID 继续等待；`failed` 才进入受控重试流程。不要传 `task_ids`、裸任务字符串、Element ID 或 Content ID。

## 常用工具串联

```text
initialize_canvas -> query_canvas_overview -> query_canvas_element_details
query_canvas_element_details -> add_canvas_contents -> select_canvas_main_content（用户确认后）
add_canvas_elements/add_canvas_contents -> wait_canvas_generation -> query_canvas_element_details
query_canvas_overview -> query_canvas_element_details -> frame_canvas_elements -> layout_canvas_elements
query_canvas_element_details -> add_canvas_connections -> query_canvas_element_details
```

## Reference 加载规则

- `references/image-generation.md`：仅图片生成、修订、参考图或图片重试。
- `references/video-generation.md`：所有生成视频请求或视频恢复。
- `references/video-production.md`：多镜头、端到端视频制作编排。
- `references/video-storyboard.md`：Storyboard、镜头顺序、首帧和依赖关系。
- `references/asset-reconciliation.md`：只有用户明确提到 Canvas 与 `images` 或 `videos` 目录差异，或明确要求恢复本地素材时加载。

任何 reference 都不能扩大删除、重试或直接文件操作边界。
