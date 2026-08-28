# Browser Sessions and Pages

Read [SKILL.md](../SKILL.md) first. This reference contains the exact signatures for session, page, navigation, waiting, and lifecycle tools.

## Tool Signatures

All tools except `browser_list_sessions` accept optional `session_id`. Omit it to use the current Agent's default Browser session.

```python
browser_list_sessions()
browser_list_pages(session_id: str | None = None)
browser_open_page(session_id: str | None = None, url: str = "about:blank")
browser_activate_page(page_id: str, session_id: str | None = None)
browser_navigate(
    page_id: str,
    url: str,
    wait_until: "commit" | "domcontentloaded" | "load" | "networkidle" = "domcontentloaded",
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
browser_keep_alive(page_id: str, seconds: float, session_id: str | None = None)
browser_close_page(page_id: str, session_id: str | None = None)
```

`browser_open_page` creates the default isolated session when needed and navigates to `url`. Do not navigate to the same URL again. Use `browser_navigate` to change an existing page or when explicit navigation waiting is required.

For `browser_wait`, use the narrowest condition that proves the next step can proceed:

- `time` requires `duration_ms`.
- `url`, `text`, and `ref` require `value`.
- `load_state` requires `state`: `commit`, `domcontentloaded`, `load`, or `networkidle`.
- `text` optionally accepts `state`: `attached`, `detached`, `visible`, or `hidden`.
- `ref` optionally accepts `state`: `attached`, `detached`, `visible`, `hidden`, `enabled`, or `disabled`.
- `duration_ms` is valid only for `time`.

When a wait fails, read its complete content and inspect the current page before retrying. A redirect, consent screen, CAPTCHA, or other intermediate page may have replaced the expected destination.

## Selecting a Session

Omit `session_id` for the normal isolated Browser used by the current Agent.

Call `browser_list_sessions` when the user asks to use an authorized browser, more than one session may exist, or a previous session disconnected. Select only a connected session returned by the tool. Do not invent session IDs.

Call `browser_list_pages` only when the task should reuse a page opened earlier. For a new URL, call `browser_open_page` directly. Use only opaque `page_id` values returned by Browser tools.

Session lists are in `result.data["sessions"]`; page lists are in `result.data["pages"]`. Every page item uses `page_id`.

## Page Lifetime

- Normal operations automatically renew a sandbox page's idle lease.
- An idle sandbox page normally expires after about 10 minutes.
- `browser_keep_alive` can extend a page for a known long-running step, up to one hour per call.
- If a page expired, list pages and reopen or navigate a page. Old refs are invalid.
- Authorized user tabs do not use the sandbox page expiry rule.

Do not keep pages alive speculatively. Do not create periodic renewals unless the task genuinely needs the same page later.

## Capabilities

Read the selected session's capabilities before depending on optional behavior such as labeled screenshots, console, network, upload, or downloads. If a required capability is unavailable, use a documented alternative or explain the limitation.

## Ownership

- Activating a page selects it; it does not navigate.
- Closing a page affects only that page.
- Leave task-created pages open after the task unless the user asks to close them or resource pressure requires cleanup. Sandbox TTL closes idle pages automatically.
- Do not close a user-owned tab unless the user asked.

After a disconnect or reconnect, list sessions and pages again. Do not reuse refs from the previous connection.
