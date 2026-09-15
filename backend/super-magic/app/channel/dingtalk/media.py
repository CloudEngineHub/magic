"""钉钉接收媒体：downloadCode 每次重试重新换取临时链接。"""

import asyncio
import json
import mimetypes
import re
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

import aiohttp

from app.channel.base.media import MediaDownloadError, MediaSource, prepare_media_message, read_response_bytes
from app.channel.base.models import ChannelMediaType
from app.i18n import i18n


def _message_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _escape_markdown(value: str) -> str:
    return re.sub(r"([\\`*_{}\[\]()#+.!|>-])", r"\\\1", value)


def _format_forwarded_time(value: Any) -> str:
    if not isinstance(value, (int, float)):
        return ""
    timestamp = value / 1000 if value > 10_000_000_000 else value
    try:
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    except (OverflowError, OSError, ValueError):
        return ""


def _safe_filename_part(value: str) -> str:
    return re.sub(r'[\\/:*?"<>|\r\n]+', "_", value).strip(" .")[:80]


def _forwarded_filename(participants: list[str]) -> str:
    names = [_safe_filename_part(name) for name in participants if _safe_filename_part(name)]
    suffix = i18n.translate("dingtalk.forwarded_record.filename_suffix")
    title = i18n.translate("dingtalk.forwarded_record.title")
    if names:
        participants_text = i18n.translate(
            "dingtalk.forwarded_record.participants",
            participants=i18n.translate("dingtalk.forwarded_record.participant_separator").join(names[:3]),
        )
        if len(names) > 3:
            participants_text += i18n.translate("dingtalk.forwarded_record.more_participants")
        return f"{title} {participants_text} {suffix}.md"
    return f"{title}.md"


def _parse_rich_text_items(
    items: Any,
    add_media: Callable[[dict, str, bool], None],
    from_quote: bool,
    attachment_index: list[int],
) -> list[str]:
    parts: list[str] = []
    if not isinstance(items, list):
        return parts
    for item in items:
        if not isinstance(item, dict):
            continue
        if isinstance(item.get("text"), str):
            parts.append(_escape_markdown(item["text"]))
            continue
        node_type = item.get("type")
        if node_type in ("paragraph", "lineBreak", "br"):
            parts.append("\n")
            continue
        if node_type == "mention":
            attrs = item.get("attrs") or {}
            label = attrs.get("label") or attrs.get("name") or attrs.get("id")
            parts.append(f"@{label}" if label else "@")
            continue
        if node_type in ("picture", "image") or item.get("pictureDownloadCode") or item.get("downloadCode"):
            attachment_index[0] += 1
            name = item.get("fileName") or f"image-{attachment_index[0]:03d}"
            add_media(item, "picture", from_quote)
            parts.append(
                i18n.translate("dingtalk.forwarded_record.image", index=attachment_index[0], filename=name)
            )
            continue
        if node_type == "file":
            attachment_index[0] += 1
            name = item.get("fileName") or f"file-{attachment_index[0]:03d}"
            add_media(item, "file", from_quote)
            parts.append(
                i18n.translate("dingtalk.forwarded_record.file", index=attachment_index[0], filename=name)
            )
            continue
        parts.append(i18n.translate("dingtalk.forwarded_record.unknown_item"))
    return parts


def _parse_forwarded_chat_record(
    content: dict,
    add_media: Callable[[dict, str, bool], None] | None = None,
) -> tuple[str, list[MediaSource], str]:
    """Parse a DingTalk forwarded record into Markdown text and media sources."""
    sources: list[MediaSource] = []
    participants: list[str] = []
    parts: list[str] = []
    attachment_index = [0]

    def collect_media(item: dict, item_kind: str, from_quote: bool) -> None:
        if add_media is not None:
            source = add_media(item, item_kind, from_quote)
            if source is not None:
                sources.append(source)

    try:
        records = json.loads(content.get("chatRecord") or "[]")
    except (TypeError, json.JSONDecodeError):
        records = []
    if not isinstance(records, list):
        records = []

    for record in records:
        if not isinstance(record, dict):
            continue
        sender = _message_text(record.get("senderNick") or record.get("senderId"))
        if sender and sender not in participants:
            participants.append(sender)
        msg_type = record.get("msgType")
        if sender:
            timestamp = _format_forwarded_time(record.get("createAt"))
            heading = f"**{_escape_markdown(sender)}**"
            if timestamp:
                heading += f" · {timestamp}"
            parts.append(heading)
        if msg_type == "text":
            parts.append(_escape_markdown(_message_text(record.get("content"))))
        elif msg_type == "richText":
            parts.extend(_parse_rich_text_items(record.get("richText"), collect_media, True, attachment_index))
        elif msg_type == "file":
            attachment_index[0] += 1
            name = record.get("fileName") or f"file-{attachment_index[0]:03d}"
            collect_media(record, "file", True)
            parts.append(i18n.translate("dingtalk.forwarded_record.file", index=attachment_index[0], filename=name))
        else:
            parts.append(i18n.translate("dingtalk.forwarded_record.unknown_item"))

    if not parts:
        summary = content.get("summary")
        try:
            summary_items = json.loads(summary) if isinstance(summary, str) else summary
        except json.JSONDecodeError:
            summary_items = []
        if isinstance(summary_items, list):
            parts = [_message_text(item) for item in summary_items if _message_text(item)]
        elif isinstance(summary_items, str) and summary_items.strip():
            parts = [summary_items.strip()]

    body = "\n\n".join(part for part in parts if part).strip()
    return body, sources, _forwarded_filename(participants)


def _parse_chat_record(content: dict) -> str:
    """Compatibility helper returning the readable forwarded record body."""
    body, _, _ = _parse_forwarded_chat_record(content)
    return f"[Forwarded messages]\n{body}" if body else "[Forwarded messages]"


async def prepare_dingtalk_message(payload: dict, client):
    kind = payload.get("msgtype", "")
    content = payload.get("content") or {}
    text = (payload.get("text", {}).get("content") or "").strip() if kind == "text" else ""
    if kind == "text":
        return await prepare_media_message("dingtalk", (payload.get("text", {}).get("content") or "").strip(), [])
    pieces = []
    sources = []
    async with aiohttp.ClientSession() as session:

        def add_media(item, item_kind, from_quote=False):
            code = item.get("downloadCode") or item.get("pictureDownloadCode")
            media_type = {
                "picture": ChannelMediaType.IMAGE,
                "file": ChannelMediaType.FILE,
            }[item_kind]
            name = item.get("fileName") or ""

            async def fetch():
                if not code:
                    raise MediaDownloadError("Media download code is missing.")
                token = await asyncio.to_thread(client.get_access_token)
                if not token:
                    raise MediaDownloadError("DingTalk authentication is unavailable.")
                async with session.post(
                    "https://api.dingtalk.com/v1.0/robot/messageFiles/download",
                    headers={"x-acs-dingtalk-access-token": token},
                    json={"robotCode": payload.get("robotCode") or client.credential.client_id, "downloadCode": code},
                ) as response:
                    data = json.loads(await read_response_bytes(response, max_bytes=1024 * 1024))
                url = data.get("downloadUrl")
                if not url:
                    raise MediaDownloadError("DingTalk did not return a download URL.")
                async with session.get(url) as response:
                    return await read_response_bytes(response)

            return MediaSource(
                media_type=media_type,
                file_name=name,
                mime_type=mimetypes.guess_type(name)[0] or "",
                fetch=fetch,
                from_quote=from_quote,
            )

        def register_media(item, item_kind, from_quote=False):
            sources.append(add_media(item, item_kind, from_quote))

        if kind in ("picture", "file"):
            register_media(content, kind)
        elif kind == "richText":
            pieces.extend(_parse_rich_text_items(content.get("richText"), register_media, False, [0]))
            if not pieces and not sources:
                pieces.append("[Unsupported or empty DingTalk rich text message.]")
        elif kind == "chatRecord":
            record_body, record_sources, filename = _parse_forwarded_chat_record(content, add_media=add_media)
            sources.extend(record_sources)
            markdown = (
                f"# {i18n.translate('dingtalk.forwarded_record.title')}\n\n"
                f"{record_body or i18n.translate('dingtalk.forwarded_record.empty')}\n"
            ).encode("utf-8")

            async def fetch_record() -> bytes:
                return markdown

            sources.append(
                MediaSource(
                    media_type=ChannelMediaType.FILE,
                    file_name=filename,
                    mime_type="text/markdown",
                    fetch=fetch_record,
                    from_quote=True,
                )
            )
            text = i18n.translate("dingtalk.forwarded_record.prompt")
        elif kind != "text":
            pieces.append("[Unsupported DingTalk message type. Please resend as text or a supported attachment.]")
        if pieces:
            text = "\n".join(pieces).strip()
        return await prepare_media_message("dingtalk", text, sources)
