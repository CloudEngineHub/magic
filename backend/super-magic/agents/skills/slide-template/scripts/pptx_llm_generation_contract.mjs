export function buildLlmGenerationContract() {
  return {
    requires_visual_html_review: true,
    review_unit: "one source slide plus its visual evidence and rendered HTML",
    decision_options: ["retain", "parameterize", "replace_with_placeholder", "drop"],
    required_outputs: [
      "source-to-template mapping",
      "placeholder plan",
      "common layout/component classes",
      "inline style exceptions",
    ],
    rules: [
      "Compare each slide screenshot or PDF rendering with its slides-html/slide-*.html before generating final files.",
      "Retain HTML structure that carries layout, grouping, chart/table shells, image masks, decorative geometry, or interaction-free visual hierarchy.",
      "Parameterize repeated text, metric, list, table, chart, and image content into reusable template placeholders.",
      "Replace source business content with placeholders only after deciding the underlying structure should remain reusable.",
      "Drop duplicated wrappers, renderer navigation wrappers, and non-visual helper nodes only when visual evidence confirms no visible role.",
      "Record source-to-template mapping so visual-spec.md, theme.css, source.css, template-pages.json, and pages/*.html stay aligned.",
    ],
  };
}
