# Authorized User Browser

Read [SKILL.md](../SKILL.md) and [sessions.md](sessions.md) first.

Use an authorized user browser only when the user asks to operate their existing browser state, such as a signed-in page or an already-open tab.

1. Call `browser_list_sessions`.
2. Select a connected authorized-browser session.
3. If none exists, tell the user to connect their browser and authorize the required tab through the product UI.
4. Call `browser_list_pages` with that session ID.
5. Operate only returned pages.

Do not request or expose connection endpoints, pairing data, browser history, cookies, or unrelated tabs. Do not close a user tab unless the user asked. Stop when the user disconnects or revokes authorization.
