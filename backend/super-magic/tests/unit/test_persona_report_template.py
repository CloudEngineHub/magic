"""验证报告模板的阅读顺序与引用完整性，不依赖 Agent 运行环境。"""

from html.parser import HTMLParser
from pathlib import Path
import unittest


TEMPLATE = Path(__file__).resolve().parents[2] / "agents/skills/persona-research/reference/report-template.html"


class ReportDocument(HTMLParser):
    def __init__(self, content):
        super().__init__()
        self.ids = []
        self.sections = []
        self.contents = []
        self.citations = []
        self.before_summary = []
        self.in_contents = False
        self.summary_seen = False
        self.feed(content)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get("class", "").split()
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "section":
            self.sections.append(attrs.get("id"))
            self.summary_seen |= attrs.get("id") == "summary"
        if not self.summary_seen:
            self.before_summary.append((tag, attrs))
        if tag == "aside" and "toc" in classes:
            self.in_contents = True
        if tag == "a" and self.in_contents:
            self.contents.append(attrs.get("href", "").removeprefix("#"))
        if tag == "a" and "citation-ref" in classes:
            self.citations.append(attrs.get("href", "").removeprefix("#"))

    def handle_endtag(self, tag):
        if tag == "aside":
            self.in_contents = False


class PersonaReportTemplateTest(unittest.TestCase):
    def setUp(self):
        self.document = ReportDocument(TEMPLATE.read_text(encoding="utf-8"))

    def test_reading_order_and_contents_agree(self):
        expected = [
            "summary", "hypotheses", "business", "method", "findings", "real-voices",
            "tensions", "personas", "voices", "limitations", "validation", "sources",
        ]
        self.assertEqual(self.document.sections, expected)
        self.assertEqual(self.document.contents, expected)

    def test_decision_precedes_decorative_and_method_content(self):
        for tag, attrs in self.document.before_summary:
            self.assertNotEqual(tag, "figure")
            self.assertNotIn("data-persona", attrs)
            self.assertNotIn("fact", attrs.get("class", "").split())

    def test_citations_resolve_to_unique_targets(self):
        self.assertTrue(self.document.citations)
        self.assertEqual(len(self.document.ids), len(set(self.document.ids)))
        self.assertEqual(set(self.document.citations) - set(self.document.ids), set())


if __name__ == "__main__":
    unittest.main()
