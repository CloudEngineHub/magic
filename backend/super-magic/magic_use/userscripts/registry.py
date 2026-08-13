from __future__ import annotations

import json

from magic_use.userscripts.matcher import matches_url
from magic_use.userscripts.model import Userscript, UserscriptRunAt


class UserscriptRegistry:
    """保存宿主显式提供的 Userscript，不扫描文件系统。"""

    def __init__(self, scripts: tuple[Userscript, ...] = ()) -> None:
        names: set[str] = set()
        for script in scripts:
            if script.name in names:
                raise ValueError(f"Duplicate userscript name: {script.name}")
            names.add(script.name)
        self._scripts = scripts

    @property
    def scripts(self) -> tuple[Userscript, ...]:
        return self._scripts

    def matching(self, url: str, run_at: UserscriptRunAt) -> tuple[Userscript, ...]:
        matched: list[Userscript] = []
        for script in self._scripts:
            if not script.enabled or script.run_at is not run_at:
                continue
            try:
                if matches_url(url, script.match_patterns, script.exclude_patterns):
                    matched.append(script)
            except ValueError:
                # 单个脚本的非法匹配规则不能阻断页面或其他脚本。
                continue
        return tuple(matched)

    def document_start_sources(self) -> tuple[str, ...]:
        return tuple(
            _document_start_source(script)
            for script in self._scripts
            if script.enabled and script.run_at is UserscriptRunAt.DOCUMENT_START
        )


def _document_start_source(script: Userscript) -> str:
    payload = json.dumps(
        {
            "name": script.name,
            "source": script.source,
            "hash": script.source_hash,
            "matches": script.match_patterns,
            "excludes": script.exclude_patterns,
        },
        ensure_ascii=False,
    )
    template = r"""
(() => {
  const payload = __PAYLOAD__;
  const wildcard = value => value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const matches = pattern => {
    if (pattern === "<all_urls>") return /^(?:https?|file|ftp):/.test(location.href);
    const parsed = /^(\*|http|https|file|ftp):\/\/([^/]*)(\/.*)$/.exec(pattern);
    if (!parsed) return false;
    const scheme = parsed[1] === "*" ? "https?" : wildcard(parsed[1]);
    let host;
    if (parsed[2] === "*") host = "[^/:]+";
    else if (parsed[2].startsWith("*.")) host = "(?:[^/:]+\\.)?" + wildcard(parsed[2].slice(2));
    else host = wildcard(parsed[2]);
    if (parsed[1] !== "file") host += "(?::\\d+)?";
    return new RegExp("^" + scheme + "://" + host + wildcard(parsed[3]) + "$").test(location.href);
  };
  if (!payload.matches.some(matches) || payload.excludes.some(matches)) return;
  const loaded = globalThis.__magicUseUserscripts || {};
  if (loaded[payload.name] === payload.hash) return;
  try {
    (0, eval)(payload.source);
    globalThis.__magicUseUserscripts = globalThis.__magicUseUserscripts || {};
    globalThis.__magicUseUserscripts[payload.name] = payload.hash;
  } catch (error) {
    console.warn(`[magic_use] Userscript '${payload.name}' failed`, error);
  }
})();
"""
    return template.replace("__PAYLOAD__", payload).strip()
