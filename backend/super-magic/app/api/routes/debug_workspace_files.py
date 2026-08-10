import traceback
from base64 import b64decode
from binascii import Error as Base64DecodeError
from io import BytesIO
from urllib.parse import quote

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse, StreamingResponse

from agentlang.logger import get_logger
from app.api.http_dto.response import BaseResponse, create_error_response, create_success_response
from app.api.http_dto.workspace import (
    WorkspaceDirectoryCreateRequest,
    WorkspaceFileContentRequest,
    WorkspaceFileDeleteRequest,
    WorkspaceFileMoveRequest,
    WorkspaceFileUploadRequest,
    WorkspaceFileWriteRequest,
)
from app.api.handlers.debug_workspace_file_service import DebugWorkspaceFileService

router = APIRouter(prefix="/v1/debug/workspace-files", tags=["调试面板工作区文件"])

logger = get_logger(__name__)


def _workspace_file_service(scope: str = "workspace") -> DebugWorkspaceFileService:
    """根据受控 scope 创建调试文件服务。"""
    return DebugWorkspaceFileService(scope=scope)


def _workspace_error_response(message: str, exc: Exception, log_level: str = "warning") -> BaseResponse:
    log_message = f"{message}: {exc}"
    if log_level == "debug":
        logger.debug(log_message)
    else:
        logger.warning(log_message)
    return create_error_response(
        message=f"{message}: {exc}",
        data={"error": str(exc)},
    )


def _download_content_disposition(filename: str) -> str:
    quoted = quote(filename)
    return f"attachment; filename*=UTF-8''{quoted}"


def _get_workspace_raw_file_response(path: str, scope: str = "workspace"):
    """根据受控根目录下的相对路径构造原始文件响应。"""
    try:
        service = _workspace_file_service(scope)
        target = service.resolve_path(path)
        if not target.exists():
            raise FileNotFoundError(f"文件不存在: {path}")
        if not target.is_file():
            raise ValueError(f"路径不是文件: {path}")
        return FileResponse(target)
    except (FileNotFoundError, ValueError) as exc:
        return _workspace_error_response("获取调试工作区原始文件失败", exc)


@router.get("/tree", response_model=BaseResponse)
async def get_workspace_file_tree(
    path: str = Query("", description="Relative directory path under workspace root"),
    depth: int = Query(2, ge=0, le=8, description="Recursive depth"),
    scope: str = Query("workspace", description="Debug file root scope"),
) -> BaseResponse:
    """List files under local .workspace for the debug client."""
    try:
        data = _workspace_file_service(scope).list_tree(path, depth)
        return create_success_response(message="获取调试工作区文件树成功", data=data)
    except (FileNotFoundError, ValueError) as exc:
        return _workspace_error_response("获取调试工作区文件树失败", exc)
    except Exception as exc:
        logger.error(f"获取调试工作区文件树异常: {exc}")
        logger.error(traceback.format_exc())
        return create_error_response(message="获取调试工作区文件树异常", data={"error": str(exc)})


@router.post("/content", response_model=BaseResponse)
async def read_workspace_file(request: WorkspaceFileContentRequest, scope: str = Query("workspace")) -> BaseResponse:
    """Read a UTF-8 text file from local .workspace."""
    try:
        data = _workspace_file_service(scope).read_file(request.path)
        return create_success_response(message="读取调试工作区文件成功", data=data)
    except FileNotFoundError as exc:
        return _workspace_error_response("读取调试工作区文件失败", exc, log_level="debug")
    except (ValueError, UnicodeDecodeError) as exc:
        return _workspace_error_response("读取调试工作区文件失败", exc)
    except Exception as exc:
        logger.error(f"读取调试工作区文件异常: {exc}")
        logger.error(traceback.format_exc())
        return create_error_response(message="读取调试工作区文件异常", data={"error": str(exc)})


@router.get("/raw")
async def get_workspace_raw_file(
    path: str = Query(..., description="Relative file path under workspace root"),
    scope: str = Query("workspace", description="Debug file root scope"),
):
    """通过查询参数返回工作区原始文件，兼容既有调用方。"""
    return _get_workspace_raw_file_response(path, scope)


@router.get("/raw/{path:path}")
async def get_workspace_raw_file_by_path(path: str, scope: str = Query("workspace")):
    """通过路径参数返回工作区原始文件，以支持 HTML 相对资源解析。"""
    return _get_workspace_raw_file_response(path, scope)


@router.get("/download")
async def download_workspace_path(
    path: str = Query(..., description="Relative file or directory path under workspace root"),
    scope: str = Query("workspace", description="Debug file root scope"),
):
    """Download a workspace file, or a directory as a zip archive."""
    try:
        service = _workspace_file_service(scope)
        target = service.resolve_path(path)
        if not target.exists():
            raise FileNotFoundError(f"路径不存在: {path}")
        if target.is_file():
            return FileResponse(
                target,
                filename=target.name,
                headers={"Content-Disposition": _download_content_disposition(target.name)},
            )
        archive, filename = service.build_download_archive(path)
        return StreamingResponse(
            archive,
            media_type="application/zip",
            headers={"Content-Disposition": _download_content_disposition(filename)},
        )
    except (FileNotFoundError, ValueError) as exc:
        return _workspace_error_response("下载调试工作区路径失败", exc)


@router.put("/content", response_model=BaseResponse)
async def write_workspace_file(request: WorkspaceFileWriteRequest, scope: str = Query("workspace")) -> BaseResponse:
    """Write a UTF-8 text file into local .workspace."""
    try:
        data = _workspace_file_service(scope).write_file(
            request.path,
            request.content,
            create_parent_dirs=request.create_parent_dirs,
            overwrite=request.overwrite,
        )
        return create_success_response(message="写入调试工作区文件成功", data=data)
    except (FileNotFoundError, FileExistsError, ValueError) as exc:
        return _workspace_error_response("写入调试工作区文件失败", exc)
    except Exception as exc:
        logger.error(f"写入调试工作区文件异常: {exc}")
        logger.error(traceback.format_exc())
        return create_error_response(message="写入调试工作区文件异常", data={"error": str(exc)})


@router.post("/directory", response_model=BaseResponse)
async def create_workspace_directory(request: WorkspaceDirectoryCreateRequest, scope: str = Query("workspace")) -> BaseResponse:
    """Create a directory under local .workspace."""
    try:
        data = _workspace_file_service(scope).create_directory(request.path)
        return create_success_response(message="创建调试工作区目录成功", data=data)
    except ValueError as exc:
        return _workspace_error_response("创建调试工作区目录失败", exc)
    except Exception as exc:
        logger.error(f"创建调试工作区目录异常: {exc}")
        logger.error(traceback.format_exc())
        return create_error_response(message="创建调试工作区目录异常", data={"error": str(exc)})


@router.delete("", response_model=BaseResponse)
async def delete_workspace_file(request: WorkspaceFileDeleteRequest, scope: str = Query("workspace")) -> BaseResponse:
    """Delete a file or directory under local .workspace."""
    try:
        data = _workspace_file_service(scope).delete_path(request.path, recursive=request.recursive)
        return create_success_response(message="删除调试工作区路径成功", data=data)
    except (FileNotFoundError, OSError, ValueError) as exc:
        return _workspace_error_response("删除调试工作区路径失败", exc)
    except Exception as exc:
        logger.error(f"删除调试工作区路径异常: {exc}")
        logger.error(traceback.format_exc())
        return create_error_response(message="删除调试工作区路径异常", data={"error": str(exc)})


@router.post("/move", response_model=BaseResponse)
async def move_workspace_file(request: WorkspaceFileMoveRequest, scope: str = Query("workspace")) -> BaseResponse:
    """Move or rename a file or directory under local .workspace."""
    try:
        data = _workspace_file_service(scope).move_path(
            request.source_path,
            request.target_path,
            overwrite=request.overwrite,
        )
        return create_success_response(message="移动调试工作区路径成功", data=data)
    except (FileNotFoundError, FileExistsError, ValueError) as exc:
        return _workspace_error_response("移动调试工作区路径失败", exc)
    except Exception as exc:
        logger.error(f"移动调试工作区路径异常: {exc}")
        logger.error(traceback.format_exc())
        return create_error_response(message="移动调试工作区路径异常", data={"error": str(exc)})


@router.post("/upload", response_model=BaseResponse)
async def upload_workspace_file(request: WorkspaceFileUploadRequest, scope: str = Query("workspace")) -> BaseResponse:
    """Upload one base64 encoded file into local .workspace for debug-client file management."""
    try:
        content = b64decode(request.content_base64, validate=True)
        data = _workspace_file_service(scope).upload_file(
            target_dir=request.target_dir,
            filename=request.filename,
            file_obj=BytesIO(content),
            overwrite=request.overwrite,
        )
        return create_success_response(message="上传调试工作区文件成功", data=data)
    except (Base64DecodeError, FileExistsError, ValueError) as exc:
        return _workspace_error_response("上传调试工作区文件失败", exc)
    except Exception as exc:
        logger.error(f"上传调试工作区文件异常: {exc}")
        logger.error(traceback.format_exc())
        return create_error_response(message="上传调试工作区文件异常", data={"error": str(exc)})
