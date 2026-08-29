"""旧版 Canvas 编解码器兼容层。

本模块计划在下一版本随 ``app.tools.design`` 一并删除。
"""

from app.tools.design.codec.envelope_codec import (
    CanvasEnvelopeCodec,
    UnsupportedCanvasVersionError,
)
from app.tools.design.codec.v3_codec import V3CanvasCodec

__all__ = ["CanvasEnvelopeCodec", "UnsupportedCanvasVersionError", "V3CanvasCodec"]
