import json
import sys
import types
from importlib import util
from pathlib import Path

import pytest

parser_module = types.ModuleType("app.tools.design.utils.magic_project_design_parser")
parser_module.MagicProjectConfig = object
parser_module.flatten_all_elements = lambda config: []
stubbed_module_names = [
    "app.tools",
    "app.tools.design",
    "app.tools.design.utils",
    "app.tools.design.utils.magic_project_design_parser",
]
original_modules = {name: sys.modules.get(name) for name in stubbed_module_names}

module_path = (
    Path(__file__).resolve().parents[2]
    / "app"
    / "tools"
    / "design"
    / "utils"
    / "element_details_store.py"
)
spec = util.spec_from_file_location("element_details_store_under_test", module_path)
element_details_store = util.module_from_spec(spec)
assert spec and spec.loader
try:
    sys.modules["app.tools"] = types.ModuleType("app.tools")
    sys.modules["app.tools.design"] = types.ModuleType("app.tools.design")
    sys.modules["app.tools.design.utils"] = types.ModuleType("app.tools.design.utils")
    sys.modules["app.tools.design.utils.magic_project_design_parser"] = parser_module
    spec.loader.exec_module(element_details_store)
finally:
    for name, original_module in original_modules.items():
        if original_module is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = original_module

merge_readable_element_details = element_details_store.merge_readable_element_details
read_element_details = element_details_store.read_element_details
read_readable_element_details = element_details_store.read_readable_element_details


def test_merge_readable_element_details_prefers_tagged_user_entries():
    agent_details = {
        "version": "1.0.0",
        "elements": {
            "image-1": {"generateImageRequest": {"prompt": "agent"}},
            "video-1": {"generateVideoRequest": {"prompt": "agent"}},
        },
    }
    user_details = {
        "version": "1.0.0",
        "elements": {
            "image-1": {
                "generateImageRequest": {"prompt": "user"},
                "source": "user",
            },
            "video-1": {"generateVideoRequest": {"prompt": "legacy-user"}},
            "vu-1": {
                "visualUnderstanding": {"summary": "from upgrade"},
                "source": "user",
            },
        },
    }

    merged = merge_readable_element_details(agent_details, user_details)

    assert merged["elements"]["image-1"]["generateImageRequest"] == {"prompt": "user"}
    assert merged["elements"]["video-1"]["generateVideoRequest"] == {"prompt": "agent"}
    assert merged["elements"]["vu-1"]["visualUnderstanding"] == {"summary": "from upgrade"}
    assert "source" not in merged["elements"]["image-1"]


@pytest.mark.asyncio
async def test_read_readable_element_details_falls_back_to_user_sidecar(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setattr(
        element_details_store.PathManager,
        "get_workspace_dir",
        lambda: tmp_path,
    )
    project_dir = tmp_path / "design-project"
    project_dir.mkdir()
    (project_dir / "element-details-user.json").write_text(
        json.dumps(
            {
                "version": "1.0.0",
                "elements": {
                    "video-1": {
                        "generateVideoRequest": {"prompt": "upgraded-v1"},
                        "source": "user",
                    }
                },
            }
        ),
        encoding="utf-8",
    )

    agent_only = await read_element_details("design-project")
    readable = await read_readable_element_details("design-project")

    assert agent_only["elements"] == {}
    assert readable["elements"]["video-1"]["generateVideoRequest"] == {
        "prompt": "upgraded-v1"
    }
