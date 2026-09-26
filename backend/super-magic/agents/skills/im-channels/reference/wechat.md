# WeChat Official ClawBot Connection

## Requirements

- Use a current WeChat mobile client on iOS or Android with ClawBot access. QR login and delivery depend on the installed client version and account availability.
- No bot ID or secret is required. Login is completed fully through QR confirmation.

## Flow

Connecting is one turn, not a sequence of steps. The reply that carries the QR code must also carry the `wait_wechat_login` call. A reply containing only the QR ends your turn — the user then scans and gets no response until they message you again.

Create the session with `run_sdk_snippet`:

```python
from sdk.tool import tool

result = tool.call("connect_wechat_bot", {})
print(result.content)
```

Then, in one single reply: output the tool's markdown verbatim (no extra prose) and call `wait_wechat_login` within that same reply.

```python
from sdk.tool import tool

result = tool.call("wait_wechat_login", {
    "timeout_seconds": 300
})
print(result.content)
```

Handle the wait result:

- A fresh QR block — output it verbatim and call `wait_wechat_login` again in the same reply.
- Success — tell the user to send `hi` in the WeChat ClawBot chat.
- Timeout or failure — relay it and stop.

## Reply Format After Connection

Final replies are sent to WeChat automatically. Markdown is converted to readable text on delivery; do not assume HTML or Markdown renders as rich text in the client. Use the sending tool below for messages or files that must arrive before the final reply.

### Send messages through Code Mode

Only the current main-agent WeChat inbound run can use this tool. It cannot send
from a Web run, a sub-agent, a scheduled run, or to an arbitrary recipient.

```python
from sdk.tool import tool

result = tool.call("send_wechat_message", {
    "items": [
        {"kind": "text", "text": "The report is ready."},
        {"kind": "file", "path": "reports/report.html"},
        {"kind": "file", "path": "reports/notes.md"},
        {"kind": "text_file", "path": "reports/summary.txt", "format": "plain"},
    ]
})
print(result.content)
```

- `text`: one message from `text`.
- `file`: one workspace attachment from `path`, with optional `filename`. Markdown and HTML files can be sent as attachments without rewriting their contents. Files need a synchronized MagicFS identity so the same attachment can appear on Web.
- `text_file`: read the entire UTF-8 file as one message. It does not attach the file; use a separate `file` item when the original file is needed.
- `text` and `text_file` accept `format`: `plain` (default), `markdown` (converted to readable text), or `html` (tags removed, entities decoded, scripts/styles excluded). The converted text is also used for the Web mirror.
- Paths must stay inside the current workspace and cannot traverse symbolic links. Remote URLs are not accepted by this tool.
- Items are sent in order. Read `result.content`: it identifies sent, failed, unknown, and unattempted items. Do not repeat confirmed sends or automatically retry unknown delivery.

Choose message boundaries yourself: make multiple calls or provide multiple
`text` items. The default local budget is 4,000 UTF-8 bytes per message (roughly
1,300 Chinese characters or 4,000 ASCII characters); mixed text and emoji vary.
This is a conservative local policy, not a verified server limit. If
`text_too_long` is returned, use the reported budget to divide the complete
content. The delivery layer never automatically splits or truncates it.

Tool messages are delivered immediately and mirrored to Web. Your final reply
will also be sent to WeChat. If all intended content has already been successfully
delivered and nothing remains to say, output only `<no_reply>` as the entire
final reply, without a code fence or other text. A progress update alone does
not replace the final answer. Never use it to hide failed, partial, or uncertain
delivery. If Web mirroring fails after WeChat succeeds, do not resend the WeChat
message to repair the Web record.

### Splitting into multiple messages

Use `<split>` between meaningful sections of a final reply to send separate messages. Prefer placing it on its own line. Use `<split delay="1">` only when a specific pause is useful. The same length budget applies to each section.

```
The first part of the result.

<split>

The second part of the result.

<split delay="1">

The remaining details.
```

- `delay` is in seconds (float); omitting it defaults to 0.5s; recommended range is 0.5–1.5s
- Each segment is sent as an independent WeChat message
- Keep segments meaningful in size — avoid splitting too finely or using long delays, as this makes the overall reply feel slow
- Use splitting for long content or deliberate message boundaries; short answers normally need no split.
- Tags in code examples, inline code, or quoted text are literal content and do not control delivery.

To send media, embed the corresponding tag directly in your reply:

| Type | Tag |
|------|-----|
| Image | `![description](path)` |
| Video | `<video src="path"></video>` |
| Audio file (attachment) | `<audio src="path"></audio>` |
| Generic file attachment | `<file src="path"></file>` |

- `<audio>` — the user receives a downloadable audio file attachment. Use this to share any audio content.
- `<file>` accepts an optional `filename` attribute: `<file src="path" filename="display-name.pdf"></file>`.
- `<audio>` also accepts an optional `filename` attribute: `<audio src="path" filename="display-name.mp3"></audio>`.

Path values — prefer **workspace-relative paths** (relative to the `.workspace` directory):

```
charts/output.png             ← workspace-relative (recommended)
records/reply.wav
uploads/report.pdf
```

Absolute paths and remote URLs also work:

```
/absolute/path/to/file.jpg
https://example.com/audio.mp3
```

Example reply with an image:

```
Here is the chart:

![monthly trend](charts/trend.png)

Let me know if you need any adjustments.
```

Example reply with an audio attachment:

```
Here is the recording:

<audio src="records/meeting.mp3" filename="meeting-2026-04-03.mp3"></audio>
```

- Do not put media tags inside fenced code blocks.
- Multiple media tags in one reply are sent in order; the text before the first tag is sent as a caption.

## Notes

- The QR has a limited lifetime. When it expires, the wait tool returns a fresh QR block to output.
- Each workspace can bind only one WeChat account.
- To restart the flow explicitly, call the start tool with `force_refresh: true`.

## Session Expiry

If the channel status shows `session_expired`, it usually means the user scanned a QR code on a different MagiClaw instance, so the current session was kicked off. This is not an error — it just means the WeChat account is now linked elsewhere. Let the user know casually and offer to reconnect if they want.
