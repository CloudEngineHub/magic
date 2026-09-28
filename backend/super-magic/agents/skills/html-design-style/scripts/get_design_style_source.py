#!/usr/bin/env python3
"""
Fetch the raw DESIGN.md source for one bundled html design style.

Arguments:
    style_code   Required. Bundled design style identifier, e.g. "apple".

Output format: JSON on stdout.

    {
      "style_code": "apple",
      "content": "---\\nname: Apple\\n...",
      "sha256": "..."
    }

The design documents are owned by Magic Service; this script never reads a
local copy. On failure it prints a JSON error object and exits non-zero.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

# agents/skills/_shared/ is under parents[2] for all skill scripts.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import _shared.bootstrap  # noqa: F401 — initialize runtime environment

from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
from app.infrastructure.sdk.magic_service.parameter.get_html_design_style_source_parameter import (
    GetHtmlDesignStyleSourceParameter,
)

STYLE_CODE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9.-]*$")

parser = argparse.ArgumentParser(description="Fetch a bundled DESIGN.md source by style_code")
parser.add_argument("style_code", help="Bundled design style identifier")
args = parser.parse_args()

style_code = args.style_code.strip()
if not STYLE_CODE_PATTERN.match(style_code):
    print(json.dumps({"error": "invalid_style_code", "style_code": style_code}, ensure_ascii=False))
    sys.exit(1)

try:
    sdk = get_magic_service_sdk()
    result = sdk.html_design_style.get_source(
        GetHtmlDesignStyleSourceParameter(style_code)
    )
    print(json.dumps(result.to_dict(), ensure_ascii=False))
except Exception as e:
    output = {"error": "failed to fetch design style source", "style_code": style_code}
    if os.getenv("HTML_DESIGN_STYLE_DEBUG_ERRORS") == "1":
        output["debug_error"] = str(e)
    print(json.dumps(output, ensure_ascii=False))
    sys.exit(1)
