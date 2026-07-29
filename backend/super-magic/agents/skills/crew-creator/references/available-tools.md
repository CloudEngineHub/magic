# Available Tools Reference

This document lists all tools available for TOOLS.md configuration in the super-magic project.
When managing employee tool configuration, refer to this list to select appropriate tool combinations.

Tool names must exactly match the names in this list; otherwise, compilation will fail.

---

## Recommended Tool Combinations by Function

Based on the employee's core function, here are recommended tool combinations:

### Universal Base Tools (recommended for all employees)

```yaml
tools:
  - list_dir
  - file_search
  - read_files
  - grep_search
  - write_file
  - edit_file
  - compact_chat_history
```

### Research & Analysis Employee

```yaml
tools:
  - web_search
  - read_webpages_as_markdown
  - visual_understanding
  - video_understanding
  - run_python_snippet
  - download_from_url
  - download_from_urls
```

### Content Creation Employee

```yaml
tools:
  - web_search
  - read_webpages_as_markdown
  - generate_images
  - image_search
  - visual_understanding
  - video_understanding
  - run_python_snippet
```

### Development & Programming Employee

```yaml
tools:
  - shell_exec
  - run_python_snippet
  - web_search
  - read_webpages_as_markdown
  - edit_file_range
  - multi_edit_file
  - multi_edit_file_range
  - delete_files
```

### Data Analysis Employee

```yaml
tools:
  - run_python_snippet
  - shell_exec
  - web_search
  - visual_understanding
  - video_understanding
  - run_python_snippet
  - download_from_url
```

---

## Complete Tool List

### File Operations

| Tool | Description |
|------|-------------|
| `list_dir` | List directory contents |
| `file_search` | Search for files by name pattern |
| `read_files` | Read one or more files |
| `read_file` | Read a single file |
| `grep_search` | Search file contents by regex |
| `write_file` | Write content to a file |
| `append_to_file` | Append content to an existing file |
| `edit_file` | Edit a file by replacing matched content |
| `edit_file_range` | Edit a file within a line range |
| `multi_edit_file` | Apply multiple edits to a file |
| `multi_edit_file_range` | Apply multiple edits within line ranges |
| `delete_files` | Delete one or more files |

### Web Search & Fetch

| Tool | Description |
|------|-------------|
| `web_search` | Search the internet for information |
| `read_webpages_as_markdown` | Fetch webpages and convert to Markdown |
| `download_from_url` | Download a file from a URL |
| `download_from_urls` | Batch download files from multiple URLs |
| `download_from_markdown` | Download files referenced in Markdown content |

### Vision & Image

| Tool | Description |
|------|-------------|
| `visual_understanding` | Analyze image content and answer questions |
| `visual_understanding_webpage` | Screenshot and analyze a webpage visually |
| `video_understanding` | Analyze video content and answer questions |
| `generate_images` | Batch generate images from text prompts or reference images |
| `image_search` | Search for images by keyword |

### Code Execution

| Tool | Description |
|------|-------------|
| `shell_exec` | Execute shell commands |
| `run_python_snippet` | Run Python code directly |

### Content Processing

| Tool | Description |
|------|-------------|
| `run_python_snippet` | Use Code Mode; document parsing services are called from the `document-converter` skill |
| `convert_pdf` | Convert files to/from PDF format |

### Memory Management

| Tool | Description |
|------|-------------|
| `create_memory` | Create a new memory entry |
| `update_memory` | Update an existing memory entry |
| `delete_memory` | Delete a memory entry |

### Task Management

| Tool | Description |
|------|-------------|
| `todo_create` | Create a TODO item |
| `todo_read` | Read TODO items |
| `todo_update` | Update a TODO item |

### Agent Collaboration

| Tool | Description |
|------|-------------|
| `call_agent` | Delegate a task to another specialized agent |
| `call_subagent` | Call a sub-agent for a specific task |
| `wait_for_subagents` | Wait for one or more background sub-agents to finish |

### Presentation & Slides

| Tool | Description |
|------|-------------|
| `create_slide` | Create a slide in a presentation |
| `create_slide_project` | Create a new slide presentation project |
| `analysis_slide_webpage` | Analyze a slide/presentation webpage |

### Audio & Video

| Tool | Description |
|------|-------------|
| `audio_understanding` | Analyze and transcribe audio content |
| `split_audio` | Split an audio file into segments |
| `setup_audio_project` | Set up an audio processing project |
| `analyze_audio_project` | Analyze an audio project |
| `setup_video_project` | Set up a video processing project |
| `analyze_video_project` | Analyze a video project |
| `convert_video_to_audio` | Extract audio from video |
| `download_youtube_video_media` | Download YouTube video/audio |
| `get_youtube_video_info` | Get YouTube video metadata |

### Browser Operations (Code Mode Only)

| Tool | Description |
|------|-------------|
| `browser_list_sessions` / `browser_list_pages` | Inspect Browser sessions and pages |
| `browser_open_page` / `browser_close_page` / `browser_activate_page` | Manage pages in a Browser session |
| `browser_navigate` / `browser_wait` | Navigate and wait for explicit page conditions |
| `browser_read_page` / `browser_snapshot` / `browser_screenshot` | Read text, inspect page structure, and capture screenshots |
| `browser_click` / `browser_fill` / `browser_press` / `browser_hover` / `browser_scroll` | Interact with snapshot refs |
| `browser_select` / `browser_check` / `browser_upload_file` | Operate form controls and file inputs |
| `browser_visual_query` / `browser_find_visual` | Use visual analysis when structured observation is insufficient |
| `browser_evaluate` / `browser_read_console` / `browser_read_network` | Debug pages and inspect runtime activity |

### Other Tools

| Tool | Description |
|------|-------------|
| `compact_chat_history` | Compress chat history to save context |
| `reflection` | Trigger self-reflection for better reasoning |
| `thinking` | Extended thinking for complex problems |
| `summarize` | Summarize long content |
| `deep_write` | Deep writing with multi-pass refinement |
| `find_skills` | Search for skills by keyword across all sources |
| `read_skills` | Read a skill's SKILL.md content |
| `run_sdk_snippet` | Execute a Python code snippet with sdk.tool access (MCP capabilities exposed as mcp_* tools); intermediate results stay in the execution environment and do not flow through model context |

### IM Channel

| Tool | Description |
|------|-------------|
| `connect_lark_bot` | Connect to a Feishu/Lark bot |
| `connect_dingtalk_bot` | Connect to a DingTalk bot |
| `connect_wecom_bot` | Connect to a WeCom bot |
| `get_im_channel_status` | Get IM channel connection status |

### Design Canvas

| Tool | Description |
|------|-------------|
| `create_canvas` | Create a canvas project |
| `generate_canvas_images` | Generate images directly to canvas |
| `generate_canvas_videos` | Generate videos directly to canvas |
| `search_images_to_canvas` | Search and add images to canvas |

### Data Dashboard

| Tool | Description |
|------|-------------|
| `create_dashboard_project` | Create a dashboard project |
| `create_dashboard_cards` | Create dashboard cards |
| `update_dashboard_cards` | Update dashboard cards |
| `delete_dashboard_cards` | Delete dashboard cards |
| `query_dashboard_cards` | Query dashboard cards |
| `download_dashboard_maps` | Download dashboard map data |
| `validate_dashboard` | Validate dashboard configuration |
