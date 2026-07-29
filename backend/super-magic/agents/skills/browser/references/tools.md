# Browser Tools

Read [SKILL.md](../SKILL.md) first. All tools in this reference are Code Mode only and must be called through `sdk.tool.call(...)`.

The schemas below describe the stable Agent-facing intent. Check `result.ok`, use exact structured fields from `result.data`, and read `result.content` for errors and next-step guidance. Fields may be absent when the selected backend does not support the capability or the event did not occur.

Every tool except `browser_list_sessions` accepts optional `session_id`. Omit it to use the current Agent's default Browser session.

## Sessions and Pages

```python
browser_list_sessions()
browser_list_pages(session_id: str | None = None)
browser_open_page(session_id: str | None = None, url: str = "about:blank")
browser_close_page(page_id: str, session_id: str | None = None)
browser_activate_page(page_id: str, session_id: str | None = None)
```

- Omit `session_id` to use the current Agent's default Browser session.
- `browser_list_sessions` returns backend, state, capabilities, browser identity, expiry, and pages for each available session.
- `browser_open_page` creates the default isolated session when needed and navigates to `url`. Read its page ID from `result.data["page_id"]`.
- When `browser_open_page` receives the target URL, do not call `browser_navigate` to the same URL again. Use `browser_navigate` to change an existing page or when explicit navigation waiting is required.
- Closing a page does not close the session. Do not close a user-owned Chrome tab unless the user requested it.

## Navigation and Waiting

```python
browser_navigate(
    page_id: str,
    url: str,
    wait_until: "commit" | "domcontentloaded" | "load" | "networkidle" = "domcontentloaded",
    session_id: str | None = None,
)

browser_keep_alive(
    page_id: str,
    seconds: float,
    session_id: str | None = None,
)

browser_wait(
    page_id: str,
    condition: "time" | "url" | "load_state" | "text" | "ref" | "download",
    timeout_ms: float = 30000,
    value: str | None = None,
    duration_ms: float | None = None,
    state: str | None = None,
    session_id: str | None = None,
)
```

Use the narrowest condition that proves the page is ready. Avoid fixed time waits when URL, page state, text, ref state, or download completion expresses the real condition.

Use `browser_keep_alive` only for a known long-running step. Each call is capped by the runtime; normal page operations already renew the idle lease.

- `time` requires `duration_ms`.
- `url`, `text`, and `ref` require `value`; for a ref wait, pass the exact ref as `value`.
- `load_state` requires `state`: `commit`, `domcontentloaded`, `load`, or `networkidle`.
- `text` optionally accepts `state`: `attached`, `detached`, `visible`, or `hidden`.
- `ref` optionally accepts `state`: `attached`, `detached`, `visible`, `hidden`, `enabled`, or `disabled`.
- `duration_ms` is valid only for `time`; other wait conditions reject it.

## Page Observation

```python
browser_read_page(
    page_id: str,
    scope: "viewport" | "full" = "viewport",
    session_id: str | None = None,
)

browser_snapshot(
    page_id: str,
    scope: "interactive" | "viewport" | "subtree" | "full" | "changes" = "interactive",
    ref: str | None = None,
    session_id: str | None = None,
)

browser_screenshot(
    page_id: str,
    labels: bool = False,
    full_page: bool = False,
    session_id: str | None = None,
)

browser_visual_query(
    page_id: str,
    query: str,
    full_page: bool = False,
    session_id: str | None = None,
)

browser_find_visual(
    page_id: str,
    target: str,
    session_id: str | None = None,
)
```

- `browser_read_page` runs Lens inside the page. It returns rendered content, not raw HTML or a DOM snapshot.
- `browser_snapshot(scope="subtree")` requires `ref`.
- `browser_snapshot(scope="changes")` compares with the previous compatible snapshot for that page.
- `browser_screenshot(labels=True)` returns a short-lived overlay screenshot and a `label -> ref` mapping. It does not create a second interaction identity system.
- `browser_screenshot` captures and displays an image but does not analyze it. Continue from its page and label results; it does not return a reusable local file path.
- `browser_visual_query` captures and analyzes the page in one call. Use it instead of chaining `browser_screenshot` to another visual tool.
- Prefer `browser_snapshot` for controls and page state. Use visual tools when appearance or spatial layout matters.

## Interaction

```python
browser_click(page_id: str, ref: str, session_id: str | None = None)
browser_fill(page_id: str, ref: str, value: str, session_id: str | None = None)
browser_press(page_id: str, key: str, ref: str | None = None, session_id: str | None = None)
browser_hover(page_id: str, ref: str, session_id: str | None = None)
browser_scroll(
    page_id: str,
    ref: str | None = None,
    delta_x: float = 0,
    delta_y: float = 0,
    session_id: str | None = None,
)
browser_select(page_id: str, ref: str, value: str, session_id: str | None = None)
browser_check(page_id: str, ref: str, checked: bool = True, session_id: str | None = None)
browser_upload_file(page_id: str, ref: str, file_paths: list[str], session_id: str | None = None)
```

- Use a ref from the latest relevant snapshot.
- Every interaction except `browser_press` and page-level `browser_scroll` requires a ref.
- `browser_press` without a ref sends the key to the current page focus. Pass a ref only to focus that control immediately before pressing.
- `browser_scroll` with a ref scrolls the referenced container or element; without a ref it scrolls the page.
- Page-level `browser_scroll` requires at least one non-zero delta. To only bring an element into view, pass its ref and leave both deltas at zero.
- Workspace file paths for upload are resolved by the Super Magic adapter. A remote Chrome backend may report file upload as unsupported.
- After an interaction, inspect `navigation`, `opened_pages`, `downloads`, `dialogs`, and `snapshot_diff` in `result.data` before deciding the next step.

## Development and Diagnostics

```python
browser_evaluate(
    page_id: str,
    expression: str,
    argument: JSON | None = None,
    session_id: str | None = None,
)
browser_read_console(page_id: str, clear: bool = True, session_id: str | None = None)
browser_read_network(page_id: str, clear: bool = True, session_id: str | None = None)
```

- Use `browser_evaluate` for targeted page inspection or application-specific JavaScript. Do not use it to replace Lens, snapshots, or normal interactions.
- Console and network calls read the backend buffer. Keep `clear=True` for incremental reads; use `clear=False` only when the same entries must remain available for another call.
- Do not print large payload bodies, cookies, authorization headers, or secrets.

## Structured Result Expectations

Common fields in `result.data` include:

- `page_id`
- `snapshot_id`
- `session` or `sessions`
- `page` or `pages`
- `snapshot`
- `action`
- `screenshot`
- `label_to_ref`
- `console_entries`
- `network_entries`

Use top-level handle fields for the next call. Read nested objects only when detailed metadata is needed. Plural results use arrays such as `result.data["pages"]` and `result.data["sessions"]`.

Treat the tool's actual structured response as authoritative. Inspect keys and small samples when a field is unavailable; do not print the entire data object when it may contain a large snapshot or screenshot.
