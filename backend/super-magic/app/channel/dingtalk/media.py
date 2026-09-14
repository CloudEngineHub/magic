"""钉钉接收媒体：downloadCode 每次重试重新换取临时链接。"""

import asyncio
import json
import mimetypes

import aiohttp

from app.channel.base.media import MediaDownloadError, MediaSource, prepare_media_message, read_response_bytes
from app.channel.base.models import ChannelMediaType


async def prepare_dingtalk_message(payload: dict, client):
    kind = payload.get("msgtype", "")
    content = payload.get("content") or {}
    text = (payload.get("text", {}).get("content") or "").strip() if kind == "text" else ""
    if kind == "text":
        return await prepare_media_message("dingtalk", (payload.get("text", {}).get("content") or "").strip(), [])
    pieces = []
    sources = []
    async with aiohttp.ClientSession() as session:

        def add_media(item, item_kind):
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

            sources.append(
                MediaSource(
                    media_type=media_type, file_name=name, mime_type=mimetypes.guess_type(name)[0] or "", fetch=fetch
                )
            )

        if kind in ("picture", "file"):
            add_media(content, kind)
        elif kind == "richText":
            for item in content.get("richText", []):
                if item.get("text") is not None:
                    pieces.append(item["text"])
                elif item.get("type") == "picture" or item.get("downloadCode"):
                    add_media(item, "picture")
                else:
                    pieces.append("[Unsupported DingTalk message item.]")
            if not pieces and not sources:
                pieces.append("[Unsupported or empty DingTalk rich text message.]")
        elif kind != "text":
            pieces.append("[Unsupported DingTalk message type. Please resend as text or a supported attachment.]")
        if pieces:
            text = "\n".join(pieces).strip()
        return await prepare_media_message("dingtalk", text, sources)
