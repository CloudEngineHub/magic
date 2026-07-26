# Super Magic Tools Reference

This document lists the tools available to AI in super-magic skills, with descriptions, parameter schemas, and Python call examples.

All tool calls use this format:

```python
from sdk.tool import tool

result = tool.call('tool_name', {
    "param": "value"
})

if result.ok:
    data = result.data  # dict or None
else:
    error = result.content  # error message string
```

---

## Web Search & Fetch

### web_search

Search the internet. Use during Interview to research best practices, API docs, and similar skill patterns.
Works without a browser.

**Schema:**

```json
{
  "topic_id": "string (required) — Use the same topic_id for the same search topic to deduplicate results",
  "requirements_xml": "string (required) — XML-formatted search requirements, see example below"
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

Fetch a webpage and convert it to Markdown. Useful for reading documentation and technical articles.

**Schema:**

```json
{
  "urls": "string[] (required) — List of webpage URLs to read",
  "requirements": "string (optional) — Extraction requirements; empty returns raw content, non-empty extracts per requirements"
}
```

```python
from sdk.tool import tool

result = tool.call('read_webpages_as_markdown', {
    "urls": ["https://example.com/docs/api"],
    "requirements": "Extract API endpoint descriptions and parameter lists"
})
```

### download_from_urls

Code Mode-only tool for reliable single or batch downloads. Use the built-in `download` skill for the complete workflow. Do not add this tool or the internal `download_from_url` tool to an Agent `tools:` list.

**Schema:**

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
    "downloads": [
        {"url": "https://example.com/a.csv", "file_path": "data/a.csv"},
        {"url": "https://example.com/b.csv", "file_path": "data/b.csv"},
    ]
})
print(result.content)
```

---

## Vision

### visual_understanding

Analyze image content. Useful for user screenshots, design mockups, flow diagrams.

**Schema:**

```json
{
  "images": "string[] (required) — List of image URLs or local file paths; supports multiple images",
  "query": "string (required) — Analysis question or requirement for the images"
}
```

```python
from sdk.tool import tool

result = tool.call('visual_understanding', {
    "images": [".workspace/screenshot.png"],
    "query": "Describe the workflow shown in this screenshot"
})
```

### video_understanding

Analyze video content. Useful for video files or video URLs uploaded by users.

**Schema:**

```json
{
  "videos": "string[] (required) — List of video URLs or local file paths; supports multiple videos",
  "query": "string (required) — Analysis question or requirement for the videos"
}
```

```python
from sdk.tool import tool

result = tool.call('video_understanding', {
    "videos": ["https://example.com/demo.mp4"],
    "query": "Describe the operation workflow shown in this video"
})
```

### visual_understanding_webpage

Screenshot a webpage and analyze its content visually. Supports local HTML files and remote URLs.
Auto-fetches page HTML (up to 16K tokens) alongside the screenshot for more accurate analysis.
Useful for verifying generated HTML reports render correctly.

**Schema:**

```json
{
  "target": "string (required) — Local HTML file path (relative to working directory) or remote URL",
  "query": "string (required) — Analysis question or requirement for the webpage content"
}
```

```python
from sdk.tool import tool

# Check local HTML file
result = tool.call('visual_understanding_webpage', {
    "target": ".workspace/output/report.html",
    "query": "Check whether this report renders correctly and charts display properly"
})

# Analyze remote webpage
result = tool.call('visual_understanding_webpage', {
    "target": "https://example.com",
    "query": "Analyze the main content and layout structure of this webpage"
})
```

---

## Code Execution

### shell_exec

Execute shell commands. Common uses: run Python scripts, file operations, eval scripts.

**Schema:**

```json
{
  "command": "string (required) — Shell command to execute",
  "cwd": "string | null (optional) — Working directory for the command; defaults to workspace root",
  "timeout": "integer (optional, default 60) — Timeout in seconds"
}
```

```python
from sdk.tool import tool

# Run skill-creator's own scripts (cwd uses the skill directory's absolute path)
result = tool.call('shell_exec', {
    "command": "python scripts/aggregate_benchmark.py <workspace-skills-dir>/my-skill/evals/iteration-1 --skill-name my-skill",
    "cwd": "<skill-creator-absolute-path>",
    "timeout": 120
})

# Run workspace skill's own script (cwd uses relative path)
result = tool.call('shell_exec', {
    "command": "python scripts/process.py",
    "cwd": "<workspace-skills-dir>/my-skill"
})
```

### run_python_snippet

Run Python code directly without writing a file first. Useful for lightweight data processing and calling internal project APIs.

**Schema:**

```json
{
  "purpose": "string (required) — User-readable purpose in the user's current language, 4–16 characters after trimming",
  "python_code": "string (required) — Python code to execute",
  "cwd": "string | null (optional) — Working directory; defaults to workspace root, relative paths resolve from workspace, absolute paths are used as provided",
  "timeout": "integer (optional, default 60) — Timeout in seconds"
}
```

```python
from sdk.tool import tool

result = tool.call('run_python_snippet', {
    "purpose": "Format metadata",
    "python_code": """
import json

data = {"name": "my-skill", "version": "1.0"}
print(json.dumps(data, indent=2))
"""
})
```

---

## Image Generation & Search

### generate_images

Batch text-to-image generation and image editing. Each task produces one image; all tasks run concurrently.
- `reference_images` empty: text-only generation
- `reference_images` non-empty: reference-based generation / editing

**Schema:**

```json
{
  "tasks": [
    {
      "prompt": "string (required) — Image description; recommend including subject, style, composition, lighting, color tone",
      "name": "string (required) — Output filename (without extension)",
      "output_path": "string (required) — Save directory, relative to workspace root",
      "size": "string (optional) — Image size 'WxH'; can be omitted when reference_images is provided (auto-uses largest reference image size); required without reference images, e.g. '2048x2048', '2560x1440', '1440x2560'",
      "reference_images": "string[] (optional) — List of reference image paths, relative to workspace root"
    }
  ]
}
```

```python
from sdk.tool import tool

# Text-to-image
result = tool.call('generate_images', {
    "tasks": [
        {
            "prompt": "A minimalist flat-design icon for a travel planning app, blue and white color scheme",
            "name": "travel_icon",
            "output_path": "images",
            "size": "2048x2048"
        }
    ]
})

# Reference-based editing
result = tool.call('generate_images', {
    "tasks": [
        {
            "prompt": "Change the background to pure white",
            "name": "result",
            "output_path": "images",
            "reference_images": ["images/original.png"]
        }
    ]
})
```

### image_search

Search for high-quality images by keyword. Returned count may be less than requested.

**Schema:**

```json
{
  "topic_id": "string (required) — Use the same topic_id for the same search topic to deduplicate images",
  "requirements_xml": "string (required) — XML-formatted image search requirements, see example below"
}
```

```python
from sdk.tool import tool

result = tool.call('image_search', {
    "topic_id": "travel-report-images",
    "requirements_xml": """<requirements>
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
