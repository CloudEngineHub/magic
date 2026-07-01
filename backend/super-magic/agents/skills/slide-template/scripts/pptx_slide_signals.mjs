import { relative } from "node:path";

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function extractStyleValue(style, prop) {
  return style.getPropertyValue(prop) || style[prop] || "";
}

function addColor(counts, value) {
  if (!value) return;
  const colors = String(value).match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g) || [];
  for (const color of colors) {
    counts.set(color.toUpperCase(), (counts.get(color.toUpperCase()) || 0) + 1);
  }
}

function addFont(counts, value) {
  if (!value) return;
  const fonts = String(value)
    .split(",")
    .map((font) => font.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  for (const font of fonts) {
    counts.set(font, (counts.get(font) || 0) + 1);
  }
}

export function topCounts(counts, keyName, limit = 12) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ [keyName]: value, count }));
}

function classifySlide({ index, textRuns, imageCount, svgCount, tableCount, elementCount }) {
  const text = normalizeText(textRuns.map((item) => item.text).join(" "));
  const hasContentsText = /目录|contents/i.test(text);
  const hasTimelineText = /时间|阶段|timeline|schedule|plan|roadmap|进度|月份|季度/i.test(text);
  const hasCompareText = /对比|compare|versus|vs\.?|差异|优劣/i.test(text);
  const hasProcessText = /流程|步骤|step|process|路径|循环|pdca/i.test(text);
  const hasProblemText = /问题\d|问题分析|短板|长板|补救/i.test(text);
  const hasNamedContentPage = /[两三四五多]段内容页/i.test(text);
  const hasChartSignal = svgCount >= 40 && /%|万元|人数|成本|率|数据|指标|kpi|roi/i.test(text);

  if (hasContentsText) return ["contents", "Contents Page", "numbered-navigation-list"];
  if (tableCount > 0) return ["table", "Table Page", "structured-table-grid"];
  if (imageCount > 0) return ["image", "Image Page", "image-with-text-composition"];
  if (index === 0 && textRuns.length <= 8) return ["cover", "Cover Page", "large-title-cover"];
  if (hasProcessText) return ["process", "Process Page", "step-flow"];
  if (hasTimelineText) return ["timeline", "Timeline Page", "time-based-sequence"];
  if (hasProblemText) return ["comparison", "Comparison Page", "problem-solution-comparison"];
  if (hasCompareText) return ["comparison", "Comparison Page", "side-by-side-comparison"];
  if (hasNamedContentPage || elementCount > 250 || textRuns.length > 18) {
    return ["multi-column-content", "Multi-column Content Page", "dense-content-grid"];
  }
  if (hasChartSignal) return ["chart", "Chart Or Metrics Page", "data-visualization-dense"];
  return ["content", "Content Page", "title-body-composition"];
}

export function extractSlideSignals(root, outputDir, htmlPath, index) {
  const colorCounts = new Map();
  const fontCounts = new Map();
  const textRuns = [];
  const elements = [...root.querySelectorAll("*")];

  for (const element of elements) {
    const style = element.style;
    if (style) {
      addColor(colorCounts, extractStyleValue(style, "color"));
      addColor(colorCounts, extractStyleValue(style, "background"));
      addColor(colorCounts, extractStyleValue(style, "background-color"));
      addColor(colorCounts, extractStyleValue(style, "border-color"));
      addFont(fontCounts, extractStyleValue(style, "font-family"));
    }

    for (const attr of ["fill", "stroke"]) {
      addColor(colorCounts, element.getAttribute(attr));
    }
  }

  for (const element of elements) {
    const text = normalizeText(element.textContent);
    if (!text || element.children.length > 0 || text.length > 240) continue;
    textRuns.push({
      text,
      tag: element.tagName.toLowerCase(),
      font_family: extractStyleValue(element.style, "font-family") || null,
      font_size: extractStyleValue(element.style, "font-size") || null,
      color: extractStyleValue(element.style, "color") || null,
      left: extractStyleValue(element.style, "left") || null,
      top: extractStyleValue(element.style, "top") || null,
    });
  }

  if (fontCounts.size === 0 && textRuns.length > 0) {
    fontCounts.set("pptx-html-renderer-default", textRuns.length);
  }

  const imageCount = root.querySelectorAll("img").length;
  const svgCount = root.querySelectorAll("svg").length;
  const tableCount = root.querySelectorAll("table").length;
  const pattern = classifySlide({
    index,
    textRuns,
    imageCount,
    svgCount,
    tableCount,
    elementCount: elements.length,
  });

  return {
    index,
    html_path: relative(outputDir, htmlPath),
    text_runs: textRuns.slice(0, 80),
    sample_text: normalizeText(root.textContent).slice(0, 360),
    element_count: elements.length,
    image_count: imageCount,
    svg_count: svgCount,
    table_count: tableCount,
    style_attribute_count: root.querySelectorAll("[style]").length,
    dominant_colors: topCounts(colorCounts, "value", 8),
    fonts: topCounts(fontCounts, "name", 8),
    page_pattern: {
      id: pattern[0],
      name: pattern[1],
      layout_signature: pattern[2],
    },
  };
}
