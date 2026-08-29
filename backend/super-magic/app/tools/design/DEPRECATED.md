# `app/tools/design` 弃用说明

## 当前状态

`app/tools/canvas` 已成为新的 Canvas Agent 工具集，Agent 侧应通过 `canvas-manager` Skill 使用新的 Canvas 工具。

本目录及其全部子包均已进入弃用流程：`tools`、`manager`、`domain`、`codec`、`utils`、`service`、`sidecar` 和 `video_production` 均不再接受新的生产依赖。

但 `app/tools/design` 当前不能在本版本整体删除。该目录仍包含以下在运行时被引用的旧实现：

- 旧版 Canvas 的 manager、codec、domain、utils 和 sidecar，用于 Canvas 版本路由、V1/V2/V3 兼容读取以及旧工具执行。
- `app/tools/__init__.py` 中对旧 Design 工具的兼容注册、导入和公开导出；这些位置已添加下一版本移除标记。
- 旧视频生产工具及其 storyboard、内容生成和旧版关系处理逻辑。
- 与旧工具、旧版兼容逻辑及视频生产服务对应的测试和兼容调用。

沙箱文件列表视频合成已迁移到 `app.tools.canvas.production`，不再依赖本目录的旧视频合成适配器和文件合成服务。

## 删除计划

本目录标记为**下一版本删除**。当前版本只保留兼容运行所需代码，不再新增依赖或扩展旧 Design 工具能力。

## 删除前置条件

下一个版本删除前必须完成：

1. 从 `app/tools/__init__.py` 移除旧 Design 工具的注册、导入和公开导出。
2. 将仍需保留的 Canvas 版本兼容、解析、sidecar 和基础领域能力迁移到 `app.tools.canvas`，或确认对应旧版本数据已不再需要支持。
3. 删除或迁移所有对 `app.tools.design` 的生产调用、测试和兼容导入。
4. 删除旧 Design 工具对应的测试；必要的历史数据兼容测试迁移到 Canvas 测试目录。
5. 完成静态依赖检查及针对 Canvas 读写、视频合成和历史版本兼容性的回归验证。

本文件是迁移标记，不改变现有工具行为。
