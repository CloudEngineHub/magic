"""生成结果到主协议字段的映射器。"""

from typing import Any


class GenerationResultMapper:
    """把生成结果映射为主文件允许的 Content 字段。"""

    @staticmethod
    def to_content_fields(status: str, output_uri: str | None, error_message: str | None) -> dict[str, Any]:
        """生成只包含状态、结果地址和错误信息的回写字段。"""
        fields: dict[str, Any] = {"status": status}
        if output_uri:
            fields["src"] = output_uri
        if error_message:
            fields["errorMessage"] = error_message
        return fields
