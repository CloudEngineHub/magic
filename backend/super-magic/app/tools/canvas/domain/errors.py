"""Canvas 领域错误和稳定错误码。"""


class CanvasDomainError(ValueError):
    """携带模型可见稳定错误码的 Canvas 业务错误。"""

    def __init__(self, code: str, message: str):
        """初始化错误码和可读原因。"""
        super().__init__(message)
        self.code = code
        self.message = message


class CanvasProtocolError(CanvasDomainError):
    """表示主文件协议无法解析或校验失败的内部错误。"""


def canvas_error(code: str, message: str) -> CanvasDomainError:
    """创建统一的 Canvas 业务错误。"""
    return CanvasDomainError(code, message)
