from dataclasses import dataclass
from enum import StrEnum
import json
from typing import Iterable, Mapping, Optional

from agentlang.utils.tool_param_utils import parse_multiline_kv


class AudioAnalysisScope(StrEnum):
    CONFIGURED_ANALYSIS_FILES = "configured_analysis_files"
    TEMPLATE_ANALYSIS_FILES = "template_analysis_files"


AUDIO_ANALYSIS_SOURCE_FILE_KEYS = frozenset({"audio", "video", "transcript", "notes"})


@dataclass(frozen=True)
class AudioAnalysisSpec:
    key: str
    cn_name: str
    en_name: str
    default_suffix: str
    extension: str
    include_in_template_reanalysis: bool = True
    panel_id: Optional[str] = None
    panel_type: str = "markdown"
    panel_title: Optional[str] = None
    panel_icon: Optional[str] = None

    def default_filename(self, project_title: str) -> str:
        title = (project_title or "").strip() or "录音分析"
        return f"{title}-{self.default_suffix}.{self.extension}"

    def panel_entry(self) -> Optional[dict]:
        if not self.panel_id:
            return None
        return {
            "file_key": self.key,
            "id": self.panel_id,
            "type": self.panel_type,
            "title": self.panel_title or self.cn_name,
            "icon": self.panel_icon or "description",
        }


@dataclass
class AudioAnalysisPlan:
    task_names: list[str]
    new_files_mapping: dict[str, str]
    panel_entries: list[dict]


AUDIO_ANALYSIS_SPECS: Mapping[str, AudioAnalysisSpec] = {
    "topics": AudioAnalysisSpec(
        key="topics",
        cn_name="章节主题分析",
        en_name="Chapter Topics",
        default_suffix="章节主题",
        extension="md",
        panel_id=None,
    ),
    "summary": AudioAnalysisSpec(
        key="summary",
        cn_name="会议总结",
        en_name="Summary",
        default_suffix="纪要",
        extension="md",
        panel_id="minutes",
        panel_title="内容总结",
        panel_icon="description",
    ),
    "followup": AudioAnalysisSpec(
        key="followup",
        cn_name="待办事项",
        en_name="Follow-up",
        default_suffix="待办事项",
        extension="md",
        panel_id="followup",
        panel_title="待办事项",
        panel_icon="task_alt",
    ),
    "power_dynamics": AudioAnalysisSpec(
        key="power_dynamics",
        cn_name="权力动态分析",
        en_name="Power Dynamics",
        default_suffix="权力动态",
        extension="md",
        panel_id="power-dynamics",
        panel_title="权力动态",
        panel_icon="psychology",
    ),
    "intent": AudioAnalysisSpec(
        key="intent",
        cn_name="意图分析",
        en_name="Intent Analysis",
        default_suffix="意图分析",
        extension="md",
        panel_id="intent",
        panel_title="意图分析",
        panel_icon="visibility",
    ),
    "metrics": AudioAnalysisSpec(
        key="metrics",
        cn_name="关键量化数据",
        en_name="Metrics",
        default_suffix="关键数据",
        extension="html",
        panel_id="metrics",
        panel_type="iframe",
        panel_title="关键数据",
        panel_icon="analytics",
    ),
    "mindmap": AudioAnalysisSpec(
        key="mindmap",
        cn_name="思维导图",
        en_name="Mind Map",
        default_suffix="思维导图",
        extension="md",
        panel_id="mindmap",
        panel_type="mindmap",
        panel_title="思维导图",
        panel_icon="account_tree",
    ),
    "insights": AudioAnalysisSpec(
        key="insights",
        cn_name="深度洞察",
        en_name="Insights",
        default_suffix="深度洞察",
        extension="md",
        panel_id="insights",
        panel_title="深度洞察",
        panel_icon="lightbulb",
    ),
    "highlights": AudioAnalysisSpec(
        key="highlights",
        cn_name="金句分析",
        en_name="Highlights",
        default_suffix="金句",
        extension="md",
        panel_id="highlights",
        panel_title="金句分析",
        panel_icon="format_quote",
    ),
}


def get_analysis_spec(key: str) -> Optional[AudioAnalysisSpec]:
    return AUDIO_ANALYSIS_SPECS.get(key)


def analysis_task_name_map() -> dict[str, dict[str, str]]:
    return {
        key: {"cn": spec.cn_name, "en": spec.en_name}
        for key, spec in AUDIO_ANALYSIS_SPECS.items()
    }


def template_analysis_keys() -> list[str]:
    return [
        key
        for key, spec in AUDIO_ANALYSIS_SPECS.items()
        if spec.include_in_template_reanalysis
    ]


def configured_analysis_keys(files: Mapping[str, str]) -> list[str]:
    return [key for key in AUDIO_ANALYSIS_SPECS if key in files]


def panel_entries_for_file_keys(keys: Iterable[str]) -> list[dict]:
    entries = []
    for key in keys:
        spec = get_analysis_spec(key)
        if not spec:
            continue
        entry = spec.panel_entry()
        if entry:
            entries.append(entry)
    return entries


def _project_title(config: Mapping) -> str:
    metadata = config.get("metadata", {}) or {}
    return metadata.get("title") or config.get("name") or "录音分析"


def _split_key_only_types(raw_types: str) -> dict[str, str]:
    return {
        item.strip(): ""
        for item in raw_types.replace("\n", ",").split(",")
        if item.strip()
    }


def _parse_specified_analysis_types(specified_analysis_types) -> Optional[dict[str, str]]:
    if specified_analysis_types is None:
        return None

    if isinstance(specified_analysis_types, str):
        raw_types = specified_analysis_types.strip()
        if not raw_types:
            return None

        if raw_types[0] in "[{":
            try:
                parsed_json = json.loads(raw_types)
            except json.JSONDecodeError:
                parsed_json = None
            if parsed_json is not None and not isinstance(parsed_json, str):
                return _parse_specified_analysis_types(parsed_json)

        if ":" in raw_types:
            parsed = parse_multiline_kv(raw_types, "specified_analysis_types")
            return parsed or None

        parsed = _split_key_only_types(raw_types)
        return parsed or None

    if isinstance(specified_analysis_types, Mapping):
        parsed = {
            str(analysis_type).strip(): "" if filename is None else str(filename).strip()
            for analysis_type, filename in specified_analysis_types.items()
            if str(analysis_type).strip()
        }
        return parsed or None

    if isinstance(specified_analysis_types, Iterable):
        parsed = {
            str(analysis_type).strip(): ""
            for analysis_type in specified_analysis_types
            if str(analysis_type).strip()
        }
        return parsed or None

    raise ValueError("specified_analysis_types must be a string, list, or object")


def build_audio_analysis_plan(
    config: Mapping,
    analysis_scope: AudioAnalysisScope | str,
    specified_analysis_types,
) -> AudioAnalysisPlan:
    config_files = config.get("files", {}) or {}
    project_title = _project_title(config)
    parsed_specified_types = _parse_specified_analysis_types(specified_analysis_types)

    if parsed_specified_types is not None:
        task_names = []
        new_files_mapping = {}

        for analysis_type, filename in parsed_specified_types.items():
            spec = get_analysis_spec(analysis_type)
            if not spec:
                raise ValueError(f"Unsupported analysis type: {analysis_type}")
            resolved_filename = filename.strip() if filename else ""
            if not resolved_filename:
                resolved_filename = config_files.get(analysis_type) or spec.default_filename(project_title)

            task_names.append(analysis_type)
            if analysis_type not in config_files:
                new_files_mapping[analysis_type] = resolved_filename

        return AudioAnalysisPlan(
            task_names=task_names,
            new_files_mapping=new_files_mapping,
            panel_entries=panel_entries_for_file_keys(new_files_mapping.keys()),
        )

    try:
        scope = AudioAnalysisScope(analysis_scope)
    except ValueError as e:
        raise ValueError(f"Unsupported analysis scope: {analysis_scope}") from e

    if scope == AudioAnalysisScope.CONFIGURED_ANALYSIS_FILES:
        return AudioAnalysisPlan(
            task_names=configured_analysis_keys(config_files),
            new_files_mapping={},
            panel_entries=[],
        )

    if scope == AudioAnalysisScope.TEMPLATE_ANALYSIS_FILES:
        task_names = template_analysis_keys()
        new_files_mapping = {}

        for analysis_type in task_names:
            if analysis_type in config_files:
                continue
            spec = get_analysis_spec(analysis_type)
            if not spec:
                raise ValueError(f"Unsupported analysis type: {analysis_type}")
            new_files_mapping[analysis_type] = spec.default_filename(project_title)

        return AudioAnalysisPlan(
            task_names=task_names,
            new_files_mapping=new_files_mapping,
            panel_entries=panel_entries_for_file_keys(new_files_mapping.keys()),
        )

    raise ValueError(f"Unsupported analysis scope: {analysis_scope}")


def successful_new_analysis_updates(
    plan: AudioAnalysisPlan,
    failed_tasks: Iterable[str],
) -> tuple[dict[str, str], list[dict]]:
    failed_set = set(failed_tasks)
    new_files_mapping = {
        task_name: filename
        for task_name, filename in plan.new_files_mapping.items()
        if task_name not in failed_set
    }
    panel_entries = [
        entry
        for entry in plan.panel_entries
        if entry.get("file_key") in new_files_mapping
    ]
    return new_files_mapping, panel_entries


def apply_analysis_files_to_config(
    config_data: dict,
    new_files: Mapping[str, str],
    panel_entries: Optional[Iterable[dict]] = None,
) -> None:
    config_data.setdefault("files", {})
    for analysis_type, filename in new_files.items():
        config_data["files"][analysis_type] = filename

    if not panel_entries:
        return

    existing_panels = config_data.get("analysis_panels")
    if not isinstance(existing_panels, list):
        existing_panels = []

    existing_file_keys = {
        panel.get("file_key") or panel.get("fileKey")
        for panel in existing_panels
        if isinstance(panel, dict)
    }

    for panel_entry in panel_entries:
        file_key = panel_entry.get("file_key") or panel_entry.get("fileKey")
        if not file_key or file_key in existing_file_keys:
            continue
        existing_panels.append(panel_entry)
        existing_file_keys.add(file_key)

    config_data["analysis_panels"] = existing_panels
