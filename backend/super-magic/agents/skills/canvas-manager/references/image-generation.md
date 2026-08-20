# Image generation reference

本 reference 只在图片生成、图片修订、参考图或图片重试时加载。它不允许模型读写项目文件，也不改变父 Skill 的重试上限。

## 选择工具

- 新的逻辑图片：`add_canvas_elements`，`element_type=image`，Content 使用 `source=generated` 和 `content_type=image`。
- 已有图片的新候选：`add_canvas_contents`。这会追加 Content，不覆盖旧候选。
- 失败 Content 原地重试：`retry_canvas_content_generation`，必须提供原 Element ID 和失败 Content ID。
- 用户确认候选后：`select_canvas_main_content`。

## 提示词与参考图

提示词应明确主体身份、需要保持的形状和颜色、场景、构图、光线、风格以及需要避免的文字、水印和伪影。使用现有图片作为参考时，先用 `visual_understanding` 获取主体和尺寸，再把实际返回的工作区相对路径填入 `reference_images`。参考路径是生成输入，不等于 Canvas Connection。

## 版本规则

- 普通 Content 不覆盖；修改方向创建新候选。
- 只有当前状态为 `failed` 且用户明确同意时才重试。
- 同一 Content 最多重试两次，禁止自动循环。
- 生成结果完成后必须等待用户选择，不能自动切换主 Content。
