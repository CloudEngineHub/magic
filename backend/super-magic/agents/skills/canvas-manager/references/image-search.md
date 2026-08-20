# Image Search and Import

Use `search_canvas_images` only when the user asks to search for external image candidates and import them into the Canvas.

The tool searches without writing Canvas state, downloads each candidate into the project workspace, validates the media, and then creates imported Image Elements. Candidates that fail download or validation are not materialized. Results may be partial; keep successful Elements and report failed items.

Use the exact `topic_id` for follow-up calls. The same topic deduplicates by source URL, so repeating a successful search does not create duplicate imported Content. Retry only the failed item after the user asks for a retry; do not replay the whole batch automatically.

Code Mode example:

```python
from sdk.tool import tool

result = tool.call("search_canvas_images", {
    "project_path": "Canvas/Product Launch",
    "topic_id": "product-hero",
    "tasks": [{
        "item_ref": "hero-candidates",
        "name": "Product hero candidates",
        "query": "premium product studio photography",
        "expected_aspect_ratio": "16:9",
        "count": 3
    }]
})
print(result.content)
```

After a successful or partial result, use the exact returned Element IDs with `query_canvas_element_details` before using an imported image as a generation reference or Connection endpoint.
