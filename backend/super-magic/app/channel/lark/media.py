"""飞书用户消息资源必须使用 messages/resources，不能用机器人上传资源接口。"""

import json
import mimetypes
from urllib.parse import quote

import aiohttp

from app.channel.base.media import MediaDownloadError, MediaSource, prepare_media_message, read_response_bytes
from app.channel.base.models import ChannelMediaType


async def prepare_lark_message(kind: str, content: dict, message_id: str, app_id: str, app_secret: str):
    if kind == "text":
        return await prepare_media_message("lark", (content.get("text") or "").strip(), [])
    pieces = []
    sources = []
    async with aiohttp.ClientSession() as session:

        def add_media(item, media_type, key):
            name = item.get("file_name") or ""

            async def fetch():
                if not key or not message_id:
                    raise MediaDownloadError("Lark message resource key is missing.")
                async with session.post(
                    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
                    json={"app_id": app_id, "app_secret": app_secret},
                ) as response:
                    data = json.loads(await read_response_bytes(response, max_bytes=1024 * 1024))
                token = data.get("tenant_access_token")
                if not token:
                    raise MediaDownloadError("Lark authentication is unavailable.")
                url = f"https://open.feishu.cn/open-apis/im/v1/messages/{quote(message_id, safe='')}/resources/{quote(key, safe='')}"
                async with session.get(
                    url,
                    headers={"Authorization": f"Bearer {token}"},
                    params={"type": "image" if media_type == ChannelMediaType.IMAGE else "file"},
                    allow_redirects=False,
                ) as response:
                    if response.status == 403:
                        raise MediaDownloadError(
                            "Lark resource access denied; enable im:resource permission.", status=403
                        )
                    if response.headers.get("Content-Type", "").split(";")[0] == "application/json":
                        data = await read_response_bytes(response)
                        error = json.loads(data)
                        if isinstance(error, dict) and error.get("code") and "msg" in error:
                            raise MediaDownloadError(
                                "Lark resource unavailable; verify im:resource permission and resend the attachment."
                            )
                        return data
                    return await read_response_bytes(response)

            sources.append(
                MediaSource(
                    media_type=media_type, file_name=name, mime_type=mimetypes.guess_type(name)[0] or "", fetch=fetch
                )
            )

        if kind == "text":
            pieces.append(content.get("text") or "")
        elif kind == "post":
            # 接收事件通常直接提供 title/content；兼容发送格式的语言包装，只取一份避免重复。
            post = content
            if "content" not in post:
                post = next((v for v in content.values() if isinstance(v, dict) and "content" in v), {})
            if post.get("title"):
                pieces.append(post["title"])
            for row in post.get("content", []):
                row_text = []
                for item in row:
                    tag = item.get("tag")
                    if tag in ("text", "a"):
                        row_text.append(item.get("text") or item.get("href") or "")
                    elif tag == "at":
                        row_text.append(item.get("user_name") or "")
                    elif tag == "img":
                        add_media(item, ChannelMediaType.IMAGE, item.get("image_key"))
                    elif tag == "media":
                        add_media(item, ChannelMediaType.VIDEO, item.get("file_key"))
                    else:
                        row_text.append("[Unsupported Lark post item.]")
                if row_text:
                    pieces.append("".join(row_text))
            if not pieces and not sources:
                pieces.append("[Unsupported or empty Lark post message.]")
        elif kind in ("image", "file", "audio", "media"):
            media_type = {
                "image": ChannelMediaType.IMAGE,
                "file": ChannelMediaType.FILE,
                "audio": ChannelMediaType.VOICE,
                "media": ChannelMediaType.VIDEO,
            }[kind]
            add_media(content, media_type, content.get("image_key" if kind == "image" else "file_key"))
        else:
            pieces.append("[Unsupported Lark message type. Please resend as text or a supported attachment.]")
        return await prepare_media_message("lark", "\n".join(pieces).strip(), sources)
