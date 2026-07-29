# Browser Sessions and Pages

Read [SKILL.md](../SKILL.md) first.

## Selecting a Session

Omit `session_id` for the normal isolated Browser used by the current Agent.

Call `browser_list_sessions` when the user asks to use an authorized browser, more than one session may exist, or a previous session disconnected. Select only a connected session returned by the tool. Do not invent session IDs.

Call `browser_list_pages` only when the task should reuse a page opened earlier. For a new URL, call `browser_open_page` directly. Use only opaque `page_id` values returned by Browser tools.

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
