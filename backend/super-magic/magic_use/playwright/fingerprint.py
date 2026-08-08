from __future__ import annotations

import platform
import re
from dataclasses import dataclass

from playwright.async_api import Browser

_HEADLESS_BRAND = "HeadlessChrome"
_CHROME_BRAND = "Google Chrome"
_MAJOR_VERSION_PATTERN = re.compile(r"Chrome/(\d+)")
_PLATFORM_BY_SYSTEM = {"Linux": "Linux", "Darwin": "macOS", "Windows": "Windows"}


@dataclass(frozen=True, slots=True)
class UserAgentOverride:
    user_agent: str
    major_version: str
    platform_name: str

    def to_cdp_params(self, accept_language: str) -> dict[str, object]:
        return {
            "userAgent": self.user_agent,
            "acceptLanguage": accept_language,
            "userAgentMetadata": {
                "brands": [
                    {"brand": "Not(A:Brand", "version": "24"},
                    {"brand": "Chromium", "version": self.major_version},
                    {"brand": _CHROME_BRAND, "version": self.major_version},
                ],
                "fullVersion": self.user_agent.split("Chrome/")[-1].split(" ")[0],
                "platform": self.platform_name,
                "platformVersion": "",
                "architecture": "",
                "model": "",
                "mobile": False,
            },
        }


async def resolve_user_agent_override(browser: Browser) -> UserAgentOverride | None:
    session = await browser.new_browser_cdp_session()
    try:
        version = await session.send("Browser.getVersion")
    finally:
        await session.detach()
    raw_user_agent = str(version.get("userAgent", ""))
    if _HEADLESS_BRAND not in raw_user_agent:
        return None
    user_agent = raw_user_agent.replace(_HEADLESS_BRAND, "Chrome")
    matched = _MAJOR_VERSION_PATTERN.search(user_agent)
    if matched is None:
        return None
    return UserAgentOverride(
        user_agent=user_agent,
        major_version=matched.group(1),
        platform_name=_PLATFORM_BY_SYSTEM.get(platform.system(), "Linux"),
    )
