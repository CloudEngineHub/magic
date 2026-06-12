# Script Output for Super Magic Display

Use this reference when creating or updating a Skill that includes scripts executed through `shell_exec`.

The script output has two audiences:

- The model reads normal stdout and uses it for reasoning, follow-up tool calls, and the final answer.
- The Super Magic frontend reads a special marker and uses it to render user-facing `after` text and `tool_detail`.

## Boundary

Apply this pattern when a Skill script is run through `shell_exec` and its terminal output would otherwise be shown directly to the user.

Do not apply it when:

- The script only creates files and the terminal output is not the user-facing result.
- The script is only a local maintenance helper.
- A dedicated tool already converts the result into frontend `ToolDetail` without going through `shell_exec`.

## Required Output Order

Scripts should print output in this order:

1. Normal stdout for the model. Prefer stable JSON or concise text with enough fields for the model to continue.
2. One Super Magic display marker line:

```text
<super-magic-tool-detail>{json}</super-magic-tool-detail>
```

When `shell_exec` completes, it parses valid markers, removes them from terminal output, and uses the JSON to override the frontend `after` and `tool_detail` display. Invalid JSON is left visible so the script author can notice the mistake.

## Recommended JSON Shape

Use this compact shape by default:

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

Fields:

- `after.action`: user-facing action name. Use product language, not API wording.
- `after.remark`: one-sentence result summary for the completed tool card.
- `tool_detail.file_name`: stable English file name for the Markdown detail.
- `tool_detail.markdown`: user-facing Markdown detail, summarized and formatted for reading.

You may also emit the full `ToolDetail` shape:

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

## Python Template

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

    # Model-facing output: keep it parseable and complete.
    print(json.dumps(result, ensure_ascii=False, indent=2))

    # Frontend-facing output: Super Magic parses and hides this marker.
    print_super_magic_tool_detail(result)
```

## Writing Rules

- Do not output only the marker. Keep normal stdout so the model can still read the result.
- Do not dump raw payloads directly into `tool_detail.markdown`; format them into a readable summary.
- Do not expose internal field names, script paths, tracebacks, or implementation details in `after` or details.
- Do not put real customer data, real people, phone numbers, meetings, or private material into examples or tests.
- Use the target user's language for display text; keep script field names stable and English.
- Emit only one marker unless there is a strong reason. If multiple valid markers appear, the last one wins.

## Validation

At minimum, run:

```bash
python3 -m py_compile skills/<domain>/<skill-name>/scripts/<script>.py
python3 skills/<domain>/<skill-name>/scripts/<script>.py <mock-args>
```

Check that:

- The first normal stdout block is readable by the model, ideally parseable with `json.loads`.
- The final line contains `<super-magic-tool-detail>`.
- The marker JSON parses to an object.
- `after.remark` is a concise user-facing summary.
- `tool_detail.markdown` is formatted Markdown, not a raw dictionary dump.

## Example Implementations

The following scripts follow this pattern:

- `skills/public/weather-query/scripts/query_weather.py`
- `crews/public/daily-service-assistant/skills/almanac-query/scripts/query_almanac.py`
