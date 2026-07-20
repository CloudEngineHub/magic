import json
from pathlib import Path

import pytest

from app.service.cli_manager import (
    CliApplyRequest,
    CliManagerError,
    CliManagerPaths,
    CliManagerService,
    CommandRunResult,
)
from app.service.cli_manager import filesystem as cli_filesystem
from app.service.cli_manager import path_utils as cli_path_utils
from app.service.cli_manager import validation as cli_validation
from app.service.cli_manager.paths import CliManagerPathResolver
from app.utils.async_file_utils import async_chmod


def _build_paths(tmp_path: Path) -> CliManagerPaths:
    """为单元测试构建隔离的 CLI 管理器路径。"""
    root_dir = tmp_path / "persistent" / "cli"
    return CliManagerPaths(
        root_dir=root_dir,
        bin_dir=root_dir / "bin",
        apps_dir=root_dir / "apps",
        prefixes_dir=root_dir / "prefixes",
        state_dir=root_dir / "state",
        registry_file=root_dir / "registry.json",
    )


def _write_mock_command(command_path: Path, output: str = "ok") -> None:
    """为单元测试创建 mock 可执行命令。"""
    command_path.parent.mkdir(parents=True, exist_ok=True)
    command_path.write_text(f"#!/usr/bin/env bash\necho {output}\n", encoding="utf-8")
    command_path.chmod(0o755)


@pytest.mark.asyncio
async def test_apply_rejects_runtime_managed_cli(tmp_path, monkeypatch):
    """验证运行时预置 CLI 不会进入用户持久化流程。"""
    paths = _build_paths(tmp_path)
    monkeypatch.setattr(
        cli_validation,
        "RUNTIME_MANAGED_CLI_COMMANDS",
        frozenset({"mock-runtime-cli"}),
    )

    service = CliManagerService(paths=paths)
    with pytest.raises(CliManagerError) as error:
        await service.apply(
            CliApplyRequest(
                name="mock-runtime-cli",
                mode="adopt",
                commands=["mock-runtime-cli"],
                confirmed=True,
            )
        )

    assert error.value.code == "runtime_managed_cli"
    assert error.value.context["management_scope"] == "runtime"
    assert not paths.registry_file.exists()


@pytest.mark.asyncio
async def test_apply_adopt_moves_install_root_and_restore_symlink(tmp_path, monkeypatch):
    """验证 adopt 模式会移动用户 CLI 根目录并恢复原位置软链。"""
    paths = _build_paths(tmp_path)
    source_root = tmp_path / "sandbox-home" / ".mock-tools" / "mockpkg"
    command_path = source_root / "bin" / "mock-cli"
    _write_mock_command(command_path)
    monkeypatch.setenv("PATH", str(command_path.parent))

    service = CliManagerService(paths=paths)
    result = await service.apply(
        CliApplyRequest(
            name="mock-cli",
            mode="adopt",
            commands=["mock-cli"],
            confirmed=True,
        )
    )

    assert result["name"] == "mock-cli"
    assert source_root.is_symlink()
    app_link = result["app_links"][0]
    assert Path(app_link["source"]) == source_root
    assert Path(app_link["target"]).exists()
    assert source_root.resolve(strict=False) == Path(app_link["target"]).resolve(strict=False)
    assert (paths.bin_dir / "mock-cli").exists()

    source_root.unlink()
    restore_result = await service.restore()

    assert restore_result["restored"] == ["mock-cli"]
    assert source_root.is_symlink()
    assert source_root.resolve(strict=False) == Path(app_link["target"]).resolve(strict=False)


@pytest.mark.asyncio
async def test_apply_adopt_restores_source_when_link_creation_fails(tmp_path, monkeypatch):
    """验证分阶段复制后如果建链失败，会恢复原目录并清理持久化副本。"""
    paths = _build_paths(tmp_path)
    source_root = tmp_path / "sandbox-home" / ".mock-tools" / "mockpkg"
    command_path = source_root / "bin" / "mock-cli"
    _write_mock_command(command_path)
    monkeypatch.setenv("PATH", str(command_path.parent))

    original_symlink = cli_filesystem.async_symlink

    async def mock_symlink(src, dst, target_is_directory=False):
        """模拟原包目录替换为软链时失败。"""
        if Path(dst) == source_root:
            raise RuntimeError("mock symlink failure")
        await original_symlink(src, dst, target_is_directory=target_is_directory)

    monkeypatch.setattr(cli_filesystem, "async_symlink", mock_symlink)
    service = CliManagerService(paths=paths)

    with pytest.raises(RuntimeError, match="mock symlink failure"):
        await service.apply(
            CliApplyRequest(
                name="mock-cli",
                mode="adopt",
                commands=["mock-cli"],
                confirmed=True,
            )
        )

    assert source_root.exists()
    assert source_root.is_dir()
    assert not source_root.is_symlink()
    assert command_path.exists()
    assert list(paths.apps_dir.rglob("mockpkg")) == []


@pytest.mark.asyncio
async def test_apply_adopt_finds_named_persistent_prefix_without_path(tmp_path, monkeypatch):
    """验证默认会查找按 CLI 名称隔离的持久 prefix。"""
    paths = _build_paths(tmp_path)
    command_path = paths.prefixes_dir / "mock-cli" / "bin" / "mock-cli"
    _write_mock_command(command_path)
    monkeypatch.setenv("PATH", "")

    service = CliManagerService(paths=paths)
    result = await service.apply(
        CliApplyRequest(
            name="mock-cli",
            mode="adopt",
            commands=["mock-cli"],
            confirmed=True,
        )
    )

    assert result["name"] == "mock-cli"
    assert result["app_links"] == []
    assert Path(result["write_paths"]["app_dir"]) == paths.prefixes_dir / "mock-cli"
    assert Path(result["command_targets"]["mock-cli"]) == command_path.absolute()
    assert (paths.bin_dir / "mock-cli").exists()


@pytest.mark.asyncio
async def test_apply_adopt_persists_single_file_from_broad_local_bin(tmp_path, monkeypatch):
    """验证宽泛 .local 根目录下的单文件命令只接管命令文件本身。"""
    home_dir = tmp_path / "sandbox-home"
    paths = _build_paths(tmp_path)
    command_path = home_dir / ".local" / "bin" / "mock-cli"
    _write_mock_command(command_path)
    monkeypatch.setenv("HOME", str(home_dir))
    monkeypatch.setenv("PATH", str(command_path.parent))

    service = CliManagerService(paths=paths)
    result = await service.apply(
        CliApplyRequest(
            name="mock-cli",
            mode="adopt",
            commands=["mock-cli"],
            confirmed=True,
        )
    )

    target = Path(result["command_targets"]["mock-cli"])
    assert target.exists()
    assert target.is_file()
    assert target != command_path
    assert command_path.is_symlink()
    assert command_path.resolve(strict=False) == target.resolve(strict=False)
    assert Path(result["app_links"][0]["source"]) == command_path
    assert home_dir.joinpath(".local").exists()


@pytest.mark.asyncio
async def test_apply_adopt_persists_single_file_from_system_bin(tmp_path, monkeypatch):
    """验证系统级 bin 下可独立启动的单文件命令只接管命令文件本身。"""
    paths = _build_paths(tmp_path)
    system_root = tmp_path / "usr-local"
    command_path = system_root / "bin" / "mock-cli"
    _write_mock_command(command_path)
    monkeypatch.setenv("PATH", str(command_path.parent))
    monkeypatch.setattr(cli_path_utils, "SYSTEM_ROOTS", (system_root,))
    original_rename = cli_filesystem.async_rename

    async def mock_rename(src, dst):
        """确认不会对系统源文件执行 rename。"""
        assert Path(src) != command_path
        await original_rename(src, dst)

    monkeypatch.setattr(cli_filesystem, "async_rename", mock_rename)

    service = CliManagerService(paths=paths)
    result = await service.apply(
        CliApplyRequest(
            name="mock-cli",
            mode="adopt",
            commands=["mock-cli"],
            confirmed=True,
        )
    )

    target = Path(result["command_targets"]["mock-cli"])
    assert target.exists()
    assert target.is_file()
    assert target != command_path
    assert command_path.is_symlink()
    assert command_path.resolve(strict=False) == target.resolve(strict=False)
    assert Path(result["app_links"][0]["source"]) == command_path
    assert system_root.exists()


@pytest.mark.asyncio
async def test_apply_adopt_rewrites_external_symlink_to_persistent_target(tmp_path, monkeypatch):
    """验证外部路径软链到持久文件时，注册表记录真实持久目标。"""
    paths = _build_paths(tmp_path)
    system_root = tmp_path / "usr-local"
    existing_target = paths.apps_dir / "mock-cli" / "old" / "bin" / "mock-cli"
    command_path = system_root / "bin" / "mock-cli"
    _write_mock_command(existing_target)
    command_path.parent.mkdir(parents=True, exist_ok=True)
    command_path.symlink_to(existing_target)
    monkeypatch.setenv("PATH", str(command_path.parent))
    monkeypatch.setattr(cli_path_utils, "SYSTEM_ROOTS", (system_root,))

    service = CliManagerService(paths=paths)
    result = await service.apply(
        CliApplyRequest(
            name="mock-cli",
            mode="adopt",
            commands=["mock-cli"],
            confirmed=True,
        )
    )

    target = Path(result["command_targets"]["mock-cli"])
    assert target != command_path
    assert target.exists()
    assert target.is_file()
    assert target.is_relative_to(paths.root_dir)
    assert command_path.is_symlink()
    assert command_path.resolve(strict=False) == target.resolve(strict=False)
    assert Path(result["write_paths"]["app_dir"]).is_relative_to(paths.apps_dir)
    assert str(command_path) not in (paths.bin_dir / "mock-cli").read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_apply_adopt_rejects_broad_local_bin_when_single_file_probe_fails(tmp_path, monkeypatch):
    """验证宽泛 .local 根目录下无法独立启动的命令仍会被拒绝。"""
    home_dir = tmp_path / "sandbox-home"
    paths = _build_paths(tmp_path)
    command_path = home_dir / ".local" / "bin" / "mock-cli"
    command_path.parent.mkdir(parents=True, exist_ok=True)
    command_path.write_text("#!/usr/bin/env bash\nexit 7\n", encoding="utf-8")
    command_path.chmod(0o755)
    monkeypatch.setenv("HOME", str(home_dir))
    monkeypatch.setenv("PATH", str(command_path.parent))

    service = CliManagerService(paths=paths)
    with pytest.raises(CliManagerError) as error:
        await service.apply(
            CliApplyRequest(
                name="mock-cli",
                mode="adopt",
                commands=["mock-cli"],
                confirmed=True,
            )
        )

    assert error.value.code == "cannot_move_install_root"
    assert command_path.exists()
    assert not command_path.is_symlink()


@pytest.mark.asyncio
async def test_apply_adopt_rejects_system_python_entrypoint_wrapper(tmp_path, monkeypatch):
    """验证系统目录下依赖外部包的 Python 入口脚本不会被误当作单文件命令。"""
    paths = _build_paths(tmp_path)
    system_root = tmp_path / "usr-local"
    command_path = system_root / "bin" / "mock-cli"
    command_path.parent.mkdir(parents=True, exist_ok=True)
    command_path.write_text(
        "#!/usr/bin/env python3\n"
        "from mock_package.cli import main\n"
        "if __name__ == '__main__':\n"
        "    main()\n",
        encoding="utf-8",
    )
    command_path.chmod(0o755)
    monkeypatch.setenv("PATH", str(command_path.parent))
    monkeypatch.setattr(cli_path_utils, "SYSTEM_ROOTS", (system_root,))

    service = CliManagerService(paths=paths)
    with pytest.raises(CliManagerError) as error:
        await service.apply(
            CliApplyRequest(
                name="mock-cli",
                mode="adopt",
                commands=["mock-cli"],
                confirmed=True,
            )
        )

    assert error.value.code == "cannot_move_install_root"
    assert error.value.context["inferred_root"] == str(system_root.resolve(strict=False))
    assert command_path.exists()
    assert not command_path.is_symlink()


@pytest.mark.asyncio
async def test_apply_install_marks_shell_prefix_when_command_lands_in_persistent_prefix(tmp_path, monkeypatch):
    """验证 shell 安装器写入持久 prefix 时策略标记为 shell_prefix。"""
    paths = _build_paths(tmp_path)
    command_path = paths.prefixes_dir / "mock-cli" / "bin" / "mock-cli"

    def mock_command_runner(command: str, cwd: Path, env: dict[str, str], timeout: int) -> CommandRunResult:
        """模拟 shell 安装器把命令写入持久 prefix。"""
        _write_mock_command(command_path)
        return CommandRunResult(exit_code=0, stdout="installed")

    monkeypatch.setenv("PATH", "")
    service = CliManagerService(paths=paths, command_runner=mock_command_runner)

    result = await service.apply(
        CliApplyRequest(
            name="mock-cli",
            mode="install",
            install_command="sh install.sh --bin-dir ~/.magic/cli/prefixes/mock-cli/bin",
            commands=["mock-cli"],
            confirmed=True,
        )
    )

    assert result["strategy"] == "shell_prefix"
    assert result["package_manager"] == "shell"
    assert result["app_links"] == []
    assert Path(result["write_paths"]["app_dir"]) == paths.prefixes_dir / "mock-cli"


@pytest.mark.asyncio
async def test_apply_install_adopts_single_file_created_in_system_bin(tmp_path, monkeypatch):
    """验证安装脚本落到系统级 bin 后会自动按单文件方式接管。"""
    paths = _build_paths(tmp_path)
    system_root = tmp_path / "usr-local"
    command_path = system_root / "bin" / "mock-cli"
    monkeypatch.setenv("PATH", str(command_path.parent))
    monkeypatch.setattr(cli_path_utils, "SYSTEM_ROOTS", (system_root,))

    def mock_command_runner(command: str, cwd: Path, env: dict[str, str], timeout: int) -> CommandRunResult:
        """模拟 shell 安装器把单文件命令写入系统级 bin。"""
        _write_mock_command(command_path)
        return CommandRunResult(exit_code=0, stdout="installed")

    service = CliManagerService(paths=paths, command_runner=mock_command_runner)
    result = await service.apply(
        CliApplyRequest(
            name="mock-cli",
            mode="install",
            install_command="curl -fsSL https://example.invalid/install.sh | sh",
            commands=["mock-cli"],
            confirmed=True,
        )
    )

    target = Path(result["command_targets"]["mock-cli"])
    assert result["strategy"] == "adopt"
    assert target.exists()
    assert target != command_path
    assert command_path.is_symlink()
    assert command_path.resolve(strict=False) == target.resolve(strict=False)
    assert Path(result["app_links"][0]["source"]) == command_path


@pytest.mark.asyncio
async def test_restore_repairs_external_command_target_from_persisted_app(tmp_path):
    """验证旧记录误指向外部路径时，会从持久应用目录恢复真实命令目标。"""
    paths = _build_paths(tmp_path)
    broken_target = tmp_path / "usr-local" / "bin" / "mock-cli"
    persistent_command = paths.apps_dir / "mock-cli" / "fixed" / "bin" / "mock-cli"
    _write_mock_command(persistent_command)
    paths.registry_file.parent.mkdir(parents=True, exist_ok=True)
    paths.registry_file.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "items": [
                    {
                        "name": "mock-cli",
                        "commands": ["mock-cli"],
                        "install_strategy": "adopt",
                        "package_manager": "adopt",
                        "version": "unknown",
                        "app_dir": str(tmp_path / "usr-local"),
                        "bin_dir": str(paths.bin_dir),
                        "command_targets": {"mock-cli": str(broken_target)},
                        "app_links": [],
                        "config_dirs": [],
                        "env_keys": [],
                        "platform": {"os": "linux", "arch": "x86_64"},
                        "created_at": "2026-06-29T00:00:00Z",
                        "updated_at": "2026-06-29T00:00:00Z",
                        "status": "active",
                    }
                ],
            },
        ),
        encoding="utf-8",
    )

    service = CliManagerService(paths=paths)
    result = await service.restore()

    shim_content = (paths.bin_dir / "mock-cli").read_text(encoding="utf-8")
    registry = json.loads(paths.registry_file.read_text(encoding="utf-8"))
    repaired_item = registry["items"][0]
    assert result["restored"] == ["mock-cli"]
    assert str(persistent_command) in shim_content
    assert str(broken_target) not in shim_content
    assert repaired_item["command_targets"]["mock-cli"] == str(persistent_command)
    assert repaired_item["app_dir"] == str(persistent_command.parent.parent)


@pytest.mark.asyncio
async def test_apply_rejects_persistent_target_shadowed_by_existing_path_command(tmp_path, monkeypatch):
    """验证持久 prefix 目标不会静默被 PATH 中的旧命令遮蔽。"""
    paths = _build_paths(tmp_path)
    persistent_command = paths.prefixes_dir / "mock-cli" / "bin" / "mock-cli"
    stale_command = tmp_path / "sandbox-home" / ".local" / "bin" / "mock-cli"
    _write_mock_command(persistent_command)
    _write_mock_command(stale_command)
    monkeypatch.setenv("PATH", str(stale_command.parent))

    service = CliManagerService(paths=paths)

    with pytest.raises(CliManagerError) as error:
        await service.apply(
            CliApplyRequest(
                name="mock-cli",
                mode="adopt",
                commands=["mock-cli"],
                command_paths={"mock-cli": str(persistent_command)},
                confirmed=True,
            )
        )

    assert error.value.code == "command_path_conflict"
    assert error.value.context["conflict_type"] == "path_command_shadow"
    assert error.value.context["existing_path"] == str(stale_command.resolve(strict=False))
    assert error.value.context["selected_target"] == str(persistent_command.resolve(strict=False))


@pytest.mark.asyncio
async def test_list_validation_requires_target_executable(tmp_path, monkeypatch):
    """验证校验会检查目标命令本身是否可执行。"""
    paths = _build_paths(tmp_path)
    command_path = paths.prefixes_dir / "mock-cli" / "bin" / "mock-cli"
    _write_mock_command(command_path)
    monkeypatch.setenv("PATH", "")

    service = CliManagerService(paths=paths)
    result = await service.apply(
        CliApplyRequest(
            name="mock-cli",
            mode="adopt",
            commands=["mock-cli"],
            confirmed=True,
        )
    )
    await async_chmod(Path(result["command_targets"]["mock-cli"]), 0o644)

    list_result = await service.list_items(validate=True)

    assert list_result["items"][0]["validation"]["ok"] is False
    assert list_result["items"][0]["validation"]["commands"][0]["ok"] is False


@pytest.mark.asyncio
async def test_apply_adopt_accepts_explicit_command_path(tmp_path, monkeypatch):
    """验证调用方可以显式指定不在 PATH 中的命令路径。"""
    paths = _build_paths(tmp_path)
    source_root = tmp_path / "custom-tools" / "custompkg"
    command_path = source_root / "bin" / "custom-cli"
    _write_mock_command(command_path)
    monkeypatch.setenv("PATH", "")

    service = CliManagerService(paths=paths)
    result = await service.apply(
        CliApplyRequest(
            name="custom-cli",
            mode="adopt",
            commands=["custom-cli"],
            command_paths={"custom-cli": str(command_path)},
            confirmed=True,
        )
    )

    assert result["name"] == "custom-cli"
    assert source_root.is_symlink()
    assert Path(result["command_targets"]["custom-cli"]).exists()
    assert Path(result["app_links"][0]["source"]) == source_root
    assert (paths.bin_dir / "custom-cli").exists()


@pytest.mark.asyncio
async def test_apply_rejects_command_path_for_unknown_command(tmp_path):
    """验证显式命令路径只能指向本次要持久化的命令。"""
    paths = _build_paths(tmp_path)
    service = CliManagerService(paths=paths)

    with pytest.raises(CliManagerError) as error:
        await service.apply(
            CliApplyRequest(
                name="mock-cli",
                mode="adopt",
                commands=["mock-cli"],
                command_paths={"other-cli": str(tmp_path / "other-cli")},
                confirmed=True,
            )
        )

    assert error.value.code == "command_path_unknown_command"
    assert error.value.context["command"] == "other-cli"


@pytest.mark.asyncio
async def test_apply_reports_existing_persisted_command_conflict(tmp_path, monkeypatch):
    """验证与现有持久化 CLI 的命令冲突会结构化返回。"""
    paths = _build_paths(tmp_path)
    source_root = tmp_path / "sandbox-home" / ".mock-tools" / "firstpkg"
    command_path = source_root / "bin" / "shared-cli"
    _write_mock_command(command_path)
    monkeypatch.setenv("PATH", str(command_path.parent))

    service = CliManagerService(paths=paths)
    await service.apply(
        CliApplyRequest(
            name="first-cli",
            mode="adopt",
            commands=["shared-cli"],
            confirmed=True,
        )
    )

    with pytest.raises(CliManagerError) as error:
        await service.apply(
            CliApplyRequest(
                name="second-cli",
                mode="adopt",
                commands=["shared-cli"],
                confirmed=True,
            )
        )

    assert error.value.code == "command_name_conflict"
    assert error.value.context["existing_owner"] == "first-cli"
    assert error.value.context["command"] == "shared-cli"


@pytest.mark.asyncio
async def test_apply_install_reports_path_conflict_before_install(tmp_path, monkeypatch):
    """验证 install 模式不会遮蔽 PATH 中已有的非持久化命令。"""
    paths = _build_paths(tmp_path)
    source_root = tmp_path / "sandbox-home" / ".mock-tools" / "existing"
    command_path = source_root / "bin" / "existing-cli"
    _write_mock_command(command_path)
    monkeypatch.setenv("PATH", str(command_path.parent))

    service = CliManagerService(paths=paths)
    with pytest.raises(CliManagerError) as error:
        await service.apply(
            CliApplyRequest(
                name="existing-cli",
                mode="install",
                install_command="echo should-not-run",
                commands=["existing-cli"],
                confirmed=True,
            )
        )

    assert error.value.code == "command_path_conflict"
    assert error.value.context["command"] == "existing-cli"


@pytest.mark.asyncio
async def test_remove_unlinks_app_link_without_deleting_user_replacement(tmp_path, monkeypatch):
    """验证移除时只删除仍指向托管目标的软链。"""
    paths = _build_paths(tmp_path)
    source_root = tmp_path / "sandbox-home" / ".mock-tools" / "mockpkg"
    command_path = source_root / "bin" / "mock-cli"
    _write_mock_command(command_path)
    monkeypatch.setenv("PATH", str(command_path.parent))

    service = CliManagerService(paths=paths)
    await service.apply(
        CliApplyRequest(
            name="mock-cli",
            mode="adopt",
            commands=["mock-cli"],
            confirmed=True,
        )
    )
    source_root.unlink()
    source_root.mkdir(parents=True)

    result = await service.remove(name="mock-cli", confirmed=True)

    assert result["status"] == "removed"
    assert source_root.exists()
    assert source_root.is_dir()


@pytest.mark.asyncio
async def test_initialize_from_environment_keeps_status_detection_after_restore_failure(monkeypatch):
    """验证 CLI 初始化恢复失败时仍会继续触发状态探测。"""
    marker = object()
    scheduled_contexts = []

    async def mock_restore(self):
        """模拟注册表恢复异常。"""
        raise RuntimeError("mock restore failure")

    def mock_schedule(agent_context):
        """记录状态探测是否被调度。"""
        scheduled_contexts.append(agent_context)

    monkeypatch.setattr(CliManagerService, "restore", mock_restore)
    monkeypatch.setattr(
        CliManagerService,
        "_schedule_initial_cli_status_detection",
        staticmethod(mock_schedule),
    )

    await CliManagerService.initialize_from_environment(marker)

    assert scheduled_contexts == [marker]


def test_apply_path_to_env_handles_path_resolver_failure(monkeypatch):
    """验证 PATH 注入失败会内敛在服务层，不要求调用方包 try。"""
    env_vars = {"PATH": "/usr/bin"}

    def mock_apply_path_to_env(target_env):
        """模拟路径解析器异常。"""
        raise RuntimeError("mock path failure")

    monkeypatch.setattr(CliManagerPathResolver, "apply_path_to_env", mock_apply_path_to_env)

    CliManagerService.apply_path_to_env(env_vars)

    assert env_vars == {"PATH": "/usr/bin"}
