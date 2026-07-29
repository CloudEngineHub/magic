---
name: browser
description: Use when a task requires opening or controlling web pages, reading rendered page content, interacting with forms and controls, inspecting browser console or network activity, or using an authorized remote Chrome tab.
---

# Browser

Call Browser tools from one Python snippet through `run_sdk_snippet`:

```python
from sdk.tool import tool
```

Pass only fields required by the task. Omit optional fields to use the safe defaults.

## Open and Read

For a new URL, call `browser_open_page` directly. It creates the default isolated session when needed and opens the supplied URL. Do not list sessions first or navigate to the same URL again.

```python
page = tool.call("browser_open_page", {"url": "https://example.com"})
if not page.ok:
    raise RuntimeError(page.content)

page_id = page.data["page_id"]
content = tool.call("browser_read_page", {"page_id": page_id})
if not content.ok:
    raise RuntimeError(content.content)

print(content.content)
```

Use `browser_list_pages` only to reuse a page opened earlier. Use `browser_list_sessions` only to select an authorized user Browser, handle multiple sessions, or recover from a disconnected session.

## Choose One Observation

- Read text and rendered content: `browser_read_page`.
- Find controls and obtain refs: `browser_snapshot`.
- Answer a question about layout, images, charts, canvas, maps, or other visual content: `browser_visual_query`.
- Find a visually described control when the snapshot is insufficient: `browser_find_visual`.
- Create or show a screenshot without analyzing it: `browser_screenshot`.

Do not call `browser_screenshot` and then manually pass its file to another visual tool. Call `browser_visual_query` directly when the task requires visual understanding.

## Interact

Take the default interactive snapshot, use exact refs from that snapshot, then verify the result:

```python
snapshot = tool.call("browser_snapshot", {"page_id": page_id})
if not snapshot.ok:
    raise RuntimeError(snapshot.content)

field_ref = "<ref-from-snapshot>"
submit_ref = "<ref-from-snapshot>"

filled = tool.call("browser_fill", {
    "page_id": page_id,
    "ref": field_ref,
    "value": "example query",
})
if not filled.ok:
    raise RuntimeError(filled.content)

submitted = tool.call("browser_click", {
    "page_id": page_id,
    "ref": submit_ref,
})
if not submitted.ok:
    raise RuntimeError(submitted.content)

changes = tool.call("browser_snapshot", {
    "page_id": page_id,
    "scope": "changes",
})
print(changes.content)
```

Use `browser_press` with `key="Enter"` when pressing Enter is the page's normal submission behavior. After `browser_fill`, omit `ref` so the key goes to the current focus even if the page replaced the input node:

```python
filled = tool.call("browser_fill", {
    "page_id": page_id,
    "ref": field_ref,
    "value": "example query",
})
if not filled.ok:
    raise RuntimeError(filled.content)

submitted = tool.call("browser_press", {
    "page_id": page_id,
    "key": "Enter",
})
if not submitted.ok:
    raise RuntimeError(submitted.content)
```

Pass `ref` to `browser_press` only when the task must focus a different control first. Do not add waits unless the task has a specific completion condition.

## Human Verification and Blocked Pages

When a page shows a CAPTCHA, unusual-traffic warning, human-verification step, or equivalent challenge:

1. Stop automated interaction. Do not bypass, solve, or script around the challenge.
2. If the user explicitly says they can interact with the visible or authorized Browser, keep the page open, tell them what must be completed, and wait for their confirmation.
3. Otherwise, do not wait indefinitely. Try a legitimate alternative suited to the task, such as a direct target URL, another source, a dedicated search or data tool, or an authorized user Browser.
4. If no valid alternative exists, explain that the page is blocked and what remains incomplete.
5. After the user completes verification, take a fresh page read or snapshot before continuing. Previous refs may be stale.

Honor an explicit user instruction to wait for manual verification. Do not assume the user can interact with a sandbox page unless they say so.

## Visual Failures

If `browser_visual_query` is unavailable, use `browser_read_page` or `browser_snapshot` when text or structure can answer the question. If the question requires appearance or spatial layout, report that visual analysis is unavailable instead of claiming the screenshot was understood.

## Refs and Results

- Refs are opaque and belong to one page and document state. Never construct or edit them.
- After navigation or a stale, missing, or ambiguous ref error, take a fresh snapshot.
- Never replace a ref with a CSS selector, XPath, coordinate, or guessed text match on the normal interaction path.
- Always check `result.ok` and read the complete `result.content` on failure.
- Common handles are top-level in `result.data`: `page_id` and `snapshot_id`.
- Detailed objects remain under keys such as `page`, `snapshot`, `action`, and `screenshot`.
- An action outcome of `dispatched` means the input was sent; verify the page before claiming the business result succeeded.

Leave pages open after the task unless the user asks to close them or resource pressure requires cleanup. Normal page operations renew sandbox page lifetime automatically.

## Required Rules

- Operate only pages and tabs authorized for the current Browser session.
- Do not expose connection endpoints, pairing tokens, resume tokens, cookies, passwords, or browser history.
- Do not print raw protocol payloads, complete DOM snapshots, accessibility trees, or screenshot bytes into model context.
- Do not use `browser_evaluate` to replace normal reading, snapshot, ref interaction, or authorization boundaries.
- Use `browser_keep_alive` only when a known long-running step must retain the same sandbox page.

## References

- Complete tool signatures: [references/tools.md](references/tools.md)
- Snapshots, refs, changes, and labeled screenshots: [references/snapshots.md](references/snapshots.md)
- Sessions, pages, lifecycle, and capabilities: [references/sessions.md](references/sessions.md)
- Console, network, JavaScript, and troubleshooting: [references/debugging.md](references/debugging.md)
- Authorized user Chrome sessions: [references/remote-chrome.md](references/remote-chrome.md)
