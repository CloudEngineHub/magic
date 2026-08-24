# Super Magic 展示用脚本输出

创建或更新通过 `shell_exec` 执行脚本的 Skill 时，请使用本参考规范。
脚本输出面向两个受众：

- 模型读取普通 stdout，用于推理、后续工具调用和最终回答。
- Super Magic 前端读取特殊标记，用于渲染面向用户的 `after` 文本和 `tool_detail`。

## 适用范围

当 Skill 脚本通过 `shell_exec` 运行，且终端输出原本会直接展示给用户时，使用此模式。

以下情况不适用：

- 脚本只创建文件，终端输出不是面向用户的结果。
- 脚本只是本地维护辅助工具。
- 已有专用工具可以将结果转换为前端 `ToolDetail`，不需要经过 `shell_exec`。

## 必需的输出顺序

脚本应按以下顺序打印输出：

1. 模型使用的普通 stdout。优先使用稳定的 JSON，或使用包含足够字段、便于模型继续处理的简洁文本。
2. 一行 Super Magic 展示标记：

```text
<super-magic-tool-detail>{json}</super-magic-tool-detail>
```

`shell_exec` 完成后会解析有效标记，将其从终端输出中移除，并使用其中的 JSON 覆盖前端的 `after` 和 `tool_detail` 展示内容。无效 JSON 会保留在输出中，以便脚本作者发现问题。

## 推荐的 JSON 结构

默认使用以下紧凑结构：

```json
{
  "after": {
    "action": "Query weather",
    "remark": "Hangzhou 2026-06-05: cloudy with showers, 23-29°C, rain probability 55%"
  },
  "tool_detail": {
    "file_name": "weather_result.md",
    "markdown": "# Weather Result\n\n- City: Hangzhou\n- Date: 2026-06-05"
  }
}
```

字段说明：

- `after.action`：面向用户的操作名称。使用产品语言，不要使用 API 术语。
- `after.remark`：已完成工具卡片的一句话面向用户的结果摘要。
- `tool_detail.file_name`：稳定的英文 Markdown 详情文件名。
- `tool_detail.markdown`：面向用户的 Markdown 详情，应经过摘要和格式化，便于阅读。

也可以输出完整的 `ToolDetail` 结构：

```json
{
  "tool_detail": {
    "type": "md",
    "data": {
      "file_name": "result.md",
      "content": "# Result\n\nReadable content"
    }
  }
}
```

## Python 模板

```python
import json
from typing import Any


def build_super_magic_tool_detail(result: dict[str, Any]) -> dict[str, Any]:
    markdown = "\n".join(
        [
            "# Query Result",
            "",
            f"- Query: {result['query']}",
            f"- Summary: {result['summary']}",
        ]
    )

    return {
        "after": {
            "action": "Query result",
            "remark": result["summary"],
        },
        "tool_detail": {
            "file_name": "query_result.md",
            "markdown": markdown,
        },
    }


def print_super_magic_tool_detail(result: dict[str, Any]) -> None:
    payload = json.dumps(
        build_super_magic_tool_detail(result),
        ensure_ascii=False,
        separators=(",", ":"),
    )
    print(f"<super-magic-tool-detail>{payload}</super-magic-tool-detail>")


def main() -> None:
    result = run_query()

    # 面向模型的输出：保持可解析且完整。
    print(json.dumps(result, ensure_ascii=False, indent=2))

    # 面向前端的输出：Super Magic 会解析并隐藏此标记。
    print_super_magic_tool_detail(result)
```

## 编写规则

- 不要只输出标记。保留普通 stdout，以便模型仍能读取结果。
- 不要将原始 payload 直接倾倒到 `tool_detail.markdown`；应将其格式化为可读摘要。
- 不要在 `after` 或详情中暴露内部字段名、脚本路径、traceback 或实现细节。
- 不要在示例或测试中放入真实客户数据、真实人物、电话号码、会议或私密材料。
- 使用目标用户的语言显示文本；脚本字段名保持稳定并使用英文。
- 除非有充分理由，否则只输出一个标记。如果出现多个有效标记，最后一个会生效。

## 验证

至少运行：

```bash
python3 -m py_compile skills/<domain>/<skill-name>/scripts/<script>.py
python3 skills/<domain>/<skill-name>/scripts/<script>.py <mock-args>
```

检查以下内容：

- 第一段普通 stdout 可供模型读取，最好可以使用 `json.loads` 解析。
- 最后一行包含 `<super-magic-tool-detail>`。
- 标记中的 JSON 可以解析为对象。
- `after.remark` 是简洁的面向用户的摘要。
- `tool_detail.markdown` 是格式化后的 Markdown，而不是原始字典转储。

## 示例实现

以下脚本遵循此模式：

- `skills/public/weather-query/scripts/query_weather.py`
- `crews/public/daily-service-assistant/skills/almanac-query/scripts/query_almanac.py`
