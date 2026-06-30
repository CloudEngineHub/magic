import json
import runpy
import sys
import types
from pathlib import Path


SCRIPT_PATH = (
    Path(__file__).resolve().parents[2]
    / "agents"
    / "skills"
    / "using-cron"
    / "scripts"
    / "update.py"
)


def test_update_script_reads_message_content_from_file(monkeypatch, tmp_path, capsys):
    content_file = tmp_path / "message.txt"
    content_file.write_text("第一行\n第二行", encoding="utf-8")
    captured = {}

    class FakeTimeConfig:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class FakeUpdateMessageScheduleParameter:
        def __init__(self, **kwargs):
            captured["parameter"] = kwargs

    class FakeMessageScheduleSdk:
        def update_message_schedule(self, parameter):
            captured["sdk_parameter"] = parameter
            return types.SimpleNamespace(get_schedule_id=lambda: "schedule-1")

    def fake_factory():
        return types.SimpleNamespace(message_schedule=FakeMessageScheduleSdk())

    monkeypatch.setitem(sys.modules, "_context", types.ModuleType("_context"))
    factory_module = types.ModuleType("factory")
    factory_module.create_magic_service_sdk_with_defaults = fake_factory
    monkeypatch.setitem(
        sys.modules,
        "app.infrastructure.sdk.magic_service.factory",
        factory_module,
    )
    parameter_module = types.ModuleType("message_schedule_parameter")
    parameter_module.TimeConfig = FakeTimeConfig
    parameter_module.UpdateMessageScheduleParameter = FakeUpdateMessageScheduleParameter
    monkeypatch.setitem(
        sys.modules,
        "app.infrastructure.sdk.magic_service.parameter.message_schedule_parameter",
        parameter_module,
    )
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "update.py",
            "--id",
            "schedule-1",
            "--message-content-file",
            str(content_file),
        ],
    )

    runpy.run_path(str(SCRIPT_PATH), run_name="__main__")

    output = json.loads(capsys.readouterr().out)
    parameter = captured["parameter"]
    assert output == {"id": "schedule-1"}
    assert parameter["schedule_id"] == "schedule-1"
    assert parameter["message_type"] == "rich_text"
    assert parameter["message_content"] == {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "第一行"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": "第二行"}]},
        ],
    }
