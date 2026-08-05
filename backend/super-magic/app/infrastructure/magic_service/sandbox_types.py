"""Typed response payloads for sandbox self-management APIs."""

from typing import Literal, TypedDict

SandboxUpgradeScheduleOperation = Literal["upgrade_scheduled", "already_current"]
SandboxRestartScheduleOperation = Literal["restart_scheduled"]


class SandboxVersionData(TypedDict):
    current_version: str
    latest_version: str
    needs_update: bool


class SandboxInfoData(SandboxVersionData):
    sandbox_id: str
    status: str


class SandboxRebuildData(TypedDict):
    sandbox_id: str


class SandboxUpgradeScheduleData(SandboxVersionData):
    sandbox_id: str
    operation: SandboxUpgradeScheduleOperation
    delay_seconds: int


class SandboxRestartScheduleData(TypedDict):
    sandbox_id: str
    operation: SandboxRestartScheduleOperation
    delay_seconds: int


__all__ = [
    "SandboxInfoData",
    "SandboxRebuildData",
    "SandboxRestartScheduleData",
    "SandboxRestartScheduleOperation",
    "SandboxUpgradeScheduleData",
    "SandboxUpgradeScheduleOperation",
    "SandboxVersionData",
]
