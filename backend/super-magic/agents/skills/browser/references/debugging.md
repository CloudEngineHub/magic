# Browser Debugging

Read [SKILL.md](../SKILL.md) first. Use diagnostic tools only when page behavior, JavaScript, console output, or network activity is relevant to the user's task.

## JavaScript Evaluation

`browser_evaluate` runs targeted JavaScript in the selected page.

Use it for:

- reading application state that the rendered page does not expose;
- checking a precise DOM or JavaScript condition during development;
- invoking an application-provided function when the user explicitly needs it;
- lightweight inspection after a local page edit.

Do not use it to:

- implement a second Markdown reader;
- recreate the accessibility or DOM snapshot collector;
- locate and click elements instead of using refs;
- send arbitrary CDP commands;
- access another origin, unauthorized tab, cookie store, password, or secret.

Keep expressions focused and return small serializable values. Do not return a complete DOM tree or large application state object.

```python
result = tool.call("browser_evaluate", {
    "page_id": page_id,
    "expression": "() => ({ title: document.title, ready: document.readyState })",
})
print(result.content)
```

## Console

Use `browser_read_console` when the task involves runtime errors, warnings, logs, or client-side behavior. The default `clear=True` returns buffered entries and removes them, so later calls are incremental.

Do not expose secrets found in console output. Summarize the relevant errors and preserve exact error text only when it is safe and useful.

## Network

Use `browser_read_network` when the task involves failed requests, status codes, redirects, API timing, downloads, or page loading behavior.

The default `clear=True` returns buffered entries and removes them. Use `clear=False` only when another call must inspect the same buffer.

Prefer metadata such as method, sanitized URL, status, resource type, timing, and failure reason. Do not print authorization headers, cookies, request bodies containing secrets, or large response bodies.

## Failure Handling

- Stale ref: take a new snapshot.
- Page not found: list pages and select the current page explicitly.
- Session disconnected: list sessions; resume only through the product connection flow.
- Unsupported capability: read session capabilities and use a documented alternative.
- Navigation timeout: inspect the current URL and page state before retrying. Do not assume the navigation failed completely.
- Script injection or Lens failure: report the error. Do not silently replace Lens with a server-side converter.
- User interruption: stop the workflow. Do not retry through a fallback path.

## Output Control

Browser diagnostics can be large. Inspect counts and a small number of entries first. Filter in Code Mode and print only evidence relevant to the user's question.
