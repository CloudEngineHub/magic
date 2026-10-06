import asyncio
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.ai_abilities import get_visual_understanding_model_id
from app.core.entity.attachment import AttachmentStorageType
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.path_manager import PathManager
from app.service.native_visual_message_builder import NativeVisualMessageBuilder
from app.tools.core import BaseToolParams, tool

# Import utilities from visual_understanding_utils
from app.tools.visual_understanding_utils import (
    BatchImageProcessingResults,
    ImageData,
    ImageDimensionInfo,
    ImageProcessor,
    ImageProcessResult,
    LLMRequestHandler,
    cleanup_copied_files,
    extract_image_source_name,
    format_download_info_for_content,
    format_image_dimensions_info,
)
from app.tools.workspace_tool import WorkspaceTool

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
        description="""<!--zh: 图片URL或本地文件路径，支持多张。支持原生视觉时，本地图片会加载到你自己的视野；URL 始终交给独立视觉模型分析-->
Image URLs or local file paths; multiple images allowed. With native vision, local images load into your own view; URLs are always analyzed by the separate vision model"""
    )
    query: str = Field(
        ...,
        description="""<!--zh: 要从图片中看什么、回答什么。独立视觉模型看不到你的上下文：需写清必要背景；用户提出过图片分析要求时逐字引用；可要求它同时描述所见内容，便于你核对答案-->
What to look for or answer about the images. The separate vision model cannot see your context: include the needed background, quote the user's image requirements verbatim when they gave any, and you may ask it to describe what it sees so you can check its answer"""
    )


@tool()
class VisualUnderstanding(WorkspaceTool[VisualUnderstandingParams]):
    """<!--zh
    查看你当前看不到的图片，并理解其内容。

    按当前模型能力，结果有两种：
    - 原生视觉：本地图片加载到你自己的视野，工具返回 "Please read the image(s)."，图片连同尺寸和文件大小出现在下一轮，由你直接看图作答。
    - 其他情况（URL 图片，或模型不支持原生视觉）：由独立视觉模型分析并返回答案。

    不要调用：
    - 图片已在你的上下文中可见：用户在聊天中上传的图片，或之前用本工具加载且仍可见的图片。直接看图；再调用只会重复加载同一张图。
    - 同一批图片不要调用第二次。

    需要调用：图片只以路径或 URL 存在，例如工作区或画布文件、需要检查的生成结果、超出系统首批加载数量的附件、之前出现过但现在已看不到的图片。

    支持 JPEG、PNG、GIF、WEBP、BMP、TIFF 等常见格式。可用于描述内容、读取图表和文字、多图对比，以及查看尺寸、格式、文件大小。

    调用示例：
    ```
    {
        "images": ["./uploads/image1.jpg", "./uploads/image2.jpg"],
        "query": "..."
    }
    ```
    -->
    View and understand images you cannot currently see.

    The outcome depends on the current model:
    - Native vision: local images load into your own view. The tool returns "Please read the image(s)." and the images appear in your next turn with their dimensions and file sizes; look at them and answer yourself.
    - Otherwise (URL images, or a model without native vision): a separate vision model analyzes the images and returns its answer.

    Do not call:
    - When the image is already visible in your context: the user attached it in chat, or you loaded it with this tool earlier and it is still shown. Look at it directly; calling again only reloads the same image.
    - A second time for the same batch of images.

    Call when the image exists only as a path or URL: workspace or canvas files, generated results you need to check, attachments beyond the first batch the system loaded, or images seen earlier that are no longer shown.

    Supports JPEG, PNG, GIF, WEBP, BMP, TIFF and other common formats. Use it to describe content, read charts and text, compare images, and check dimensions, format and file size.

    Usage example:
    ```
    {
        "images": ["./uploads/image1.jpg", "./uploads/image2.jpg"],
        "query": "..."
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
        params.images = [self._resolve_image_input(image) for image in params.images]
        return await self.execute_purely(
            params,
            tool_context=tool_context,
            provide_native_visual=True,
        )

    def _resolve_image_input(self, image: str) -> str:
        """将本地图片解析到当前工作区，保留远程 URL 原样。"""
        if re.match(r"^https?://", image):
            return image
        path = Path(image)
        if path.is_absolute():
            return str(path.resolve())
        return str(self.resolve_path(image))

    async def execute_purely(
        self,
        params: VisualUnderstandingParams,
        include_download_info_in_content: bool = True,
        include_dimensions_info_in_content: bool = True,
        skip_format_validation: bool = False,
        tool_context: Optional[ToolContext] = None,
        provide_native_visual: bool = False,
    ) -> ToolResult:
        """执行视觉理解并返回结果。

        Args:
            params: 视觉理解参数对象
            include_download_info_in_content: 是否在content中包含下载状态信息，内部控制参数
            include_dimensions_info_in_content: 是否在content中包含尺寸信息，内部控制参数
            skip_format_validation: 是否跳过图片格式验证（默认 False），内部控制参数。
                适用于刚生成的图片可能包含非标准元数据但实际可以被 PIL 处理的场景。
            tool_context: 工具上下文；只有与 provide_native_visual 同时提供时才启用原生视觉。
            provide_native_visual: 是否允许将图片作为原生视觉输入注入下一轮模型请求，默认关闭。

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

            if await self._inject_native_visual_user_message(
                tool_context,
                images,
                query,
                provide_native_visual=provide_native_visual,
            ):
                # 工具结果只保留最小动作提示，原生视觉机制说明统一由 Horizon 承载。
                return ToolResult(
                    content="Please read the image(s).",
                    extra_info={
                        "images": images,
                        "image_source_names": [extract_image_source_name(image) for image in images],
                        "image_count": len(images),
                        "native_visual": True,
                    },
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

    async def _inject_native_visual_user_message(
        self,
        tool_context: Optional[ToolContext],
        images: List[str],
        query: str,
        *,
        provide_native_visual: bool,
    ) -> bool:
        """在满足条件时构造并登记带图片元数据的原生视觉 UserMessage。"""
        if not provide_native_visual or tool_context is None:
            return False
        agent_context = tool_context.get_extension("agent_context")
        if agent_context is None:
            return False
        try:
            model_state = agent_context.model_context.resolve_text_model()
            if not model_state.config.supports_multimodal:
                return False
            workspace_dir = PathManager.get_workspace_dir().resolve()
            for image in images:
                if re.match(r"^https?://", image):
                    return False
            message_builder = NativeVisualMessageBuilder(workspace_dir)
            message = await message_builder.build_user_message(
                query,
                images,
                show_in_ui=False,
                source="native_visual",
            )
            agent_context.horizon.push_user_message(message)
            return True
        except (AttributeError, ValueError, OSError):
            return False

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

            if result.extra_info and result.extra_info.get("native_visual") and image_count == 1:
                image_path = Path(result.extra_info["images"][0])
                workspace_dir = PathManager.get_workspace_dir().resolve()
                try:
                    relative_path = image_path.resolve().relative_to(workspace_dir).as_posix()
                except ValueError:
                    return None
                return ToolDetail(
                    type=DisplayType.IMAGE,
                    data=FileContent(
                        file_name=image_path.name,
                        content="",
                        relative_file_path=relative_path,
                        storage_type=AttachmentStorageType.WORKSPACE,
                    ),
                )

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
