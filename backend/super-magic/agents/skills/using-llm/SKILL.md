---
name: using-llm
description: List available large language models and send chat completion requests programmatically. Use this skill when you need to call an LLM within a snippet, including model comparison, visual understanding, batch inference, and model performance testing.

---

# LLM Calling Skill

List available models and send chat requests to any of them — no extra configuration required.

## Core Capabilities

- List currently available models
- Send chat completion requests in OpenAI format (non-streaming)

## Usage Guide

When you need to call an LLM in code, use the SDK functions from `sdk.llm`. There are two ways to execute the code:

- **Option 1**: Use the `run_python_snippet` tool to execute a code snippet directly
- **Option 2**: Write the code to a `.py` file, then execute it with `shell_exec`

`create_openai_sync_client` is a Python SDK function, **not a tool name** — import and use it inside your code:

```python
# Option 1: run_python_snippet
run_python_snippet(
    python_code="""
from sdk.llm import create_openai_sync_client
client = create_openai_sync_client()
...
""",
    script_path="temp_llm_xxx.py",
    timeout=300,
)

# Option 2: write a .py file, then run with shell_exec
# First write the script with write_file, then execute:
shell_exec("python scripts/my_llm_script.py")
```

LLM calls can take a while — consider increasing the timeout based on complexity, e.g. `timeout=120` for a single call, `timeout=300` or more for multi-model comparisons or batch inference (applies to both options).

## Quick Start

### Step 1: List available models

When unsure of the model ID, query available models first:

```python
run_python_snippet(
    python_code="""
import json
from sdk.llm import create_openai_sync_client

client = create_openai_sync_client()
models = client.models.list()
print(json.dumps([{"id": m.id} for m in models.data], ensure_ascii=False, indent=2))
""",
    script_path="temp_list_models.py",
)
```

Example output:

```json
[
  {"id": "claude-3-5-sonnet-20241022"},
  {"id": "gpt-4o"},
  {"id": "deepseek-v3"}
]
```

### Step 2: Send a chat request

Use a real model ID to send a chat:

```python
run_python_snippet(
    python_code="""
from sdk.llm import create_openai_sync_client

client = create_openai_sync_client()

response = client.chat.completions.create(
    model="<model-id>",
    messages=[
        {"role": "system", "content": "You are a helpful assistant"},
        {"role": "user", "content": "Hello"},
    ],
    extra_body={"thinking": {"type": "disabled"}},
)

print(response.choices[0].message.content)
""",
    script_path="temp_chat.py",
    timeout=120,
)
```

## Vision — Attach Images in Messages

When using a vision-capable model, images can be included in messages. The SDK provides two ways to convert a workspace file to a URL:

| Function | Use Case |
|---|---|
| `file_to_url(path)` | **Use this first** — returns a directly accessible URL |
| `image_to_base64(path)` | Fallback if `file_to_url` fails — encodes the image as base64 |

Both accept http/https URLs as input and return them unchanged.

> **IMPORTANT — `image_to_base64` return value**: The function already returns a complete data URL string like `data:image/jpeg;base64,/9j/4AAQ...`. Use the return value directly as `url`. **Do NOT prepend `data:image/jpeg;base64,` again** — doing so will cause an `Invalid base64 image_url` error.

```python
run_python_snippet(
    python_code="""
from sdk.llm import create_openai_sync_client, file_to_url, image_to_base64

client = create_openai_sync_client()

# Use file_to_url first — path is relative to .workspace/
image_url = file_to_url("test/screenshot.png")

# Fallback to image_to_base64 if file_to_url fails
# image_url = image_to_base64("test/screenshot.png")
# image_to_base64 returns a complete data URL — use it directly, never prepend "data:...;base64," again

response = client.chat.completions.create(
    model="<vision-model-id>",
    messages=[{
        "role": "user",
        "content": [
            {"type": "image_url", "image_url": {"url": image_url}},
            {"type": "text", "text": "Describe the content of this image"},
        ],
    }],
    extra_body={"thinking": {"type": "disabled"}},
)

print(response.choices[0].message.content)
""",
    script_path="temp_vision.py",
    timeout=120,
)
```

## Parameter Reference

### Common Parameters for `client.chat.completions.create()`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `model` | `str` | Yes | Model ID — use a real ID from Step 1 |
| `messages` | `list` | Yes | List of messages, each with `role` and `content` |
| `temperature` | `float` | No | Sampling temperature, 0~2, default 1 |
| `max_tokens` | `int` | No | Maximum output tokens |
| `tools` | `list` | No | Tool definitions (Function Calling) |
| `extra_body` | `dict` | No | Extra fields not natively supported by the OpenAI SDK, e.g. `thinking` |

### `thinking` Parameter — Control Deep Thinking

Pass `thinking` via `extra_body` to control whether the model outputs chain-of-thought content. **Recommended default: `disabled`** to avoid unnecessary token usage and latency.

| `thinking.type` value | Description |
|---|---|
| `disabled` | Force disable deep thinking — model will not output chain-of-thought (**recommended default**) |
| `enabled` | Force enable deep thinking — model always outputs chain-of-thought |
| `auto` | Model decides on its own whether to use deep thinking |

> **Note**: The `thinking` parameter only applies to models that support deep thinking (e.g. doubao-seed series). Passing it to unsupported models may cause errors — check whether the target model supports this parameter before using it.

```python
# Disable thinking (recommended default)
extra_body={"thinking": {"type": "disabled"}}

# Enable thinking
extra_body={"thinking": {"type": "enabled"}}

# Let model decide
extra_body={"thinking": {"type": "auto"}}
```

## Return Value

`client.chat.completions.create()` returns a `ChatCompletion` object:

```python
response.choices[0].message.content      # Text reply
response.choices[0].message.tool_calls   # Tool calls (Function Calling)
response.choices[0].finish_reason        # stop / tool_calls / length
response.usage.total_tokens              # Total tokens used

# Only present when thinking.type is "enabled" or "auto" (and model decides to think)
response.choices[0].message.reasoning_content   # Chain-of-thought content
response.usage.completion_tokens_details        # Contains reasoning_tokens field
```

> **Note**: `reasoning_content` is a non-standard field and is not automatically parsed by the OpenAI SDK as an attribute. Access it as follows:

```python
# Option 1: via model_extra
reasoning = response.choices[0].message.model_extra.get("reasoning_content")

# Option 2: convert to dict
import json
msg_dict = json.loads(response.choices[0].message.model_dump_json())
reasoning = msg_dict.get("reasoning_content")
```
