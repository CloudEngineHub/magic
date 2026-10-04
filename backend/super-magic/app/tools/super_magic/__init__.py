"""Super Magic product tools for Code Mode."""

from .files import (
    CopyProjectFiles,
    CreateProjectDirectory,
    DeleteProjectFiles,
    GetFileBatchStatus,
    GetProjectFile,
    ListProjectFiles,
    MoveProjectFiles,
    RenameProjectFile,
)
from .messages import ReadTopicMessages
from .prepare_files import PrepareProjectFiles
from .projects import (
    CreateProject,
    DeleteProject,
    GetProject,
    ListProjects,
    ListTopics,
    MoveProject,
    UpdateProject,
)
from .tasks import (
    CancelTopicTask,
    DeleteTopicQueuedMessage,
    GetTopicTask,
    ListTopicQueuedMessages,
    SendTopicMessage,
    StartTopicTask,
)
from .topics import ArchiveTopic, CreateTopic, DeleteTopic, GetTopic, UpdateTopic
from .workspaces import (
    ArchiveWorkspace,
    CreateWorkspace,
    DeleteWorkspace,
    GetWorkspace,
    ListWorkspaces,
    UpdateWorkspace,
)

__all__ = [
    "ArchiveTopic",
    "ArchiveWorkspace",
    "CancelTopicTask",
    "CopyProjectFiles",
    "CreateProject",
    "CreateProjectDirectory",
    "CreateTopic",
    "CreateWorkspace",
    "DeleteProject",
    "DeleteProjectFiles",
    "DeleteTopic",
    "DeleteTopicQueuedMessage",
    "DeleteWorkspace",
    "GetFileBatchStatus",
    "GetProject",
    "GetProjectFile",
    "GetTopic",
    "GetTopicTask",
    "GetWorkspace",
    "ListProjectFiles",
    "ListProjects",
    "ListTopicQueuedMessages",
    "ListTopics",
    "ListWorkspaces",
    "MoveProject",
    "MoveProjectFiles",
    "PrepareProjectFiles",
    "ReadTopicMessages",
    "RenameProjectFile",
    "SendTopicMessage",
    "StartTopicTask",
    "UpdateProject",
    "UpdateTopic",
    "UpdateWorkspace",
]
