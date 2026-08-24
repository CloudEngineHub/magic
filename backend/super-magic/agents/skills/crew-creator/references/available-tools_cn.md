# 可用工具参考

本文档列出 super-magic 项目中可用于配置 TOOLS.md 的所有工具。
管理工具配置时，请参考本文档选择合适的工具组合。

工具名称必须与列表中的名称完全一致，否则编译会失败。

`run_python_snippet`、`run_sdk_snippet` 和 `compact_chat_history` 是由运行时管理的工具。不要将它们列入 `tools`；除非明确禁用了 Agent 的代码执行能力，否则运行时会自动提供这些工具。

---

## 按职能推荐的工具组合

以下是根据员工核心职能整理的推荐工具组合：

### 通用基础工具（建议所有员工使用）

```yaml
tools:
  - list_dir
  - file_search
  - read_files
  - grep_search
  - write_file
  - edit_file
```

### 研究与分析员工

```yaml
tools:
  - web_search
  - read_webpages_as_markdown
  - visual_understanding
  - video_understanding
```

### 内容创作员工

```yaml
tools:
  - web_search
  - read_webpages_as_markdown
  - generate_images
  - image_search
  - visual_understanding
  - video_understanding
```

### 设计与视觉创作员工

```yaml
tools:
  - web_search
  - visual_understanding
  - video_understanding
  - generate_canvas_images
  - search_images_to_canvas
  - create_canvas
```

### 开发与编程员工

```yaml
tools:
  - shell_exec
  - web_search
  - read_webpages_as_markdown
  - edit_file_range
  - multi_edit_file
  - multi_edit_file_range
  - delete_files
```

### 数据分析员工

```yaml
tools:
  - shell_exec
  - web_search
  - visual_understanding
  - video_understanding
```

---

## 完整工具列表

### 文件操作

| 工具 | 描述 |
|------|------|
| `list_dir` | 列出目录内容 |
| `file_search` | 按名称模式搜索文件 |
| `read_files` | 读取一个或多个文件 |
| `read_file` | 读取单个文件 |
| `grep_search` | 使用正则表达式搜索文件内容 |
| `write_file` | 写入文件内容 |
| `append_to_file` | 向现有文件追加内容 |
| `edit_file` | 通过替换匹配内容编辑文件 |
| `edit_file_range` | 在指定行范围内编辑文件 |
| `multi_edit_file` | 对一个文件应用多项编辑 |
| `multi_edit_file_range` | 在指定行范围内应用多项编辑 |
| `delete_files` | 删除一个或多个文件 |

### 网页搜索与抓取

| 工具 | 描述 |
|------|------|
| `web_search` | 搜索互联网信息 |
| `read_webpages_as_markdown` | 获取网页并转换为 Markdown |
| `download_from_markdown` | 下载 Markdown 内容中引用的文件 |

外部文件下载使用 `download` 系统技能和 `run_sdk_snippet`，包括单文件下载。不要将 `download_from_url` 或仅 Code Mode 可用的 `download_from_urls` 工具列入 Agent 的 `tools:` 列表。

```yaml
skills:
  system_skills:
    - name: download
```

### 视觉与图像

| 工具 | 描述 |
|------|------|
| `visual_understanding` | 分析图像内容并回答问题 |
| `visual_understanding_webpage` | 截图并从视觉角度分析网页 |
| `video_understanding` | 分析视频内容并回答问题 |
| `generate_images` | 根据文本提示或参考图批量生成图像 |
| `image_search` | 按关键词搜索图像 |

### 代码执行

| 工具 | 描述 |
|------|------|
| `shell_exec` | 执行 Shell 命令 |

启用 `code_execution` 后，`run_python_snippet` 和 `run_sdk_snippet` 会自动可用，不应将它们作为 TOOLS.md 条目列出。

### 任务管理

| 工具 | 描述 |
|------|------|
| `todo_create` | 创建 TODO 项 |
| `todo_read` | 读取 TODO 项 |
| `todo_update` | 更新 TODO 项 |

### Agent 协作

| 工具 | 描述 |
|------|------|
| `call_agent` | 将任务委派给其他专用 Agent |
| `call_subagent` | 针对特定任务调用子 Agent |
| `wait_for_subagents` | 等待一个或多个后台子 Agent 完成 |

### 演示文稿与幻灯片

| 工具 | 描述 |
|------|------|
| `create_slide` | 创建幻灯片 |
| `create_slide_project` | 创建新的幻灯片演示项目 |
| `analysis_slide_webpage` | 分析幻灯片或演示文稿网页 |

### 音频与视频

| 工具 | 描述 |
|------|------|
| `audio_understanding` | 分析并转写音频 |
| `split_audio` | 将音频拆分为多个片段 |
| `setup_audio_project` | 设置音频项目 |
| `analyze_audio_project` | 分析音频项目 |
| `setup_video_project` | 设置视频项目 |
| `analyze_video_project` | 分析视频项目 |
| `convert_video_to_audio` | 从视频中提取音频 |
| `download_youtube_video_media` | 下载 YouTube 视频或音频 |
| `get_youtube_video_info` | 获取 YouTube 视频元数据 |

### 浏览器操作（仅 Code Mode）

| 工具 | 描述 |
|------|------|
| `browser_list_sessions` / `browser_list_pages` | 检查 Browser 会话和页面 |
| `browser_open_page` / `browser_close_page` / `browser_activate_page` | 管理 Browser 会话中的页面 |
| `browser_navigate` / `browser_wait` | 导航并等待明确的页面条件 |
| `browser_read_page` / `browser_list_elements` / `browser_screenshot` | 读取文本、检查页面结构并截图 |
| `browser_click` / `browser_fill` / `browser_press` / `browser_hover` / `browser_scroll` | 使用快照引用与页面交互 |
| `browser_select` / `browser_check` / `browser_upload_file` | 操作表单控件和文件输入框 |
| `browser_visual_query` / `browser_find_visual` | 当结构化观察不足时使用视觉分析 |
| `browser_evaluate` / `browser_read_console` / `browser_read_network` | 调试页面并检查运行时活动 |

### 其他工具

| 工具 | 描述 |
|------|------|
| `reflection` | 触发自我反思以改进推理 |
| `thinking` | 对复杂问题进行扩展思考 |
| `summarize` | 总结长内容 |
| `deep_write` | 通过多轮处理进行深度写作 |
| `find_skills` | 按关键词搜索技能或浏览可用技能列表 |
| `read_skills` | 读取技能的 SKILL.md 内容 |

### 即时通讯渠道

| 工具 | 描述 |
|------|------|
| `connect_lark_bot` | 连接飞书/Lark 机器人 |
| `connect_dingtalk_bot` | 连接钉钉机器人 |
| `connect_wecom_bot` | 连接企业微信机器人 |
| `get_im_channel_status` | 获取即时通讯渠道连接状态 |

### 设计画布

| 工具 | 描述 |
|------|------|
| `create_canvas` | 创建画布项目 |
| `generate_canvas_images` | 直接在画布中生成图像 |
| `generate_canvas_videos` | 直接在画布中生成视频 |
| `search_images_to_canvas` | 搜索并添加图像到画布 |

### 数据看板

| 工具 | 描述 |
|------|------|
| `create_dashboard_project` | 创建数据看板项目 |
| `create_dashboard_cards` | 创建数据看板卡片 |
| `update_dashboard_cards` | 更新数据看板卡片 |
| `delete_dashboard_cards` | 删除数据看板卡片 |
| `query_dashboard_cards` | 查询数据看板卡片 |
| `download_dashboard_maps` | 下载数据看板地图数据 |
| `validate_dashboard` | 验证数据看板配置 |
