"""
Find Similar Share Parameter

Parameter class for finding existing shares by file IDs or project ID.
"""

from typing import Any

from ..kernel.magic_service_parameter import MagicServiceAbstractParameter


class FindSimilarShareParameter(MagicServiceAbstractParameter):
    """Parameter for finding similar (existing) shares to avoid duplicates"""

    def __init__(
        self,
        file_ids: list[str] | None = None,
        project_id: str | None = None,
        share_project: bool | None = None,
    ) -> None:
        """
        At least one of file_ids or (project_id + share_project=True) must be provided.

        Args:
            file_ids: Numeric file ID list for file-based search
            project_id: Project ID for project-based search
            share_project: True to search for project-type shares
        """
        super().__init__()
        self.file_ids = file_ids
        self.project_id = project_id
        self.share_project = share_project

    def to_body(self) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if self.file_ids is not None:
            body["file_ids"] = self.file_ids
        if self.project_id is not None:
            body["project_id"] = self.project_id
        if self.share_project is not None:
            body["share_project"] = self.share_project
        return body

    def to_query_params(self) -> dict[str, Any]:
        return {}

    def validate(self) -> None:
        super().validate()
        has_file_ids = bool(self.file_ids)
        has_project = self.project_id is not None and self.share_project is True
        file_mode = has_file_ids and self.project_id is None and self.share_project is None
        project_mode = has_project and self.file_ids is None
        if file_mode == project_mode:
            raise ValueError("Provide exactly one mode: file_ids, or project_id with share_project=True")
        if has_file_ids and any(not item.isdigit() or len(item) > 64 for item in self.file_ids or []):
            raise ValueError("file_ids must contain numeric strings up to 64 characters")
        if has_project and (not self.project_id or not self.project_id.isdigit() or len(self.project_id) > 64):
            raise ValueError("project_id must be a numeric string up to 64 characters")
