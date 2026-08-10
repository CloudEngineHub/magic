# Web Image Search Guide

## Tool: search_canvas_images

Search images from the internet and automatically download and add them to the canvas.

## Required Parameters

| Parameter | Type | Description |
|---|---|---|
| `project_path` | string | Canvas project path |
| `topic_id` | string | Topic ID for deduplication within the same topic |
| `tasks` | list | Search task list |

## Task Object Fields

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Element name. Use the user's language; reflects the specific content being searched. When multiple images are returned, _1 _2 suffixes are added automatically |
| `query` | Yes | Search keywords |
| `requirement_explanation` | No | Requirement explanation to help the search engine understand intended use |
| `expected_aspect_ratio` | No | Expected aspect ratio, e.g. `16:9`, `1:1`, `9:16` |
| `count` | No | Number of images, default 10, maximum 20 |

## Example

```python
from sdk.tool import tool

result = tool.call('search_canvas_images', {
    "project_path": "design-inspiration",
    "topic_id": "home-design",
    "tasks": [
        {
            "name": "minimalist home",
            "query": "minimalist home interior design",
            "requirement_explanation": "Modern minimalist style home interior photos",
            "expected_aspect_ratio": "16:9",
            "count": 10
        }
    ]
})
```

## Deduplication

Use the same `topic_id` for related searches to avoid duplicate images across multiple calls:

```python
from sdk.tool import tool

# First search
tool.call('search_canvas_images', {
    "project_path": "my-project",
    "topic_id": "cats",
    "tasks": [{"name": "cats", "query": "cat pet photography", "count": 10}]
})

# Second search — same topic_id automatically filters already-seen images
tool.call('search_canvas_images', {
    "project_path": "my-project",
    "topic_id": "cats",
    "tasks": [{"name": "cute cats", "query": "cute cat adorable pet", "count": 10}]
})
```

## Multiple Tasks in One Call

```python
from sdk.tool import tool

result = tool.call('search_canvas_images', {
    "project_path": "pet-album",
    "topic_id": "pets",
    "tasks": [
        {
            "name": "dogs",
            "query": "cute dog pet photography",
            "expected_aspect_ratio": "1:1",
            "count": 5
        },
        {
            "name": "cats",
            "query": "cat pet photography",
            "expected_aspect_ratio": "1:1",
            "count": 5
        }
    ]
})
```

## Comparison with AI Generation

| Feature | Web Search | AI Generation |
|---|---|---|
| Speed | Faster | Slower |
| Single batch count | Maximum 20 per task | Maximum 6 tasks |
| Content source | Existing image library | Newly generated |
| Flexibility | Limited by search results | Can customize any content |
| Use case | Need real photos | Need creative content |
