import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("generate_catalog.py")
SPEC = importlib.util.spec_from_file_location("generate_catalog", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SyncCatalogTest(unittest.TestCase):
    def test_reads_structured_typography_tokens(self):
        style = MODULE.read_style(
            MODULE.STYLES_ROOT / "apple" / "DESIGN.md",
        )

        self.assertGreater(len(style["design"]["typography"]), 0)
        self.assertEqual(style["design"]["typography"][0]["fontSize"], "56px")

    def test_falls_back_to_body_tokens_without_frontmatter(self):
        style = MODULE.read_style(
            MODULE.STYLES_ROOT / "starbucks" / "DESIGN.md",
        )

        self.assertGreater(len(style["design"]["colors"]), 0)
        self.assertGreater(len(style["design"]["typography"]), 0)

    def test_body_typography_ignores_prose_and_css_values(self):
        for code, expected in (("runwayml", "abcNormal"), ("theverge", "Manuka")):
            style = MODULE.read_style(MODULE.STYLES_ROOT / code / "DESIGN.md")
            names = {
                str(token.get("fontFamily"))
                for token in style["design"]["typography"]
                if token.get("fontFamily")
            }

            self.assertIn(expected, names)
            self.assertNotIn("commitment", names)
            self.assertNotIn("system", names)
            self.assertFalse(any(name.startswith("color(") for name in names))

    def test_frontend_style_omits_skill_only_fields(self):
        style = MODULE.read_style(MODULE.STYLES_ROOT / "apple" / "DESIGN.md")
        frontend_style = MODULE.build_frontend_style(style)

        self.assertEqual(
            set(frontend_style),
            {"code", "title", "description", "category", "tags", "featured", "preview", "design"},
        )
        self.assertNotIn("file", frontend_style)
        self.assertNotIn("sha256", frontend_style)
        self.assertNotIn("categoryLabel", frontend_style)
        self.assertIn(frontend_style["preview"]["layout"], {"poster", "dashboard", "editorial", "commerce"})
        self.assertLessEqual(len(frontend_style["design"]["components"]), 12)
        self.assertLessEqual(
            len(frontend_style["design"]["sections"]),
            len(style["design"]["sections"]),
        )


if __name__ == "__main__":
    unittest.main()
