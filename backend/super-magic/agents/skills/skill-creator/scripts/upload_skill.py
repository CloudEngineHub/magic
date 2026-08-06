#!/usr/bin/env python3
"""
Upload a generated skill package (.zip from package_skill) to My Skill Library.
This script is independent so packaging and upload can be run separately.

API notes
---------
Upload endpoint: POST /api/v1/open-api/sandbox/skills/import-from-agent
Auth: SandboxUserAuthMiddleware, injected automatically by the SDK.

multipart/form-data fields:
  file          : zip package, usually .zip or legacy .skill. The SDK may copy it to a temp .zip before request.
  source        : string enum, fixed to "AGENT_CREATED"
  name_i18n     : optional JSON string
  description_i18n: optional JSON string

Usage
-----
python scripts/upload_skill.py <path-to.zip>
    [--name-zh Chinese Name]
    [--name-en English Name]
    [--max-attempts N]
    [--retry-delay SECONDS]

Examples
--------
python scripts/upload_skill.py /path/to/my-skill-v1.0.0.zip
python scripts/upload_skill.py ./meeting-minutes-v1.0.0.zip --name-zh "Meeting Notes" --name-en "Meeting Notes"
python scripts/upload_skill.py ./x.zip --max-attempts 5 --retry-delay 2
"""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Optional

import _skill_scripts_bootstrap  # noqa: F401


async def _upload_one_attempt(
    skill_file: Path,
    name_i18n: Optional[dict],
    description_i18n: Optional[dict],
) -> tuple[bool, Optional[str]]:
    """
    Run one upload attempt. On success, print ok JSON and return (True, None);
    on failure, return (False, error_message).
    """
    try:
        from app.infrastructure.sdk.magic_service.factory import create_magic_service_sdk_with_defaults
        from app.infrastructure.sdk.magic_service.parameter.import_skill_from_agent_parameter import (
            ImportSkillFromAgentParameter,
        )
    except ImportError as e:
        return False, f"Failed to import SDK; make sure this runs in the project environment: {e}"

    tmp_zip: Optional[Path] = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as f:
            tmp_zip = Path(f.name)
        await asyncio.to_thread(shutil.copy2, skill_file, tmp_zip)

        sdk = create_magic_service_sdk_with_defaults()
        parameter = ImportSkillFromAgentParameter(
            file_path=str(tmp_zip),
            source="AGENT_CREATED",
            name_i18n=name_i18n,
            description_i18n=description_i18n,
        )

        result = await asyncio.to_thread(sdk.skill.import_skill_from_agent, parameter)

        action = "created" if result.is_newly_created() else "updated"
        print(json.dumps({
            "status": "ok",
            "action": action,
            "id": result.get_id(),
            "code": result.get_code(),
            "name": result.get_name(),
        }, ensure_ascii=False))
        return True, None

    except Exception as e:
        return False, str(e)
    finally:
        if tmp_zip and await asyncio.to_thread(tmp_zip.exists):
            await asyncio.to_thread(tmp_zip.unlink)


async def upload_skill_file(
    skill_file: Path,
    name_i18n: Optional[dict] = None,
    description_i18n: Optional[dict] = None,
    *,
    max_attempts: int = 3,
    retry_base_delay_sec: float = 1.0,
) -> bool:
    """
    Upload a skill zip package to My Skill Library with exponential-backoff retry.

    The backend accepts zip packages such as .zip or legacy .skill. Each attempt
    copies the input to a temporary .zip before calling the SDK, then removes it.
    """
    last_error: Optional[str] = None

    for attempt in range(1, max_attempts + 1):
        ok, err = await _upload_one_attempt(skill_file, name_i18n, description_i18n)
        if ok:
            return True
        last_error = err or "unknown error"

        # Environment errors such as ImportError fail immediately and are not retried.
        if attempt == 1 and err and err.startswith("Failed to import SDK"):
            print(json.dumps({"status": "error", "error": last_error}, ensure_ascii=False))
            return False

        if attempt < max_attempts:
            delay = retry_base_delay_sec * (2 ** (attempt - 1))
            print(
                f"Upload attempt {attempt}/{max_attempts} failed: {last_error}. "
                f"Retrying in {delay:.1f}s...",
                file=sys.stderr,
            )
            await asyncio.sleep(delay)

    print(json.dumps({"status": "error", "error": last_error}, ensure_ascii=False))
    return False


async def _main() -> None:
    parser = argparse.ArgumentParser(
        description="Upload a skill zip package to My Skill Library",
    )
    parser.add_argument("skill_file", help="Packaged .zip path, or a legacy .skill with zip-compatible content")
    parser.add_argument("--name-zh", default=None, metavar="NAME",
                        help="Override the Chinese display name during upload")
    parser.add_argument("--name-en", default=None, metavar="NAME",
                        help="Override the English display name during upload")
    parser.add_argument(
        "--max-attempts",
        type=int,
        default=3,
        metavar="N",
        help="Maximum attempt count, including the first attempt. Default: 3",
    )
    parser.add_argument(
        "--retry-delay",
        type=float,
        default=1.0,
        metavar="SECONDS",
        help="Base retry delay in seconds; actual delay uses exponential backoff base*2^(k-1). Default: 1.0",
    )
    args = parser.parse_args()

    if args.max_attempts < 1:
        print("Error: --max-attempts must be >= 1", file=sys.stderr)
        sys.exit(1)
    if args.retry_delay < 0:
        print("Error: --retry-delay must be >= 0", file=sys.stderr)
        sys.exit(1)

    skill_file = Path(args.skill_file).resolve()
    if not await asyncio.to_thread(skill_file.exists):
        print(f"Error: File not found: {skill_file}")
        sys.exit(1)
    if not await asyncio.to_thread(skill_file.is_file):
        print(f"Error: Not a file: {skill_file}")
        sys.exit(1)

    print(f"Uploading: {skill_file}\n")

    name_i18n: Optional[dict] = None
    if args.name_zh or args.name_en:
        name_i18n = {}
        if args.name_zh:
            name_i18n["zh_CN"] = args.name_zh
        if args.name_en:
            name_i18n["en_US"] = args.name_en

    ok = await upload_skill_file(
        skill_file,
        name_i18n=name_i18n,
        max_attempts=args.max_attempts,
        retry_base_delay_sec=args.retry_delay,
    )
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    asyncio.run(_main())
