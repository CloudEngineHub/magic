import json
import os
import subprocess
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
LANGUAGE_SCRIPTS = [
    PROJECT_ROOT / "agents" / "skills" / "crew-creator" / "scripts" / "language.py",
    PROJECT_ROOT / "agents" / "skills" / "skill-creator" / "scripts" / "language.py",
]


@pytest.mark.parametrize("script_path", LANGUAGE_SCRIPTS)
def test_language_scripts_pass_through_new_frontend_languages(tmp_path, script_path):
    metadata_path = tmp_path / "metadata.json"
    metadata_path.write_text(json.dumps({"language": "fr_FR"}), encoding="utf-8")
    env = {**os.environ, "USER_AUTH_METADATA_PATH": str(metadata_path)}

    result = subprocess.run(
        [str(PROJECT_ROOT / "venv" / "bin" / "python"), str(script_path)],
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    payload = json.loads(result.stdout)

    assert payload["language"] == "fr_FR"
    assert payload["language_name"] == "fr_FR"


@pytest.mark.parametrize("script_path", LANGUAGE_SCRIPTS)
def test_language_scripts_fall_back_for_non_utf8_metadata(tmp_path, script_path):
    metadata_path = tmp_path / "metadata.json"
    metadata_path.write_bytes(b'\xff\xfe{"language":"en_US"}')
    env = {**os.environ, "USER_AUTH_METADATA_PATH": str(metadata_path)}

    result = subprocess.run(
        [str(PROJECT_ROOT / "venv" / "bin" / "python"), str(script_path)],
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    payload = json.loads(result.stdout)

    assert payload["language"] == "zh_CN"
    assert payload["language_name"] == "zh_CN"