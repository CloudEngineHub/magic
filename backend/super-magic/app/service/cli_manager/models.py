"""第三方 CLI 持久化数据模型。"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Mapping, TypedDict

JsonPrimitive = str | int | float | bool | None
JsonValue = JsonPrimitive | list["JsonValue"] | dict[str, "JsonValue"]


class CliConfigDirData(TypedDict):
    """配置目录映射的 JSON 结构。"""

    source: str
    target: str
    mode: str


class CliPathLinkData(TypedDict):
    """包路径软链的 JSON 结构。"""

    source: str
    target: str
    mode: str


class CliRegistryItemData(TypedDict):
    """单个 CLI 注册表条目的 JSON 结构。"""

    name: str
    commands: list[str]
    install_strategy: str
    package_manager: str
    version: str
    app_dir: str
    bin_dir: str
    command_targets: dict[str, str]
    app_links: list[CliPathLinkData]
    config_dirs: list[CliConfigDirData]
    env_keys: list[str]
    platform: dict[str, str]
    created_at: str
    updated_at: str
    status: str


class CliRegistryData(TypedDict):
    """CLI 注册表文件的 JSON 结构。"""

    schema_version: int
    items: list[CliRegistryItemData]


class CliCommandValidation(TypedDict):
    """单个命令入口的校验结果。"""

    command: str
    shim_path: str
    target: str
    ok: bool


class CliValidationResult(TypedDict):
    """CLI 注册表条目的校验结果。"""

    ok: bool
    commands: list[CliCommandValidation]


class CliInstallStep(TypedDict, total=False):
    """CLI 持久化流程中的可展示步骤。"""

    stage: str
    strategy: str
    command: str


class CliWritePaths(TypedDict):
    """CLI 持久化流程写入的关键路径。"""

    root_dir: str
    bin_dir: str
    app_dir: str
    registry_file: str


class CliApplyResult(TypedDict):
    """安装或接管 CLI 后返回给工具层的结构。"""

    name: str
    commands: list[str]
    strategy: str
    package_manager: str
    steps: list[CliInstallStep]
    write_paths: CliWritePaths
    command_targets: dict[str, str]
    app_links: list[CliPathLinkData]
    config_dirs: list[CliConfigDirData]
    env_keys: list[str]
    status: Literal["active"]
    validation: CliValidationResult


class CliListItem(CliRegistryItemData, total=False):
    """列表接口中的 CLI 条目结构。"""

    missing_env_keys: list[str]
    validation: CliValidationResult


class CliListResult(TypedDict):
    """列出持久化 CLI 的返回结构。"""

    count: int
    items: list[CliListItem]


class CliRemoveResult(TypedDict):
    """移除持久化 CLI 的返回结构。"""

    name: str
    removed_paths: list[str]
    remove_state: bool
    status: Literal["removed"]


class CliRestoreIssue(TypedDict, total=False):
    """恢复持久化 CLI 时发现的问题。"""

    name: str
    validation: CliValidationResult
    error: str


class CliRestoreResult(TypedDict):
    """恢复持久化 CLI 的返回结构。"""

    restored: list[str]
    broken: list[CliRestoreIssue]


class CliManagerError(ValueError):
    """面向模型返回的稳定 CLI 管理错误，携带结构化上下文。"""

    def __init__(self, code: str, message: str, **context: JsonValue) -> None:
        """创建带稳定错误码和机器可读上下文的异常。"""
        super().__init__(message)
        self.code = code
        self.context = context


@dataclass(frozen=True)
class CommandRunResult:
    """CLI 安装命令执行器返回的结果。"""

    exit_code: int
    stdout: str = ""
    stderr: str = ""

    @property
    def ok(self) -> bool:
        """返回命令是否执行成功。"""
        return self.exit_code == 0


@dataclass
class CliManagerPaths:
    """用户级 CLI 持久化的文件系统布局。"""

    root_dir: Path
    bin_dir: Path
    apps_dir: Path
    prefixes_dir: Path
    state_dir: Path
    registry_file: Path


@dataclass
class CliConfigDir:
    """某个 CLI 的配置目录持久化映射。"""

    source: str
    target: str
    mode: str = "full_link"

    def to_dict(self) -> CliConfigDirData:
        """将映射序列化为注册表 JSON。"""
        return {"source": self.source, "target": self.target, "mode": self.mode}

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> "CliConfigDir":
        """从注册表 JSON 数据创建映射。"""
        return cls(
            source=str(data.get("source", "")),
            target=str(data.get("target", "")),
            mode=str(data.get("mode", "full_link") or "full_link"),
        )


@dataclass
class CliPathLink:
    """用于恢复已移动 CLI 包位置的文件系统软链。"""

    source: str
    target: str
    mode: str = "move_link"

    def to_dict(self) -> CliPathLinkData:
        """将路径软链序列化为注册表 JSON。"""
        return {"source": self.source, "target": self.target, "mode": self.mode}

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> "CliPathLink":
        """从注册表 JSON 数据创建路径软链。"""
        return cls(
            source=str(data.get("source", "")),
            target=str(data.get("target", "")),
            mode=str(data.get("mode", "move_link") or "move_link"),
        )


@dataclass
class CliRegistryItem:
    """描述一个已持久化 CLI 的注册表记录。"""

    name: str
    commands: list[str]
    install_strategy: str
    package_manager: str
    version: str = "unknown"
    app_dir: str = ""
    bin_dir: str = ""
    command_targets: dict[str, str] = field(default_factory=dict)
    app_links: list[CliPathLink] = field(default_factory=list)
    config_dirs: list[CliConfigDir] = field(default_factory=list)
    env_keys: list[str] = field(default_factory=list)
    platform: dict[str, str] = field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""
    status: str = "active"

    def to_dict(self) -> CliRegistryItemData:
        """将注册表记录序列化为 JSON 数据。"""
        return {
            "name": self.name,
            "commands": self.commands,
            "install_strategy": self.install_strategy,
            "package_manager": self.package_manager,
            "version": self.version,
            "app_dir": self.app_dir,
            "bin_dir": self.bin_dir,
            "command_targets": self.command_targets,
            "app_links": [item.to_dict() for item in self.app_links],
            "config_dirs": [item.to_dict() for item in self.config_dirs],
            "env_keys": self.env_keys,
            "platform": self.platform,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "status": self.status,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> "CliRegistryItem":
        """从 JSON 数据创建注册表记录。"""
        raw_commands = data.get("commands", [])
        raw_command_targets = data.get("command_targets", {})
        raw_app_links = data.get("app_links", [])
        raw_config_dirs = data.get("config_dirs", [])
        raw_env_keys = data.get("env_keys", [])
        raw_platform = data.get("platform", {})

        commands = raw_commands if isinstance(raw_commands, list) else []
        command_targets = raw_command_targets if isinstance(raw_command_targets, dict) else {}
        app_links = raw_app_links if isinstance(raw_app_links, list) else []
        config_dirs = raw_config_dirs if isinstance(raw_config_dirs, list) else []
        env_keys = raw_env_keys if isinstance(raw_env_keys, list) else []
        platform = raw_platform if isinstance(raw_platform, dict) else {}

        return cls(
            name=str(data.get("name", "")),
            commands=[str(value) for value in commands],
            install_strategy=str(data.get("install_strategy", "unknown") or "unknown"),
            package_manager=str(data.get("package_manager", "unknown") or "unknown"),
            version=str(data.get("version", "unknown") or "unknown"),
            app_dir=str(data.get("app_dir", "")),
            bin_dir=str(data.get("bin_dir", "")),
            command_targets={
                str(key): str(value)
                for key, value in command_targets.items()
            },
            app_links=[
                CliPathLink.from_dict(value)
                for value in app_links
                if isinstance(value, dict)
            ],
            config_dirs=[
                CliConfigDir.from_dict(value)
                for value in config_dirs
                if isinstance(value, dict)
            ],
            env_keys=[str(value) for value in env_keys],
            platform={
                str(key): str(value)
                for key, value in platform.items()
            },
            created_at=str(data.get("created_at", "")),
            updated_at=str(data.get("updated_at", "")),
            status=str(data.get("status", "active") or "active"),
        )


@dataclass
class CliApplyRequest:
    """安装或接管 CLI 到持久化存储的输入请求。"""

    name: str
    mode: Literal["install", "adopt"] = "install"
    install_command: str | None = None
    commands: list[str] = field(default_factory=list)
    command_paths: dict[str, str] = field(default_factory=dict)
    extra_bin_dirs: list[str] = field(default_factory=list)
    config_dirs: list[str] = field(default_factory=list)
    env_keys: list[str] = field(default_factory=list)
    preferred_strategy: str = "auto"
    confirmed: bool = False
