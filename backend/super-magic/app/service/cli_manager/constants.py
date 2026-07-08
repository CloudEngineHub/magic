"""第三方 CLI 持久化常量。"""

from __future__ import annotations

import re
from pathlib import Path

SCHEMA_VERSION = 1
DEFAULT_TIMEOUT_SECONDS = 300
MAX_APP_SIZE_BYTES = 300 * 1024 * 1024
MAX_APP_FILES = 10_000
NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")

PROTECTED_COMMAND_NAMES = {
    "sh",
    "bash",
    "zsh",
    "python",
    "python3",
    "pip",
    "pip3",
    "node",
    "npm",
    "npx",
    "pnpm",
    "git",
    "curl",
    "wget",
    "sudo",
    "su",
    "rm",
    "cp",
    "mv",
    "cat",
    "ls",
}

SYSTEM_ROOTS = (
    Path("/bin"),
    Path("/sbin"),
    Path("/usr/local"),
    Path("/usr/bin"),
    Path("/usr/sbin"),
    Path("/usr/lib"),
    Path("/usr/lib64"),
    Path("/opt"),
    Path("/lib"),
    Path("/lib64"),
    Path("/etc"),
)

CLI_PREFIX_BIN_RELATIVE_PATHS = (
    "prefixes/node/bin",
    "prefixes/pipx/bin",
    "prefixes/uv/bin",
    "prefixes/go/bin",
    "prefixes/cargo/bin",
    "prefixes/standalone/bin",
)
