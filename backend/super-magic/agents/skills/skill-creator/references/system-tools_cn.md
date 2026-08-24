# 系统工具

本文档列出 super-magic Skill 中可供 AI 使用的工具、描述、参数 Schema 和 Python 调用示例。

所有工具调用均使用以下格式：

```python
from sdk.tool import tool

result = tool.call('tool_name', {
    "param": "value"
})

if result.ok:
    data = result.data  # dict 或 None
else:
    error = result.content  # 错误消息字符串
```

---

## 网页搜索与抓取

### web_search

搜索互联网。在访谈阶段用于研究最佳实践、API 文档和类似技能模式。
无需浏览器即可使用。

**Schema：**

```json
{
  "topic_id": "string (required) — 对同一搜索主题使用相同的 topic_id，以去重结果",
  "requirements_xml": "string (required) — XML 格式的搜索要求，参见下面的示例"
}
```

```python
from sdk.tool import tool

result = tool.call('web_search', {
    "topic_id": "skill-research",
    "requirements_xml": """<requirements>
    <requirement>
        <name>Travel Planning Best Practices</name>
        <query>travel itinerary generation AI best practices 2024</query>
        <limit>10</limit>
    </requirement>
</requirements>"""
})

if result.ok:
    print(result.content)
```

### read_webpages_as_markdown

获取网页并转换为 Markdown。适合读取文档和技术文章。

**Schema：**

```json
{
  "urls": "string[] (required) — 要读取的网页 URL 列表",
  "requirements": "string (optional) — 提取要求；为空时返回原始内容，非空时按要求提取"
}
```

```python
from sdk.tool import tool

result = tool.call('read_webpages_as_markdown', {
    'urls': ['https://example.com/docs/api'],
    'requirements': 'Extract API endpoint descriptions and parameter lists'
})
```

### download_from_urls

仅 Code Mode 可用的工具，用于可靠地下载单个或批量文件。完整流程请使用内置的 `download` 技能。不要将此工具或内部的 `download_from_url` 工具加入 Agent 的 `tools` 列表。

**Schema：**

```json
{
  "downloads": [
    {
      "url": "string (required)",
      "file_path": "string (required)",
      "headers": "object (optional)",
      "overwrite": "boolean (optional, default true)"
    }
  ]
}
```

```python
from sdk.tool import tool

result = tool.call('download_from_urls', {
    'downloads': [
        {'url': 'https://example.com/a.csv', 'file_path': 'data/a.csv'},
        {'url': 'https://example.com/b.csv', 'file_path': 'data/b.csv'},
    ]
})
print(result.content)
```

---

## 视觉

### visual_understanding

分析图像内容。适用于用户截图、设计稿和流程图。

**Schema：**

```json
{
  "images": "string[] (required) — 图像 URL 或本地文件路径列表；支持多张图像",
  "query": "string (required) — 关于图像的分析问题或要求"
}
```

```python
from sdk.tool import tool

result = tool.call('visual_understanding', {
    'images': ['.workspace/screenshot.png'],
    'query': 'Describe the workflow shown in this screenshot'
})
```

### video_understanding

分析视频内容。适用于用户上传的视频文件或视频 URL。

**Schema：**

```json
{
  "videos": "string[] (required) — 视频 URL 或本地文件路径列表；支持多个视频",
  "query": "string (required) — 关于视频的分析问题或要求"
}
```

```python
from sdk.tool import tool

result = tool.call('video_understanding', {
    'videos': ['https://example.com/demo.mp4'],
    'query': 'Describe the operation workflow shown in this video'
})
```

### visual_understanding_webpage

截图并从视觉角度分析网页内容。支持本地 HTML 文件和远程 URL。
除了截图，还会自动获取页面 HTML（最多 16K tokens），以便进行更准确的分析。
适用于验证生成的 HTML 报告是否正确渲染。

**Schema：**

```json
{
  "target": "string (required) — 本地 HTML 文件路径（相对于工作目录）或远程 URL",
  "query": "string (required) — 关于网页内容的分析问题或要求"
}
```

```python
from sdk.tool import tool

# 检查本地 HTML 文件
result = tool.call('visual_understanding_webpage', {
    'target': '.workspace/output/report.html',
    'query': 'Check whether this report renders correctly and charts display properly'
})

# 分析远程网页
result = tool.call('visual_understanding_webpage', {
    'target': 'https://example.com',
    'query': 'Analyze the main content and layout structure of this webpage'
})
```

---

## 代码执行

### shell_exec

执行 Shell 命令。常见用途包括运行 Python 脚本、文件操作和评估脚本。

**Schema：**

```json
{
  "command": "string (required) — 要执行的 Shell 命令",
  "cwd": "string | null (optional) — 命令工作目录；默认使用工作区根目录",
  "timeout": "integer (optional, default 60) — 超时时间，单位为秒"
}
```

```python
from sdk.tool import tool

# 运行 skill-creator 自带脚本（cwd 使用该技能目录的绝对路径）
result = tool.call('shell_exec', {
    'command': 'python scripts/aggregate_benchmark.py <workspace-skills-dir>/my-skill/evals/iteration-1 --skill-name my-skill',
    'cwd': '<skill-creator-absolute-path>',
    'timeout': 120
})

# 运行工作区技能自己的脚本（cwd 使用相对路径）
result = tool.call('shell_exec', {
    'command': 'python scripts/process.py',
    'cwd': '<workspace-skills-dir>/my-skill'
})
```

### run_python_snippet

直接运行 Python 代码，无需先写入文件。适用于轻量数据处理和调用内部项目 API。

**Schema：**

```json
{
  "purpose": "string (required) — 用户可读的用途，使用用户当前语言，去除首尾空白后长度为 4-16 个字符",
  "python_code": "string (required) — 要执行的 Python 代码",
  "cwd": "string | null (optional) — 工作目录；默认为工作区根目录，相对路径相对于工作区解析，绝对路径按原样使用",
  "timeout": "integer (optional, default 60) — 超时时间，单位为秒"
}
```

```python
from sdk.tool import tool

result = tool.call('run_python_snippet', {
    'purpose': 'Format metadata',
    'python_code': '''
import json

data = {"name": "my-skill", "version": "1.0"}
print(json.dumps(data, indent=2))
'''
})
```

---

## 图像生成与搜索

### generate_images

批量文本生成图像和图像编辑。每个任务生成一张图像；所有任务并发运行。
- `reference_images` 为空：纯文本生成
- `reference_images` 非空：基于参考图生成或编辑

**Schema：**

```json
{
  "tasks": [
    {
      "prompt": "string (required) — 图像描述；建议包含主体、风格、构图、光照和色调",
      "name": "string (required) — 输出文件名（不含扩展名）",
      "output_path": "string (required) — 保存目录，相对于工作区根目录",
      "size": "string (optional) — 图像尺寸 'WxH'；提供 reference_images 时可省略（自动使用最大参考图尺寸）；没有参考图时必填，例如 '2048x2048'、'2560x1440'、'1440x2560'",
      "reference_images": "string[] (optional) — 参考图路径列表，相对于工作区根目录"
    }
  ]
}
```

```python
from sdk.tool import tool

# 文本生成图像
result = tool.call('generate_images', {
    'tasks': [
        {
            'prompt': 'A minimalist flat-design icon for a travel planning app, blue and white color scheme',
            'name': 'travel_icon',
            'output_path': 'images',
            'size': '2048x2048'
        }
    ]
})

# 基于参考图编辑
result = tool.call('generate_images', {
    'tasks': [
        {
            'prompt': 'Change the background to pure white',
            'name': 'result',
            'output_path': 'images',
            'reference_images': ['images/original.png']
        }
    ]
})
```

### image_search

按关键词搜索高质量图像。返回数量可能少于请求数量。

**Schema：**

```json
{
  "topic_id": "string (required) — 对同一搜索主题使用相同的 topic_id，以去重图像",
  "requirements_xml": "string (required) — XML 格式的图像搜索要求，参见下面的示例"
}
```

```python
from sdk.tool import tool

result = tool.call('image_search', {
    'topic_id': 'travel-report-images',
    'requirements_xml': """<requirements>
    <requirement>
        <name>Tokyo City Skyline</name>
        <query>Tokyo city skyline night 2024</query>
        <visual_understanding_prompt>Confirm this is a Tokyo city nightscape with sufficient clarity for a report cover</visual_understanding_prompt>
        <requirement_explanation>Needed for travel report cover; requires high-definition Tokyo city nightscape</requirement_explanation>
        <expected_aspect_ratio>16:9</expected_aspect_ratio>
        <count>5</count>
    </requirement>
</requirements>"""
})
```
