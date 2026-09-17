"""微信历史上下文兼容；新增渠道复用公共媒体模型。"""
from app.channel.base.models import ChannelMediaContext, ChannelMediaType

WechatMediaType = ChannelMediaType


class WechatMediaContext(ChannelMediaContext):
    """保留微信旧调用方使用的绝对路径。"""

    absolute_path: str
