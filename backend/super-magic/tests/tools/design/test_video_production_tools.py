"""视频制作 V3 工具与跨版本查询测试。"""

import asyncio
from pathlib import Path

import pytest
from PIL import Image
from pydantic import ValidationError

from agentlang.context.tool_context import ToolContext
from agentlang.path_manager import PathManager
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType
from app.core.models.agent_model_context import AgentModelContext
from app.core.models.agent_model_selection import AgentModelSelection
from app.core.models.media_model import ImageModelSizeSpec, ImageModelSpec, VideoModelSpec
from app.tools.design.codec.v3_codec import MAGIC_PROJECT_VERSION_V3
from app.tools.design.domain.canvas_document import (
    CanvasConnection,
    CanvasDocumentV3,
    CanvasElementV3,
    MagicProjectConfigV3,
)
from app.tools.design.domain.content import ElementContent
from app.tools.design.domain.generation_finalizer import (
    CanvasGenerationFinalizationContext,
)
from app.tools.design.domain.services.canvas_query_service import CanvasQueryService
from app.tools.design.manager.canvas_manager_factory import get_canvas_manager
from app.tools.design.manager.canvas_manager_v3 import CanvasManagerV3, write_magic_project_js_v3
from app.tools.design.tools.compose_canvas_video import ComposeCanvasVideo
from app.tools.design.tools.configure_video_edit import (
    ConfigureVideoEdit,
    ConfigureVideoEditParams,
    VideoEditOutputInput,
)
from app.tools.design.tools.generate_canvas_images import (
    GenerateCanvasImages,
    GenerateCanvasImagesParams,
    ImageTaskSpec,
)
from app.tools.design.tools.generate_video_production_images import (
    GenerateVideoProductionImages,
    GenerateVideoProductionImagesParams,
    VideoProductionImageTask,
)
from app.tools.design.tools.generate_video_production_videos import (
    GenerateVideoProductionVideos,
    GenerateVideoProductionVideosParams,
    VideoProductionVideoTask,
)
from app.tools.design.tools.promote_canvas_content import (
    PromoteCanvasContent,
    PromoteCanvasContentParams,
)
from app.tools.design.tools.query_canvas_elements import QueryCanvasElements, QueryCanvasElementsParams
from app.tools.design.tools.upsert_canvas_audio import (
    UpsertCanvasAudio,
    UpsertCanvasAudioParams,
)
from app.tools.design.tools.upsert_storyboard import (
    StoryboardGenerationConfigInput,
    StoryboardShotInput,
    UpsertStoryboard,
    UpsertStoryboardParams,
)
from app.tools.design.utils.magic_project_design_parser import (
    CanvasConfig,
    ImageElement,
    MagicProjectConfig,
    write_magic_project_js,
    write_magic_project_js_v2,
)
from app.tools.design.video_production.service.media_generation_service import (
    MediaSourceType,
    PreparedMediaSource,
)
from app.tools.design.video_production.service.source_connection_finalizer import (
    SourceConnectionGenerationFinalizer,
)
from app.utils.async_file_utils import async_mkdir, async_write_bytes


def _content_element(
    element_id: str,
    element_type: str,
    *,
    name: str,
    fields: dict,
) -> CanvasElementV3:
    """构造带单个 main Content 的模拟 V3 Element。"""
    content_id = f"{element_id}-content-1"
    return CanvasElementV3(
        id=element_id,
        type=element_type,
        properties={
            "name": name,
            "x": 0,
            "y": 0,
            "width": 320,
            "height": 180,
            "zIndex": 1,
        },
        contents=[ElementContent(content_id=content_id, fields=fields)],
        active_content_id=content_id,
        main_content_id=content_id,
    )


def _v3_config(*elements: CanvasElementV3) -> MagicProjectConfigV3:
    """构造不包含真实媒体数据的模拟 V3 配置。"""
    return MagicProjectConfigV3(
        version=MAGIC_PROJECT_VERSION_V3,
        type="design",
        name="视频制作模拟项目",
        canvas=CanvasDocumentV3(elements=list(elements)),
    )


def _legacy_config(version: str, name: str) -> MagicProjectConfig:
    """构造用于跨版本查询与写能力门禁的模拟旧版配置。"""
    return MagicProjectConfig(
        version=version,
        type="design",
        name=name,
        canvas=CanvasConfig(
            elements=[
                ImageElement(
                    id=f"{version}-image",
                    type="image",
                    name=f"{name}模拟图片",
                    x=10,
                    y=20,
                    width=320,
                    height=180,
                    zIndex=1,
                    visible=True,
                    src="./images/query-mock.png",
                    status="completed",
                )
            ]
        ),
    )


def _image_generation_tool_context(
    *,
    model_id: str = "mock-image-model",
    sizes: tuple[ImageModelSizeSpec, ...] = (
        ImageModelSizeSpec(label="16:9", scale="1K", value="1280x720"),
        ImageModelSizeSpec(label="9:16", scale="1K", value="720x1280"),
    ),
) -> ToolContext:
    """构造带当前图片模型和尺寸能力的模拟工具上下文。"""
    model_context = AgentModelContext()
    model_context.apply_selection(
        AgentModelSelection(
            configured_text_model_id="mock-text-model",
            text_model_id="mock-text-model",
            image_model=ImageModelSpec(model_id=model_id, sizes=sizes),
        )
    )
    tool_context = ToolContext()
    tool_context.register_extension(
        "agent_context",
        type(
            "MockAgentContext",
            (),
            {
                "model_context": model_context,
                "get_workspace_dir": lambda self: str(PathManager.get_workspace_dir()),
            },
        )(),
    )
    return tool_context


def _video_generation_tool_context() -> ToolContext:
    """构造带当前视频模型的模拟工具上下文。"""
    def get_interruption_event(_: object) -> asyncio.Event:
        """返回未触发的模拟中断事件。"""
        return asyncio.Event()

    model_context = AgentModelContext()
    model_context.apply_selection(
        AgentModelSelection(
            configured_text_model_id="mock-text-model",
            text_model_id="mock-text-model",
            video_model=VideoModelSpec.from_values(
                model_id="mock-video-model",
                video_generation_config={"sizes": [{"value": "640x360"}]},
            ),
        )
    )
    tool_context = ToolContext()
    tool_context.register_extension(
        "agent_context",
        type(
            "MockAgentContext",
            (),
            {
                "model_context": model_context,
                "get_workspace_dir": lambda self: str(PathManager.get_workspace_dir()),
                "get_interruption_event": get_interruption_event,
            },
        )(),
    )
    return tool_context


async def _resolve_mock_reference_images_to_urls(
    image_paths: list[str],
    base_dir: Path,
) -> tuple[list[str], list[str]]:
    """在单元测试中把本地参考图转换为模拟可访问地址。"""
    del base_dir
    return [f"https://mock.local/{Path(path).name}" for path in image_paths], []


@pytest.fixture
def workspace(monkeypatch, tmp_path: Path) -> Path:
    """把 Canvas manager 的工作区切换到隔离临时目录。"""
    monkeypatch.setattr(PathManager, "get_workspace_dir", lambda: tmp_path)
    return tmp_path


@pytest.mark.asyncio
async def test_canvas_query_service_supports_v1_v2_v3_batches(workspace: Path):
    """精确查询服务按原版本读取 V1、V2、V3，并返回完整 Content。"""
    for project_name in ("v1-query", "v2-query", "v3-query"):
        await async_mkdir(workspace / project_name, parents=True, exist_ok=True)
    await write_magic_project_js("v1-query", _legacy_config("1.0.0", "V1"))
    await write_magic_project_js_v2("v2-query", _legacy_config("2.0.0", "V2"))
    v3_image = _content_element(
        "v3-image",
        "image",
        name="V3 模拟图片",
        fields={"src": "./images/query-mock.png", "status": "completed"},
    )
    v3_image.contents.append(
        ElementContent(
            content_id="v3-image-content-2",
            fields={"src": "./images/query-candidate.png", "status": "completed"},
        )
    )
    v3_image.active_content_id = "v3-image-content-2"
    v3_video = _content_element(
        "v3-video",
        "video",
        name="V3 模拟视频",
        fields={"src": "./videos/query-mock.mp4", "status": "completed"},
    )
    v3_config = _v3_config(v3_image, v3_video)
    v3_config.canvas.connections.append(
        CanvasConnection(
            id="connection-query-mock",
            source_element_id="v3-image",
            target_element_id="v3-video",
        )
    )
    await write_magic_project_js_v3("v3-query", v3_config)

    service = CanvasQueryService()
    v1_result = await service.query(
        "v1-query",
        element_ids=["1.0.0-image"],
    )
    v2_result = await service.query(
        "v2-query",
        element_ids=["2.0.0-image"],
    )
    v3_result = await service.query(
        "v3-query",
        element_ids=["missing-image", "v3-image"],
    )

    assert v1_result.version == "1.0.0"
    assert v2_result.version == "2.0.0"
    assert v3_result.version == "3.0.0"
    assert v1_result.elements[0].contents[0].content_id == "1.0.0-image"
    assert v2_result.elements[0].element_id == "2.0.0-image"
    assert [content.content_id for content in v3_result.elements[0].contents] == [
        "v3-image-content-1",
        "v3-image-content-2",
    ]
    assert v3_result.elements[0].active_content_id == "v3-image-content-2"
    assert v3_result.elements[0].main_content_id == "v3-image-content-1"
    assert v3_result.missing_element_ids == ["missing-image"]
    assert len(v3_result.connections) == 1
    assert v3_result.connections[0].target_element_id == "v3-video"


def test_query_canvas_elements_params_only_accept_one_to_ten_exact_ids():
    """查询工具只接受一到十个非空 Element ID，并保持精简参数契约。"""
    with pytest.raises(ValidationError):
        QueryCanvasElementsParams(project_path="mock-project", element_ids=[])
    with pytest.raises(ValidationError):
        QueryCanvasElementsParams(
            project_path="mock-project",
            element_ids=[f"element-{index}" for index in range(11)],
        )
    with pytest.raises(ValidationError):
        QueryCanvasElementsParams(project_path="mock-project", element_ids=[" "])

    params = QueryCanvasElementsParams(
        project_path="mock-project",
        element_ids=[" element-1 ", "element-1", "element-2"],
    )

    assert params.element_ids == ["element-1", "element-2"]
    assert set(QueryCanvasElementsParams.model_fields) == {"project_path", "element_ids"}


@pytest.mark.asyncio
async def test_query_canvas_elements_content_contains_reusable_content_fields(workspace: Path):
    """查询结果正文包含后续工具所需的 Content ID、媒体路径和业务状态。"""
    project_name = "query-content-contract-project"
    await async_mkdir(workspace / project_name, parents=True, exist_ok=True)
    image = _content_element(
        "image-1",
        "image",
        name="模拟首帧",
        fields={
            "src": "./images/first-frame.png",
            "status": "completed",
            "generateImageRequest": {
                "prompt": "模拟首帧提示词",
                "size": "1280x720",
            },
        },
    )
    await write_magic_project_js_v3(project_name, _v3_config(image))

    result = await QueryCanvasElements(base_dir=str(workspace)).execute(
        None,
        QueryCanvasElementsParams(
            project_path=project_name,
            element_ids=["image-1", "missing-image"],
        ),
    )

    assert result.ok
    assert 'element_id: "image-1"' in result.content
    assert 'active_content_id: "image-1-content-1"' in result.content
    assert 'src: "./images/first-frame.png"' in result.content
    assert 'status: "completed"' in result.content
    assert 'generateImageRequest.prompt: "模拟首帧提示词"' in result.content
    assert 'Element IDs not found: "missing-image".' in result.content
    assert "zIndex" not in result.content
    assert "connection_id" not in result.content


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tool_class", "arguments", "result_data"),
    [
        (
            QueryCanvasElements,
            {"project_path": "mock-project", "element_ids": ["image-1"]},
            {"elements": [], "connections": [], "missing_element_ids": ["image-1"]},
        ),
        (
            UpsertStoryboard,
            {"project_path": "mock-project", "name": "模拟分镜", "shots": [{"id": "S01"}]},
            {
                "element_id": "storyboard-1",
                "content_id": "storyboard-content-1",
                "shot_count": 1,
                "connection_ids": [],
            },
        ),
        (
            GenerateVideoProductionImages,
            {"project_path": "mock-project", "tasks": [{"name": "模拟首帧"}]},
            {
                "succeeded_count": 1,
                "failed_count": 0,
                "connections": [],
                "created_elements": [],
            },
        ),
        (
            GenerateVideoProductionVideos,
            {"project_path": "mock-project", "tasks": [{"name": "模拟镜头"}]},
            {
                "succeeded_count": 1,
                "failed_count": 0,
                "connections": [],
                "created_elements": [],
            },
        ),
        (
            PromoteCanvasContent,
            {"project_path": "mock-project", "element_id": "image-1", "content_id": "content-2"},
            {"element_id": "image-1", "content_id": "content-2"},
        ),
        (
            UpsertCanvasAudio,
            {"project_path": "mock-project", "name": "模拟旁白", "src": "audio/mock.mp3"},
            {"element_id": "audio-1", "content_id": "audio-content-1", "src": "./audio/mock.mp3"},
        ),
        (
            ConfigureVideoEdit,
            {
                "project_path": "mock-project",
                "name": "模拟成片",
                "video_sequence": ["video-1"],
                "audio_sequence": [],
            },
            {
                "element_id": "video-edit-1",
                "content_id": "video-edit-content-1",
                "video_sequence": ["video-1"],
                "audio_sequence": [],
                "output": {"format": "mp4"},
            },
        ),
        (
            ComposeCanvasVideo,
            {
                "project_path": "mock-project",
                "video_edit_element_id": "video-edit-1",
                "result_name": "模拟最终成片",
            },
            {
                "result_element_id": "final-video-1",
                "result_content_id": "final-video-content-1",
                "src": "./videos/final.mp4",
                "width": 1920,
                "height": 1080,
                "duration_seconds": 12.5,
                "has_audio": True,
            },
        ),
    ],
)
async def test_video_production_tools_define_independent_markdown_presentations(
    tool_class,
    arguments: dict,
    result_data: dict,
):
    """每个视频制作工具都必须独立提供面向用户的 Markdown 展示。"""
    for method_name in (
        "get_before_tool_call_friendly_action_and_remark",
        "get_after_tool_call_friendly_action_and_remark",
        "get_tool_detail",
    ):
        assert method_name in tool_class.__dict__

    tool = tool_class(base_dir=".workspace")
    result = ToolResult(content="MODEL_ONLY_CONTENT", data=result_data)
    before = await tool.get_before_tool_call_friendly_action_and_remark(
        tool_class.__name__,
        None,
        arguments,
    )
    after = await tool.get_after_tool_call_friendly_action_and_remark(
        tool_class.__name__,
        None,
        result,
        0.1,
        arguments,
    )
    detail = await tool.get_tool_detail(None, result, arguments)

    assert "**" in before["action"]
    assert any(marker in before["remark"] for marker in ("**", "`", "\n-"))
    assert "**" in after["action"]
    assert result.use_custom_remark
    assert detail.type == DisplayType.MD
    assert detail.data.content.startswith("# ")
    assert "MODEL_ONLY_CONTENT" not in detail.data.content


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("project_name", "version", "writer"),
    [
        ("v1-write-gate", "1.0.0", write_magic_project_js),
        ("v2-write-gate", "2.0.0", write_magic_project_js_v2),
    ],
)
async def test_video_tool_resolves_legacy_projects_through_unified_manager(
    workspace: Path,
    project_name: str,
    version: str,
    writer,
):
    """视频工具通过统一入口解析旧项目，不向模型暴露版本门禁。"""
    await async_mkdir(workspace / project_name, parents=True, exist_ok=True)
    await writer(project_name, _legacy_config(version, project_name))
    tool = PromoteCanvasContent(base_dir=str(workspace))

    resolved_path, manager, error_result = await tool._get_canvas_manager(project_name)

    assert resolved_path == workspace / project_name
    assert manager is not None
    assert not manager.supports_content_versions()
    assert error_result is None


@pytest.mark.asyncio
async def test_upsert_storyboard_creates_content_and_locked_image_connection(workspace: Path):
    """Storyboard 工具创建节点、内嵌 Content、内部布局和锁定图片连接。"""
    project_name = "storyboard-project"
    await async_mkdir(workspace / project_name, parents=True, exist_ok=True)
    await write_magic_project_js_v3(
        project_name,
        _v3_config(
            _content_element(
                "shot-image-1",
                "image",
                name="第一镜头首帧",
                fields={"src": "./images/shot-1.png", "status": "completed"},
            )
        ),
    )
    tool = UpsertStoryboard(base_dir=str(workspace))

    result = await tool.execute(
        _image_generation_tool_context(),
        UpsertStoryboardParams(
            project_path=project_name,
            name="通用视频分镜",
            generation_config=StoryboardGenerationConfigInput(
                aspect_ratio="16:9",
                resolution="1K",
            ),
            shots=[
                StoryboardShotInput(
                    id="S01",
                    duration_seconds=4,
                    description="模拟镜头描述",
                    output_image_element_id="shot-image-1",
                )
            ],
        ),
    )

    assert result.ok
    manager = await tool._get_canvas_manager(project_name)
    config = await manager[1].read_current_canvas()
    storyboard = config.canvas.get_element(result.data["element_id"])
    assert storyboard is not None
    assert storyboard.type == "storyboard"
    assert storyboard.get_active_content().fields["shots"][0]["id"] == "S01"
    assert storyboard.get_active_content().fields["generationConfig"] == {
        "model_id": "mock-image-model",
        "size": "1280x720",
        "resolution": "1K",
        "image_generation_config": {"aspect_ratio": "16:9"},
    }
    assert 'model_id: "mock-image-model"' in result.content
    assert 'aspect_ratio: "16:9"' in result.content
    assert 'resolution: "1K"' in result.content
    assert 'size: "1280x720"' in result.content
    assert storyboard.properties["x"] == 520.0
    assert storyboard.properties["y"] == 0.0
    assert storyboard.properties["zIndex"] == 2
    connection = next(item for item in config.canvas.connections if item.id == result.data["connection_ids"][0])
    assert connection.source_element_id == storyboard.id
    assert connection.target_element_id == "shot-image-1"
    assert connection.locked


@pytest.mark.asyncio
async def test_upsert_storyboard_reconciles_replaced_removed_and_manual_connections(workspace: Path):
    """Storyboard 更新时替换、删除旧锁定关系，但保留用户手工关系。"""
    project_name = "storyboard-connection-reconcile-project"
    await async_mkdir(workspace / project_name, parents=True, exist_ok=True)
    await write_magic_project_js_v3(
        project_name,
        _v3_config(
            _content_element("shot-image-1", "image", name="首帧一", fields={"status": "completed"}),
            _content_element("shot-image-2", "image", name="首帧二", fields={"status": "completed"}),
            _content_element("manual-note", "text", name="手工关系", fields={"content": []}),
        ),
    )
    tool = UpsertStoryboard(base_dir=str(workspace))

    created = await tool.execute(
        _image_generation_tool_context(),
        UpsertStoryboardParams(
            project_path=project_name,
            name="分镜",
            generation_config=StoryboardGenerationConfigInput(
                aspect_ratio="16:9",
                resolution="1K",
            ),
            shots=[
                StoryboardShotInput(id="S01", duration_seconds=2, description="一", output_image_element_id="shot-image-1"),
                StoryboardShotInput(id="S02", duration_seconds=2, description="二", output_image_element_id="shot-image-2"),
            ],
        ),
    )
    assert created.ok

    manager = (await tool._get_canvas_manager(project_name))[1]
    storyboard_id = created.data["element_id"]

    def add_manual_connection(config: MagicProjectConfigV3) -> None:
        """写入一个不属于工具管理范围的未锁定手工关系。"""
        config.canvas.connections.append(
            CanvasConnection(
                id="manual-storyboard-note",
                source_element_id=storyboard_id,
                target_element_id="manual-note",
                locked=False,
            )
        )

    await manager.run_write_transaction(add_manual_connection)

    replaced = await tool.execute(
        _image_generation_tool_context(),
        UpsertStoryboardParams(
            project_path=project_name,
            name="分镜",
            element_id=storyboard_id,
            shots=[
                StoryboardShotInput(id="S02", duration_seconds=3, description="二替换", output_image_element_id="shot-image-2"),
            ],
        ),
    )
    assert replaced.ok
    config = await manager.read_current_canvas()
    storyboard_connections = [
        connection
        for connection in config.canvas.connections
        if connection.source_element_id == storyboard_id
    ]
    assert {(item.target_element_id, item.locked) for item in storyboard_connections} == {
        ("shot-image-2", True),
        ("manual-note", False),
    }

    removed = await tool.execute(
        _image_generation_tool_context(),
        UpsertStoryboardParams(
            project_path=project_name,
            name="分镜",
            element_id=storyboard_id,
            shots=[StoryboardShotInput(id="S02", duration_seconds=3, description="无输出")],
        ),
    )
    assert removed.ok
    config = await manager.read_current_canvas()
    storyboard_connections = [
        connection
        for connection in config.canvas.connections
        if connection.source_element_id == storyboard_id
    ]
    assert [(item.target_element_id, item.locked) for item in storyboard_connections] == [
        ("manual-note", False)
    ]


@pytest.mark.asyncio
async def test_video_production_images_reads_latest_user_edited_storyboard_config(
    workspace: Path,
    monkeypatch,
):
    """首帧生成在执行时读取用户最近编辑的分镜模型、比例和分辨率。"""
    project_name = "storyboard-generation-config-project"
    await async_mkdir(workspace / project_name, parents=True, exist_ok=True)
    await write_magic_project_js_v3(project_name, _v3_config())

    storyboard_tool = UpsertStoryboard(base_dir=str(workspace))
    storyboard_result = await storyboard_tool.execute(
        _image_generation_tool_context(),
        UpsertStoryboardParams(
            project_path=project_name,
            name="旅行分镜",
            generation_config=StoryboardGenerationConfigInput(
                aspect_ratio="16:9",
                resolution="1K",
            ),
            shots=[StoryboardShotInput(id="S01", duration_seconds=4, description="开场")],
        ),
    )
    assert storyboard_result.ok

    manager = (await storyboard_tool._get_canvas_manager(project_name))[1]

    def edit_storyboard_config(config: MagicProjectConfigV3) -> None:
        """模拟用户在画布中手动修改分镜生成设置。"""
        storyboard = config.canvas.get_element(storyboard_result.data["element_id"])
        storyboard.get_active_content().fields["generationConfig"] = {
            "model_id": "user-selected-image-model",
            "size": "1440x2560",
            "resolution": "2K",
            "image_generation_config": {"aspect_ratio": "9:16"},
        }

    await manager.run_write_transaction(edit_storyboard_config)

    captured: dict[str, object] = {}

    async def mock_execute(self, tool_context, params):
        """拦截通用生图工具，验证专用工具传入的内部配置。"""
        captured["image_model_id"] = self._image_model_id
        captured["tasks"] = params.tasks
        return ToolResult(
            content="generated",
            data={
                "succeeded_count": 1,
                "failed_count": 0,
                "connections": [],
                "created_elements": [],
            },
        )

    monkeypatch.setattr(GenerateCanvasImages, "execute", mock_execute)
    result = await GenerateVideoProductionImages(base_dir=str(workspace)).execute(
        _image_generation_tool_context(),
        GenerateVideoProductionImagesParams(
            project_path=project_name,
            storyboard_element_id=storyboard_result.data["element_id"],
            tasks=[
                VideoProductionImageTask(
                    prompt="竖屏城市开场",
                    name="开场首帧",
                    reference_images=[],
                )
            ],
        ),
    )

    assert result.ok
    assert captured["image_model_id"] == "user-selected-image-model"
    task = captured["tasks"][0]
    assert task.size == "1440x2560"
    assert result.data["generation_config"] == {
        "image_model_id": "user-selected-image-model",
        "aspect_ratio": "9:16",
        "resolution": "2K",
        "size": "1440x2560",
    }
    assert 'storyboard_element_id: "' in result.content
    assert 'model_id: "user-selected-image-model"' in result.content
    assert 'aspect_ratio: "9:16"' in result.content
    assert 'resolution: "2K"' in result.content
    assert 'size: "1440x2560"' in result.content


@pytest.mark.asyncio
async def test_configure_video_edit_persists_sequences_and_input_connections(workspace: Path):
    """Video Edit 工具以序列保存合成顺序，并连接对应媒体节点。"""
    project_name = "video-edit-project"
    await async_mkdir(workspace / project_name, parents=True, exist_ok=True)
    await write_magic_project_js_v3(
        project_name,
        _v3_config(
            _content_element(
                "video-1",
                "video",
                name="镜头一",
                fields={"src": "./videos/one.mp4", "status": "completed"},
            ),
            _content_element(
                "video-2",
                "video",
                name="镜头二",
                fields={"src": "./videos/two.mp4", "status": "completed"},
            ),
            _content_element(
                "audio-1",
                "audio",
                name="旁白",
                fields={"src": "./audio/narration.mp3"},
            ),
        ),
    )
    tool = ConfigureVideoEdit(base_dir=str(workspace))

    result = await tool.execute(
        None,
        ConfigureVideoEditParams(
            project_path=project_name,
            name="完整视频",
            video_sequence=["video-2", "video-1"],
            audio_sequence=["audio-1"],
            output=VideoEditOutputInput(aspect_ratio="16:9", resolution="1080P"),
        ),
    )

    assert result.ok
    manager = (await tool._get_canvas_manager(project_name))[1]
    config = await manager.read_current_canvas()
    video_edit = config.canvas.get_element(result.data["element_id"])
    fields = video_edit.get_active_content().fields
    assert fields["videoSequence"] == ["video-2", "video-1"]
    assert fields["audioSequence"] == ["audio-1"]
    assert fields["output"] == {"aspectRatio": "16:9", "resolution": "1080P", "format": "mp4"}
    assert 'aspect_ratio="16:9"' in result.content
    assert 'resolution="1080P"' in result.content
    assert 'format="mp4"' in result.content
    assert {"x", "y", "zIndex"} <= video_edit.properties.keys()
    connected_sources = {
        connection.source_element_id
        for connection in config.canvas.connections
        if connection.target_element_id == video_edit.id
    }
    assert connected_sources == {"video-1", "video-2", "audio-1"}


@pytest.mark.asyncio
async def test_configure_video_edit_reconciles_replaced_removed_and_appended_inputs(workspace: Path):
    """Video Edit 更新时替换、删除和追加输入连接。"""
    project_name = "video-edit-connection-reconcile-project"
    await async_mkdir(workspace / project_name, parents=True, exist_ok=True)
    await write_magic_project_js_v3(
        project_name,
        _v3_config(
            _content_element("video-1", "video", name="镜头一", fields={"src": "./videos/one.mp4"}),
            _content_element("video-2", "video", name="镜头二", fields={"src": "./videos/two.mp4"}),
            _content_element("audio-1", "audio", name="旁白", fields={"src": "./audio/one.mp3"}),
        ),
    )
    tool = ConfigureVideoEdit(base_dir=str(workspace))

    initial = await tool.execute(
        None,
        ConfigureVideoEditParams(
            project_path=project_name,
            name="合成",
            video_sequence=["video-1"],
            audio_sequence=["audio-1"],
        ),
    )
    assert initial.ok
    video_edit_id = initial.data["element_id"]

    replaced = await tool.execute(
        None,
        ConfigureVideoEditParams(
            project_path=project_name,
            name="合成",
            element_id=video_edit_id,
            video_sequence=["video-2"],
            audio_sequence=["audio-1"],
        ),
    )
    assert replaced.ok
    manager = (await tool._get_canvas_manager(project_name))[1]
    config = await manager.read_current_canvas()
    assert {
        connection.source_element_id
        for connection in config.canvas.connections
        if connection.target_element_id == video_edit_id and connection.locked
    } == {"video-2", "audio-1"}

    removed = await tool.execute(
        None,
        ConfigureVideoEditParams(
            project_path=project_name,
            name="合成",
            element_id=video_edit_id,
            video_sequence=["video-2"],
            audio_sequence=[],
        ),
    )
    assert removed.ok
    config = await manager.read_current_canvas()
    assert {
        connection.source_element_id
        for connection in config.canvas.connections
        if connection.target_element_id == video_edit_id and connection.locked
    } == {"video-2"}

    appended = await tool.execute(
        None,
        ConfigureVideoEditParams(
            project_path=project_name,
            name="合成",
            element_id=video_edit_id,
            video_sequence=["video-1", "video-2"],
            audio_sequence=["audio-1"],
        ),
    )
    assert appended.ok
    config = await manager.read_current_canvas()
    assert {
        connection.source_element_id
        for connection in config.canvas.connections
        if connection.target_element_id == video_edit_id and connection.locked
    } == {"video-1", "video-2", "audio-1"}


@pytest.mark.asyncio
async def test_upsert_canvas_audio_rejects_unsafe_path_and_accepts_project_file(workspace: Path):
    """Audio 工具拒绝越界路径，只接受项目内已存在的模拟音频文件。"""
    project_name = "audio-project"
    project_dir = workspace / project_name
    await async_mkdir(project_dir / "audio", parents=True, exist_ok=True)
    await write_magic_project_js_v3(project_name, _v3_config())
    await async_write_bytes(project_dir / "audio" / "narration.mp3", b"mock-audio")
    tool = UpsertCanvasAudio(base_dir=str(workspace))

    unsafe_result = await tool.execute(
        None,
        UpsertCanvasAudioParams(
            project_path=project_name,
            name="越界音频",
            src="../outside.mp3",
        ),
    )
    valid_result = await tool.execute(
        None,
        UpsertCanvasAudioParams(
            project_path=project_name,
            name="模拟旁白",
            src="./audio/narration.mp3",
        ),
    )

    assert not unsafe_result.ok
    assert "safe project-relative path" in unsafe_result.content
    assert valid_result.ok
    assert valid_result.data["src"] == "./audio/narration.mp3"
    manager = (await tool._get_canvas_manager(project_name))[1]
    config = await manager.read_current_canvas()
    audio = config.canvas.get_element(valid_result.data["element_id"])
    assert audio is not None
    assert audio.properties["x"] == 0.0
    assert audio.properties["y"] == 0.0
    assert audio.properties["zIndex"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("set_as_main", [False, True])
async def test_existing_image_appends_content_and_controls_main_pointer(
    workspace: Path,
    monkeypatch,
    set_as_main: bool,
):
    """复用已有 V3 图片时追加 Content，并按参数控制 main 指针。"""
    monkeypatch.setenv("ENABLE_MOCK_IMAGE_GENERATION", "true")
    project_name = "append-image-content-project"
    existing = _content_element(
        "image-1",
        "image",
        name="候选图片",
        fields={"src": "./images/old.png", "status": "completed"},
    )
    await async_mkdir(workspace / project_name, parents=True, exist_ok=True)
    await write_magic_project_js_v3(project_name, _v3_config(existing))

    result = await GenerateCanvasImages(base_dir=str(workspace)).execute(
        _image_generation_tool_context(),
        GenerateCanvasImagesParams(
            project_path=project_name,
            tasks=[
                ImageTaskSpec(
                    prompt="生成新的候选图片",
                    name="候选图片",
                    size="640x360",
                    reference_images=[],
                    element_id="image-1",
                    content_id="image-1-candidate",
                    set_as_main=set_as_main,
                )
            ],
        ),
    )

    assert result.ok
    manager = await get_canvas_manager(str(workspace / project_name))
    config = await manager.read_current_canvas()
    image = config.canvas.get_element("image-1")
    assert image is not None
    assert len(image.contents) == 2
    assert image.active_content_id != image.main_content_id if not set_as_main else image.active_content_id == image.main_content_id
    assert result.data["created_elements"][0]["content_id"] == image.active_content_id


@pytest.mark.asyncio
async def test_existing_image_element_id_without_content_id_keeps_original_behavior(
    workspace: Path,
    monkeypatch,
):
    """只传 element_id 时仍更新原 active Content，不追加版本。"""
    monkeypatch.setenv("ENABLE_MOCK_IMAGE_GENERATION", "true")
    project_name = "reuse-image-content-project"
    existing = _content_element(
        "image-1",
        "image",
        name="候选图片",
        fields={"src": "./images/old.png", "status": "completed"},
    )
    original_content_id = existing.active_content_id
    await async_mkdir(workspace / project_name, parents=True, exist_ok=True)
    await write_magic_project_js_v3(project_name, _v3_config(existing))

    result = await GenerateCanvasImages(base_dir=str(workspace)).execute(
        _image_generation_tool_context(),
        GenerateCanvasImagesParams(
            project_path=project_name,
            tasks=[
                ImageTaskSpec(
                    prompt="更新原候选图片",
                    name="候选图片",
                    size="640x360",
                    reference_images=[],
                    element_id="image-1",
                )
            ],
        ),
    )

    assert result.ok
    manager = await get_canvas_manager(str(workspace / project_name))
    config = await manager.read_current_canvas()
    image = config.canvas.get_element("image-1")
    assert image is not None
    assert len(image.contents) == 1
    assert image.active_content_id == original_content_id


@pytest.mark.asyncio
async def test_promote_canvas_content_requires_eligible_image_content(workspace: Path):
    """图片 Content 只有完成且存在 src 时才能提升为 main。"""
    project_name = "promote-project"
    element = _content_element(
        "image-1",
        "image",
        name="候选图片",
        fields={"src": "./images/main.png", "status": "completed"},
    )
    element.contents.append(
        ElementContent(
            content_id="image-1-content-2",
            fields={"status": "processing"},
        )
    )
    element.active_content_id = "image-1-content-2"
    await async_mkdir(workspace / project_name, parents=True, exist_ok=True)
    await write_magic_project_js_v3(project_name, _v3_config(element))
    tool = PromoteCanvasContent(base_dir=str(workspace))

    failed_result = await tool.execute(
        None,
        PromoteCanvasContentParams(
            project_path=project_name,
            element_id="image-1",
            content_id="image-1-content-2",
            confirmed_by_user=True,
            confirmation_text="确认使用模拟候选图",
        ),
    )
    manager = (await tool._get_canvas_manager(project_name))[1]
    await manager.run_write_transaction(
        lambda config: config.canvas.get_element("image-1").get_content("image-1-content-2").fields.update(
            {"src": "./images/candidate.png", "status": "completed"}
        )
    )
    success_result = await tool.execute(
        None,
        PromoteCanvasContentParams(
            project_path=project_name,
            element_id="image-1",
            content_id="image-1-content-2",
            confirmed_by_user=True,
            confirmation_text="确认使用模拟候选图",
        ),
    )

    assert not failed_result.ok
    assert "must be completed and contain src" in failed_result.content
    assert success_result.ok
    config = await manager.read_current_canvas()
    assert config.canvas.get_element("image-1").main_content_id == "image-1-content-2"


@pytest.mark.asyncio
async def test_video_production_image_tool_connects_reference_internally(
    workspace: Path,
    monkeypatch,
):
    """视频图片工具只接收参考路径，并在内部建立来源到结果的关系。"""
    project_name = "production-image-project"
    project_dir = workspace / project_name
    await async_mkdir(project_dir / "images", parents=True, exist_ok=True)
    Image.new("RGB", (64, 36), color="blue").save(project_dir / "images" / "reference.png")
    await write_magic_project_js_v3(
        project_name,
        _v3_config(
            _content_element(
                "source-image",
                "image",
                name="来源图片",
                fields={"src": "./images/reference.png", "status": "completed"},
            ),
        ),
    )
    monkeypatch.setenv("ENABLE_MOCK_IMAGE_GENERATION", "true")
    monkeypatch.setattr(
        "app.tools.generate_images.resolve_reference_images_to_urls",
        _resolve_mock_reference_images_to_urls,
    )
    transaction_count = 0
    original_transaction = CanvasManagerV3.run_write_transaction

    async def count_transaction(self, *args, **kwargs):
        """统计专用生成流程对画布执行的真实写事务次数。"""
        nonlocal transaction_count
        transaction_count += 1
        return await original_transaction(self, *args, **kwargs)

    monkeypatch.setattr(CanvasManagerV3, "run_write_transaction", count_transaction)

    result = await GenerateVideoProductionImages(base_dir=str(workspace)).execute(
        _image_generation_tool_context(),
        GenerateVideoProductionImagesParams(
            project_path=project_name,
            tasks=[
                VideoProductionImageTask(
                    prompt="模拟图片提示词",
                    name="生成图片",
                    size="640x360",
                    reference_images=["images/reference.png"],
                )
            ],
        ),
    )

    assert result.ok
    assert "connection" not in VideoProductionImageTask.model_fields
    assert transaction_count == 2
    assert result.data["connections"][0]["source_element_id"] == "source-image"
    target_element_id = result.data["created_elements"][0]["id"]
    assert result.data["connections"][0]["target_element_id"] == target_element_id
    created_content_id = result.data["created_elements"][0]["content_id"]
    created_src = result.data["created_elements"][0]["src"]
    assert f'element_id="{target_element_id}"' in result.content
    assert f'content_id="{created_content_id}"' in result.content
    assert f'media_path="{created_src}"' in result.content
    assert 'status="completed"' in result.content
    assert "Internal Canvas relations" not in result.content
    manager = (await get_canvas_manager(str(project_dir)))
    config = await manager.read_current_canvas()
    target = config.canvas.get_element(target_element_id)
    assert target is not None
    assert target.get_active_content().fields["status"] == "completed"
    assert any(
        connection.source_element_id == "source-image"
        and connection.target_element_id == target_element_id
        for connection in config.canvas.connections
    )


@pytest.mark.asyncio
async def test_video_production_image_tool_registers_project_asset_source(
    workspace: Path,
    monkeypatch,
):
    """项目素材尚未进入画布时，在生成结果最终事务中自动登记来源。"""
    project_name = "production-image-unregistered-source-project"
    project_dir = workspace / project_name
    await async_mkdir(project_dir / "assets", parents=True, exist_ok=True)
    Image.new("RGB", (80, 45), color="purple").save(project_dir / "assets" / "reference.png")
    await write_magic_project_js_v3(project_name, _v3_config())
    monkeypatch.setenv("ENABLE_MOCK_IMAGE_GENERATION", "true")
    monkeypatch.setattr(
        "app.tools.generate_images.resolve_reference_images_to_urls",
        _resolve_mock_reference_images_to_urls,
    )

    result = await GenerateVideoProductionImages(base_dir=str(workspace)).execute(
        _image_generation_tool_context(),
        GenerateVideoProductionImagesParams(
            project_path=project_name,
            tasks=[
                VideoProductionImageTask(
                    prompt="模拟项目素材生成",
                    name="项目素材结果",
                    size="640x360",
                    reference_images=["assets/reference.png"],
                )
            ],
        ),
    )

    assert result.ok
    connection = result.data["connections"][0]
    manager = await get_canvas_manager(str(project_dir))
    config = await manager.read_current_canvas()
    source = config.canvas.get_element(connection["source_element_id"])
    assert source is not None
    assert source.type == "image"
    assert source.src == "./assets/reference.png"
    assert source.x is not None
    assert source.y is not None
    assert source.zIndex is not None
    assert connection["target_element_id"] == result.data["created_elements"][0]["id"]


@pytest.mark.asyncio
async def test_video_production_image_tool_materializes_uploaded_source(
    workspace: Path,
    monkeypatch,
):
    """项目外上传素材由后端复制进项目后再登记为来源。"""
    project_name = "production-image-uploaded-source-project"
    project_dir = workspace / project_name
    await async_mkdir(project_dir, parents=True, exist_ok=True)
    await async_mkdir(workspace / ".tmp", parents=True, exist_ok=True)
    Image.new("RGB", (72, 72), color="orange").save(workspace / ".tmp" / "upload.png")
    await write_magic_project_js_v3(project_name, _v3_config())
    monkeypatch.setenv("ENABLE_MOCK_IMAGE_GENERATION", "true")
    monkeypatch.setattr(
        "app.tools.generate_images.resolve_reference_images_to_urls",
        _resolve_mock_reference_images_to_urls,
    )

    result = await GenerateVideoProductionImages(base_dir=str(workspace)).execute(
        _image_generation_tool_context(),
        GenerateVideoProductionImagesParams(
            project_path=project_name,
            tasks=[
                VideoProductionImageTask(
                    prompt="模拟上传素材生成",
                    name="上传素材结果",
                    size="640x360",
                    reference_images=[".tmp/upload.png"],
                )
            ],
        ),
    )

    assert result.ok
    connection = result.data["connections"][0]
    manager = await get_canvas_manager(str(project_dir))
    config = await manager.read_current_canvas()
    source = config.canvas.get_element(connection["source_element_id"])
    assert source is not None
    assert source.src.startswith("./assets/upload-")
    assert source.src.endswith(".png")
    assert (project_dir / source.src.removeprefix("./")).is_file()


@pytest.mark.asyncio
async def test_video_production_image_marks_result_failed_when_source_is_deleted(
    workspace: Path,
    monkeypatch,
):
    """来源在生成期间被删除时，不提交 completed 状态或残缺 Connection。"""
    project_name = "production-image-source-deleted-project"
    project_dir = workspace / project_name
    await async_mkdir(project_dir / "images", parents=True, exist_ok=True)
    Image.new("RGB", (64, 36), color="red").save(project_dir / "images" / "reference.png")
    await write_magic_project_js_v3(
        project_name,
        _v3_config(
            _content_element(
                "source-image",
                "image",
                name="来源图片",
                fields={"src": "./images/reference.png", "status": "completed"},
            ),
        ),
    )
    monkeypatch.setenv("ENABLE_MOCK_IMAGE_GENERATION", "true")
    monkeypatch.setattr(
        "app.tools.generate_images.resolve_reference_images_to_urls",
        _resolve_mock_reference_images_to_urls,
    )
    original_execute_item = GenerateCanvasImages._execute_task_item

    async def execute_and_delete_source(self, *args, **kwargs):
        """模拟媒体完成后、最终 Canvas 事务前来源被用户删除。"""
        execution_result = await original_execute_item(self, *args, **kwargs)
        manager = await get_canvas_manager(str(project_dir))

        async def delete_source(config: MagicProjectConfigV3) -> None:
            """在独立用户事务中删除来源节点。"""
            await manager.delete_element("source-image", config)

        await manager.run_write_transaction(delete_source)
        return execution_result

    monkeypatch.setattr(GenerateCanvasImages, "_execute_task_item", execute_and_delete_source)

    result = await GenerateVideoProductionImages(base_dir=str(workspace)).execute(
        _image_generation_tool_context(),
        GenerateVideoProductionImagesParams(
            project_path=project_name,
            tasks=[
                VideoProductionImageTask(
                    prompt="模拟生成",
                    name="生成结果",
                    size="640x360",
                    reference_images=["images/reference.png"],
                )
            ],
        ),
    )

    assert not result.ok
    assert result.data["connections"] == []
    manager = await get_canvas_manager(str(project_dir))
    config = await manager.read_current_canvas()
    generated = next(element for element in config.canvas.elements if element.type == "image")
    assert generated.get_active_content().fields["status"] == "failed"
    assert config.canvas.connections == []


@pytest.mark.asyncio
async def test_source_connection_finalizer_is_idempotent(workspace: Path):
    """同一来源和结果重复提交时只保留一条 Connection。"""
    project_name = "source-connection-finalizer-idempotent-project"
    await async_mkdir(workspace / project_name, parents=True, exist_ok=True)
    await write_magic_project_js_v3(
        project_name,
        _v3_config(
            _content_element(
                "source-image",
                "image",
                name="来源",
                fields={"src": "./images/source.png", "status": "completed"},
            ),
            _content_element("target-image", "image", name="结果", fields={"status": "completed"}),
        ),
    )
    manager = await get_canvas_manager(str(workspace / project_name))
    finalizer = SourceConnectionGenerationFinalizer(
        manager,
        [[
            PreparedMediaSource(
                element_id="source-image",
                content_id="source-image-content-1",
                media_type=MediaSourceType.IMAGE,
                name="来源",
                src="./images/source.png",
                generation_path=f"{project_name}/images/source.png",
                file_path=workspace / project_name / "images" / "source.png",
                width=320,
                height=180,
                register_if_missing=False,
            )
        ]],
        enabled=True,
    )
    context = CanvasGenerationFinalizationContext(
        task_index=0,
        element_id="target-image",
        content_id="target-image-content-1",
    )

    async def apply_finalizer(config: MagicProjectConfigV3) -> None:
        """在测试事务中执行一次来源关系提交。"""
        await finalizer.apply(config, context)

    await manager.run_write_transaction(apply_finalizer)
    await manager.run_write_transaction(apply_finalizer)

    config = await manager.read_current_canvas()
    assert len(config.canvas.connections) == 1
    assert config.canvas.connections[0].source_element_id == "source-image"
    assert config.canvas.connections[0].target_element_id == "target-image"


@pytest.mark.asyncio
async def test_video_production_video_tool_connects_first_frame_internally(
    workspace: Path,
    monkeypatch,
):
    """视频镜头工具根据首帧路径自动建立首帧到视频的关系。"""
    project_name = "production-video-project"
    project_dir = workspace / project_name
    await async_mkdir(project_dir / "images", parents=True, exist_ok=True)
    Image.new("RGB", (64, 36), color="green").save(project_dir / "images" / "first-frame.png")
    await write_magic_project_js_v3(project_name, _v3_config())
    monkeypatch.setenv("ENABLE_MOCK_VIDEO_GENERATION", "true")
    transaction_count = 0
    original_transaction = CanvasManagerV3.run_write_transaction

    async def count_transaction(self, *args, **kwargs):
        """统计专用视频生成流程对画布执行的真实写事务次数。"""
        nonlocal transaction_count
        transaction_count += 1
        return await original_transaction(self, *args, **kwargs)

    monkeypatch.setattr(CanvasManagerV3, "run_write_transaction", count_transaction)

    result = await GenerateVideoProductionVideos(base_dir=str(workspace)).execute(
        _video_generation_tool_context(),
        GenerateVideoProductionVideosParams(
            project_path=project_name,
            tasks=[
                VideoProductionVideoTask(
                    prompt="首帧 [image1] 缓慢推进",
                    name="镜头视频",
                    frame_start_path="images/first-frame.png",
                    reference_image_paths=["images/first-frame.png"],
                )
            ],
        ),
    )

    assert result.ok
    assert "connection" not in VideoProductionVideoTask.model_fields
    assert transaction_count == 2
    assert len(result.data["connections"]) == 1
    source_element_id = result.data["connections"][0]["source_element_id"]
    target_element_id = result.data["created_elements"][0]["element_id"]
    assert result.data["connections"][0]["target_element_id"] == target_element_id
    created_content_id = result.data["created_elements"][0]["content_id"]
    assert f'element_id="{target_element_id}"' in result.content
    assert f'content_id="{created_content_id}"' in result.content
    assert "Internal Canvas relations" not in result.content
    manager = await get_canvas_manager(str(project_dir))
    config = await manager.read_current_canvas()
    source = config.canvas.get_element(source_element_id)
    assert source is not None
    assert source.type == "image"
    assert source.src == "./images/first-frame.png"
    target = config.canvas.get_element(target_element_id)
    assert target is not None
    assert target.get_active_content().fields["status"] in {"completed", "processing"}
