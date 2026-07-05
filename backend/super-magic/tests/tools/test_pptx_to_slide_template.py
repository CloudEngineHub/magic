from app.tools.pptx_to_slide_template import runner


def test_resolve_output_root_defaults_to_visible_workspace_directory(tmp_path):
    assert runner._resolve_output_root("", tmp_path) == tmp_path / "slide-templates"


def test_static_renderer_bundle_defaults_widescreen_to_1920_by_1080():
    bundle = runner._static_bundle_path().read_text(encoding="utf-8")

    assert "return { width: 1920, height: 1080 }" in bundle
