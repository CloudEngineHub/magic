from app.i18n import i18n
from typing import Any, Dict, List, Optional
import asyncio

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from app.core.entity.message.server_message import ToolDetail, DisplayType, FileContent
from agentlang.tools.tool_result import ToolResult
from agentlang.logger import get_logger
from app.tools.core import BaseToolParams, tool
from app.tools.workspace_tool import WorkspaceTool
from app.core.ai_abilities import get_visual_understanding_model_id

# Import utilities from visual_understanding_utils
from app.tools.visual_understanding_utils import (
    ImageProcessResult,
    ImageData,
    ImageDimensionInfo,
    BatchImageProcessingResults,
    ImageProcessor,
    LLMRequestHandler,
    extract_image_source_name,
    format_image_dimensions_info,
    format_download_info_for_content,
    cleanup_copied_files,
)

logger = get_logger(__name__)


def _format_safe_error(error_type: str, action: str) -> str:
    """构造不包含上游原始信息的模型可读错误。"""
    return f"Visual understanding failed. Error type: {error_type}. Action: {action}"


def _classify_visual_request_error(error: Exception) -> str:
    """将上游异常归类为安全、可执行的模型提示。"""
    message = str(error).lower()

    if "unsupportedimageformat" in message or "unsupported image format" in message:
        return _format_safe_error(
            "unsupported image format",
            "convert the image to JPEG, PNG, or WebP, then retry",
        )
    if "invalidparameter" in message or "invalid parameter" in message:
        return _format_safe_error(
            "invalid image input",
            "verify that each image is complete and readable, then retry",
        )
    if LLMRequestHandler.is_request_too_large_error(error):
        return _format_safe_error(
            "request too large",
            "reduce the image count or dimensions, or split the request into smaller batches",
        )
    if any(marker in message for marker in ("rate limit", "rate_limit", "too many requests", "429")):
        return _format_safe_error(
            "rate limited",
            "do not retry immediately; use non-visual evidence when possible, otherwise tell the user that visual analysis is temporarily unavailable",
        )
    if any(marker in message for marker in ("timeout", "timed out", "deadline exceeded")):
        return _format_safe_error(
            "request timeout",
            "retry once with fewer or smaller images; if it fails again, use non-visual evidence or tell the user that visual analysis is unavailable",
        )
    if any(marker in message for marker in ("unauthorized", "forbidden", "authentication", "permission denied", "401", "403")):
        return _format_safe_error(
            "service authorization failure",
            "do not retry unchanged; use non-visual evidence when possible, otherwise tell the user that visual analysis is unavailable",
        )
    if any(marker in message for marker in ("model not found", "model_not_found", "unsupported model", "vision not supported")):
        return _format_safe_error(
            "visual model unavailable",
            "do not retry unchanged; use non-visual evidence when possible, otherwise tell the user that visual analysis is unavailable",
        )
    if any(marker in message for marker in ("connection", "connect error", "network", "dns", "ssl")):
        return _format_safe_error(
            "service connection failure",
            "retry once; if it fails again, use non-visual evidence or tell the user that visual analysis is unavailable",
        )

    return _format_safe_error(
        "upstream service failure",
        "do not retry the same request unchanged; use non-visual evidence when possible, otherwise tell the user that visual analysis is unavailable",
    )


def _classify_image_processing_error(error: str | None) -> str:
    """将图片预处理错误归类，避免把路径、URL 或底层异常写入模型上下文。"""
    message = (error or "").lower()

    if any(marker in message for marker in ("不存在", "not found", "no such file")):
        return _format_safe_error(
            "image not found",
            "provide an existing local image or an accessible image URL, then retry",
        )
    if any(marker in message for marker in ("格式", "unsupported", "invalid image", "invalid content")):
        return _format_safe_error(
            "invalid or unsupported image",
            "provide a readable JPEG, PNG, GIF, WebP, or BMP image, then retry",
        )
    if any(marker in message for marker in ("超时", "timeout", "timed out")):
        return _format_safe_error(
            "image download timeout",
            "retry once or provide a local copy of the image",
        )
    if any(marker in message for marker in ("过大", "too large", "size limit")):
        return _format_safe_error(
            "image too large",
            "reduce the image dimensions or file size, then retry",
        )
    if any(marker in message for marker in ("下载", "download", "connection", "network")):
        return _format_safe_error(
            "image download failure",
            "verify that the image URL is accessible or provide a local image, then retry",
        )

    return _format_safe_error(
        "image preprocessing failure",
        "verify that the image is accessible and readable, then retry with a supported image",
    )


class VisualUnderstandingParams(BaseToolParams):
    images: List[str] = Field(
        ...,
        description="""<!--zh: 图片来源列表，可以是图片URL或本地文件路径，支持多图片输入-->
Image source list, can be image URLs or local file paths, supports multiple image input"""
    )
    query: str = Field(
        ...,
        description="""<!--zh: 关于图片的问题或分析需求，需要详尽且准确，若用户提供了图片分析需求，则需要对用户的分析需求进行逐字引用，并提供必要的分析背景信息-->
Question or analysis requirements about images, needs to be thorough and accurate. If user provides image analysis requirements, quote user's analysis requirements verbatim and provide necessary analysis background information"""
    )


@tool()
class VisualUnderstanding(WorkspaceTool[VisualUnderstandingParams]):
    """<!--zh
    视觉理解工具：调用AI视觉专家来查看、读取、分析或解释图片内容。
    视觉专家无法得知你所知晓的上下文，因此需要提供必要且充足的背景与需求信息。
    对于简单问题，视觉专家可给出答案，不仅限于分析和解释图片本身。

    最佳实践：
    1、分析需求明确时，为视觉专家提供完整的逐字引用的分析需求
    2、简单问题可直接要求视觉专家给出答案（如：与上下文无关的、无需太多背景信息的问题）
    3、无论如何都需要要求视觉专家解释图片内容，以便于检验答案准确性或在复杂场景下辅助推理

    支持格式：JPEG, PNG, GIF, WEBP, BMP, TIFF 等常见图片格式
    适用场景：图片内容识别描述、图表分析解读、文字识别提取、多图片对比等视觉理解场景
    也可用于图片尺寸、格式、大小等信息识别

    要求：
    - 输入图片路径或URL链接，支持同时输入多张图片
    - 提供对图片内容的具体问题或要求描述
    调用示例：
    ```
    # 网址输入
    {
        "images": ["https://example.com/image1.jpg", "https://example.com/image2.jpg"],
        "query": "..." # 输入分析需求
    }
    ```
    或
    ```
    # 本地文件路径输入
    {
        "images": ["./uploads/image1.jpg", "./uploads/image2.jpg"],
        "query": "..." # 输入分析需求
    }
    ```
    -->
    Visual understanding tool: Call AI vision expert to view, read, analyze or interpret image content.
    Vision expert cannot know the context you know, so provide necessary and sufficient background and requirement information.
    For simple questions, vision expert can provide answers, not limited to analyzing and interpreting images themselves.

    Best practices:
    1. When analysis requirements are clear, provide vision expert with complete verbatim quoted analysis requirements
    2. Simple questions can directly ask vision expert for answers (e.g., context-independent questions requiring minimal background)
    3. Always require vision expert to explain image content to verify answer accuracy or assist reasoning in complex scenarios

    Supported formats: JPEG, PNG, GIF, WEBP, BMP, TIFF and other common image formats
    Use scenarios: Image content recognition/description, chart analysis/interpretation, text recognition/extraction, multi-image comparison and other visual understanding scenarios
    Can also be used for image size, format, file size information recognition

    Requirements:
    - Input image paths or URL links, supports inputting multiple images simultaneously
    - Provide specific questions or requirement descriptions about image content
    Usage examples:
    ```
    # URL input
    {
        "images": ["https://example.com/image1.jpg", "https://example.com/image2.jpg"],
        "query": "..." # Input analysis requirements
    }
    ```
    or
    ```
    # Local file path input
    {
        "images": ["./uploads/image1.jpg", "./uploads/image2.jpg"],
        "query": "..." # Input analysis requirements
    }
    ```
    """

    def __init__(self, **data):
        super().__init__(**data)

        # Initialize image processor
        self._image_processor = ImageProcessor()

    async def execute(
        self,
        tool_context: ToolContext,
        params: VisualUnderstandingParams
    ) -> ToolResult:
        """执行视觉理解并返回结果。

        Args:
            tool_context: 工具上下文
            params: 视觉理解参数对象

        Returns:
            ToolResult: 包含视觉理解结果的工具结果
        """
        import re
        params.images = [
            str(self.resolve_path(img)) if not re.match(r'^https?://', img) else img
            for img in params.images
        ]
        return await self.execute_purely(params)

    async def execute_purely(
        self,
        params: VisualUnderstandingParams,
        include_download_info_in_content: bool = True,
        include_dimensions_info_in_content: bool = True,
        skip_format_validation: bool = False
    ) -> ToolResult:
        """执行视觉理解并返回结果。

        Args:
            params: 视觉理解参数对象
            include_download_info_in_content: 是否在content中包含下载状态信息，内部控制参数
            include_dimensions_info_in_content: 是否在content中包含尺寸信息，内部控制参数
            skip_format_validation: 是否跳过图片格式验证（默认 False），内部控制参数。
                适用于刚生成的图片可能包含非标准元数据但实际可以被 PIL 处理的场景。

        Returns:
            ToolResult: 包含视觉理解结果的工具结果
        """
        try:
            # 获取参数
            images = params.images
            query = params.query

            # Get model_id from configuration
            model_id = get_visual_understanding_model_id()

            # 记录视觉理解请求
            # Truncate query for logging to avoid excessive log length
            import json
            truncated_query = (query[:100] + "..." if len(query) > 100 else query).replace('\n', '\\n').replace('\r', '\\r')
            logger.info(f"执行视觉理解: 图片数量={len(images)}, 图片={json.dumps(images, ensure_ascii=False)}, 查询={truncated_query}, 模型={model_id}, 智能下载={self._image_processor.smart_download_enabled}")

            # 检查参数有效性
            if not images:
                return ToolResult.error(
                    _format_safe_error("missing image input", "provide at least one image")
                )

            if not query or not query.strip():
                return ToolResult.error(
                    _format_safe_error("missing analysis request", "provide a question or analysis requirement")
                )

            # 并发处理所有图片来源
            tasks = [
                self._image_processor.process_image_source(
                    image_source,
                    skip_format_validation=skip_format_validation
                )
                for image_source in images
            ]

            logger.debug(f"开始并发处理 {len(tasks)} 张图片")
            try:
                # 并发执行所有图片处理任务
                results = await asyncio.gather(*tasks, return_exceptions=True)
            except Exception as e:
                logger.warning(f"Concurrent image processing failed: {e}")
                return ToolResult.error(_classify_image_processing_error(str(e)))

            # 处理结果 - 使用封装的数据类
            batch_results = BatchImageProcessingResults()

            # 分离成功和失败的图片
            for i, result in enumerate(results):
                image_source = images[i]
                self._process_single_image_result(
                    result, image_source, i, batch_results
                )

            # 检查是否所有图片都失败了
            success_count = batch_results.success_count
            failed_count = batch_results.failed_count
            total_count = batch_results.total_count

            logger.info(f"并发图片处理完成，总数: {total_count}，成功: {success_count}，失败: {failed_count}")

            # 如果是单张图片且失败，直接返回错误
            if total_count == 1 and failed_count == 1:
                failed_result = batch_results.failed_results[0]
                logger.warning(f"Single image processing failed: {failed_result.error}")
                return ToolResult.error(failed_result.error or _classify_image_processing_error(None))

            # 如果所有图片都失败，返回错误
            if success_count == 0:
                logger.warning(f"All image processing attempts failed: count={failed_count}")
                return ToolResult.error(
                    _format_safe_error(
                        "all images failed preprocessing",
                        "remove invalid images or provide accessible images in supported formats, then retry",
                    )
                )

            # 调用 LLM 进行视觉理解
            response = await self._call_llm_for_visual_understanding(
                query=query,
                batch_results=batch_results,
                model_id=model_id,
                images=images
            )

            # 如果返回的是错误结果，直接返回
            if isinstance(response, ToolResult):
                return response

            # 获取视觉理解内容
            content = response.choices[0].message.content

            # Add image dimensions information to the response content
            dimension_info_list = batch_results.get_dimension_info_list()
            dimensions_info = format_image_dimensions_info(dimension_info_list, images)
            if include_dimensions_info_in_content and dimensions_info:
                content = f"{content}\n\n{dimensions_info}"

            # 如果启用了在content中包含下载信息，则追加状态信息
            if include_download_info_in_content:
                download_info_text = format_download_info_for_content(batch_results, images)
                if download_info_text:
                    content = f"{content}\n\n{download_info_text}"

            # 提取图片来源的描述性信息用于展示
            image_source_names = [extract_image_source_name(image) for image in images]

            # 创建结果
            result = ToolResult(
                content=content,
                extra_info={
                    "images": images,
                    "image_source_names": image_source_names,
                    "image_count": len(images),
                    "smart_download_enabled": self._image_processor.smart_download_enabled,
                    "batch_results": batch_results,  # 直接存储批量处理结果对象
                }
            )

            return result

        except Exception as e:
            logger.warning(f"Visual understanding operation failed: {e}")
            return ToolResult.error(_classify_image_processing_error(str(e)))
        finally:
            # 清理复制的文件，保持文件在 .visual 目录中
            await cleanup_copied_files(self._image_processor.copied_files)
            self._image_processor.copied_files.clear()

    async def get_tool_detail(self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] = None) -> Optional[ToolDetail]:
        """
        生成工具详情，用于前端展示

        Args:
            tool_context: 工具上下文
            result: 工具结果
            arguments: 工具参数

        Returns:
            Optional[ToolDetail]: 工具详情
        """
        if not result.content:
            return None

        try:
            image_count = result.extra_info.get("image_count", 0) if result.extra_info else 0

            title = i18n.translate("visual_understanding.title", category="tool.messages")
            if image_count == 1:
                image_source_name = result.extra_info.get("image_source_names", ["图片"])[0] if result.extra_info else "图片"
                title = i18n.translate("visual_understanding.single", category="tool.messages", image_name=image_source_name)
            elif image_count > 1:
                title = i18n.translate("visual_understanding.multiple", category="tool.messages", count=image_count)

            # 返回Markdown格式的视觉理解内容
            return ToolDetail(
                type=DisplayType.MD,
                data=FileContent(
                    file_name=i18n.translate("visual_understanding.result_file", category="tool.messages"),
                    content=f"## {title}\n\n{result.content}"
                )
            )
        except Exception as e:
            logger.error(f"生成工具详情失败: {e!s}")
            return None

    def _get_remark_content(self, result: ToolResult, arguments: Dict[str, Any] = None) -> str:
        """获取备注内容"""
        if not arguments or "images" not in arguments:
            return i18n.translate("visual_understanding_webpage.success", category="tool.messages")

        images = arguments["images"]
        image_count = len(images) if isinstance(images, list) else 1

        if image_count == 1:
            image_source_name = extract_image_source_name(images[0])
            return i18n.translate("visual_understanding.completed", category="tool.messages", image_name=image_source_name)
        else:
            return i18n.translate("visual_understanding.multiple_images", category="tool.messages", count=image_count)

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Dict[str, Any] = None
    ) -> Dict:
        """获取工具调用前的友好动作和备注"""
        action = i18n.translate("visual_understanding_ing", category="tool.actions")

        images = arguments.get("images", []) if arguments else []
        image_count = len(images) if isinstance(images, list) else 0

        if image_count == 1:
            image_source_name = extract_image_source_name(images[0])
            remark = i18n.translate("visual_understanding.analyzing", category="tool.messages", image_name=image_source_name)
        elif image_count > 1:
            remark = i18n.translate("visual_understanding.analyzing_multiple", category="tool.messages", count=image_count)
        else:
            remark = ""

        return {"action": action, "remark": remark}

    async def get_after_tool_call_friendly_action_and_remark(self, tool_name: str, tool_context: ToolContext, result: ToolResult, execution_time: float, arguments: Dict[str, Any] = None) -> Dict:
        """获取工具调用后的友好动作和备注"""
        if not result.ok:
            return {
                "action": i18n.translate("visual_understanding", category="tool.actions"),
                "remark": i18n.translate("visual_understanding.error", category="tool.messages", error=result.content)
            }

        return {
            "action": i18n.translate("visual_understanding", category="tool.actions"),
            "remark": self._get_remark_content(result, arguments)
        }

    async def _call_llm_for_visual_understanding(
        self,
        query: str,
        batch_results: BatchImageProcessingResults,
        model_id: str,
        images: List[str]
    ) -> Any:
        """调用 LLM 进行视觉理解

        Args:
            query: 用户查询
            batch_results: 批量处理结果
            model_id: 模型ID
            images: 原始图片列表（用于日志）

        Returns:
            LLM 响应对象，或者 ToolResult.error() 如果失败
        """

        try:
            response = await LLMRequestHandler.call_with_fallback(
                model_id=model_id,
                user_prompt=query,
                batch_results=batch_results
            )
        except Exception as llm_error:
            # 原始异常仅进入内部日志；模型侧只返回脱敏后的错误分类和应对措施。
            logger.warning(
                f"Visual understanding LLM request failed (model={model_id}, image_count={len(images)}): "
                f"{llm_error}"
            )
            return ToolResult.error(_classify_visual_request_error(llm_error))

        # 处理响应
        if not response or not response.choices or len(response.choices) == 0:
            return ToolResult.error(
                _format_safe_error(
                    "empty model response",
                    "retry once; if the response is still empty, use non-visual evidence or tell the user that visual analysis is unavailable",
                )
            )

        return response

    def _process_single_image_result(
        self,
        result: Any,
        image_source: str,
        index: int,
        batch_results: BatchImageProcessingResults
    ) -> None:
        """处理单个图片的处理结果

        Args:
            result: 图片处理结果（可能是Exception、ImageProcessResult或其他类型）
            image_source: 图片来源
            index: 图片索引（从0开始）
            batch_results: 批量处理结果对象
        """
        # 处理异常结果
        if isinstance(result, Exception):
            logger.warning(f"Image processing raised an exception for {image_source}: {result}")
            batch_results.add_failed_image(
                index=index + 1,
                source=image_source,
                name=extract_image_source_name(image_source),
                error=_classify_image_processing_error(str(result))
            )
            return

        # 处理ImageProcessResult结果
        if isinstance(result, ImageProcessResult):
            if not result.success or not result.image_data:
                # 处理失败
                logger.warning(
                    f"Image processing failed for {image_source}: "
                    f"{result.error_message or 'unknown preprocessing error'}"
                )
                error_message = _classify_image_processing_error(result.error_message)

                batch_results.add_failed_image(
                    index=index + 1,
                    source=image_source,
                    name=extract_image_source_name(image_source),
                    error=error_message,
                    download_result=result.download_result
                )
            else:
                # 处理成功
                image_data = ImageData.from_dict(result.image_data)
                dimension_info = ImageDimensionInfo(
                    size=result.image_size,
                    aspect_ratio=result.aspect_ratio,
                    file_size=result.file_size
                )
                batch_results.add_successful_image(
                    index=index + 1,
                    source=image_source,
                    name=extract_image_source_name(image_source),
                    image_data=image_data,
                    dimension_info=dimension_info,
                    download_result=result.download_result,
                    copied_file_info=result.copied_file_info
                )
            return

        # 处理未知结果类型
        logger.warning(f"Image processing returned an unknown result type for {image_source}: {type(result)}")
        batch_results.add_failed_image(
            index=index + 1,
            source=image_source,
            name=extract_image_source_name(image_source),
            error=_classify_image_processing_error(None)
        )
