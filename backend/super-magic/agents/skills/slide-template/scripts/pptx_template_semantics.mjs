function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function slideText(payload, slideIndex) {
  const slide = payload.slides?.find((item) => item.index === slideIndex);
  const runs = slide?.text_runs || [];
  return normalizeText(runs.map((item) => item.text).join(" "));
}

function slideTextRuns(payload, slideIndex) {
  const slide = payload.slides?.find((item) => item.index === slideIndex);
  return (slide?.text_runs || [])
    .map((item) => normalizeText(item.text))
    .filter(Boolean);
}

function compactTitleFromRuns(runs) {
  const candidate = runs.find((text) => {
    if (text.length > 40) return false;
    if (/^[\d\s.,:%-]+$/.test(text)) return false;
    return true;
  });
  return candidate || runs.join(" ").slice(0, 24) || "模板页面";
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function inferLayoutKind({ payload, candidate, sourceSlideIndex, occurrence }) {
  const text = slideText(payload, sourceSlideIndex);
  const slide = payload.slides?.find((item) => item.index === sourceSlideIndex) || {};
  const patternId = candidate.layout_id || slide.page_pattern?.id || "";
  const numericCount = countMatches(text, /\b\d+(?:\.\d+)?%?|\d+%/g);
  const hasPercent = /%/.test(text);
  const hasSectionNumber = /\b0[1-9]\./.test(text);

  if (sourceSlideIndex === 0) return ["cover", "封面", "cover"];
  if (/thank|thanks|谢谢|感谢/i.test(text)) return ["closing", "结束页", "closing"];
  if (patternId === "contents" || /目录|contents|catalogue|agenda/i.test(text)) return ["contents", "目录", "contents"];
  if (countMatches(text, /\b0[1-9]\b/g) >= 3) return ["multi-item", "多项内容页", `multi-item-${occurrence}`];
  if (numericCount >= 6 && slide.svg_count >= 35) return ["chart", "图表页", "chart"];
  if (hasPercent || numericCount >= 4) return ["metrics", "指标页", "metrics"];
  if ((slide.image_count || 0) >= 4) return ["gallery", "多图内容页", "gallery"];
  if (hasSectionNumber && text.length <= 80) return ["section", "章节页", `section-${occurrence}`];
  if ((slide.image_count || 0) > 0) return ["image-content", "图文内容页", `image-content-${occurrence}`];
  return ["content", "内容页", `content-${occurrence}`];
}

function dedupeFileName(name, usedNames) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  const base = name.replace(/\.html$/i, "");
  let index = 2;
  while (usedNames.has(`${base}-${index}.html`)) index += 1;
  const next = `${base}-${index}.html`;
  usedNames.add(next);
  return next;
}

function semanticFields(candidate, layoutKind) {
  const fields = [];
  const placeholders = candidate.placeholder_fields || [];
  const imageCount = placeholders.filter((item) => item.startsWith("image_")).length;
  const textCount = placeholders.filter((item) => item.startsWith("text_")).length;

  if (["cover", "closing"].includes(layoutKind)) fields.push("title", "year", "presenter", "department");
  if (layoutKind === "contents") fields.push("section_numbers", "section_titles", "section_subtitles");
  if (layoutKind === "section") fields.push("section_number", "section_title", "section_subtitle");
  if (["metrics", "chart"].includes(layoutKind)) fields.push("metrics", "chart_labels", "section_title", "body");
  if (["content", "image-content", "gallery", "multi-item"].includes(layoutKind)) fields.push("section_title", "item_titles", "body");
  for (let index = 1; index <= imageCount; index += 1) fields.push(`image_${String(index).padStart(2, "0")}`);
  if (fields.length === 0 && textCount > 0) fields.push("title", "body");
  return [...new Set(fields)];
}

function normalizeSlot(field) {
  if (typeof field === "string") {
    return {
      name: field,
      type: field.startsWith("image_") ? "image" : "text",
      sample: "",
    };
  }
  return {
    name: String(field?.name || "").trim(),
    type: String(field?.type || "text").trim() || "text",
    sample: String(field?.sample || "").trim(),
  };
}

function normalizeSlots(fields) {
  const slots = [];
  const usedNames = new Set();
  for (const field of fields || []) {
    const slot = normalizeSlot(field);
    if (!slot.name || usedNames.has(slot.name)) continue;
    usedNames.add(slot.name);
    slots.push(slot);
  }
  return slots;
}

function llmPageOverride(llmPagePlan, sourceSlideIndex) {
  const pages = Array.isArray(llmPagePlan?.pages) ? llmPagePlan.pages : [];
  return pages.find((page) => {
    if (Number.isInteger(page.source_slide_index)) return page.source_slide_index === sourceSlideIndex;
    if (Array.isArray(page.source_slide_indexes)) return page.source_slide_indexes.includes(sourceSlideIndex);
    return false;
  }) || null;
}

function normalizeVisualValue(value, fallback = "") {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean).join("；");
  return normalizeText(value) || fallback;
}

function buildVisualSummaryMap(llmVisualSpec = null) {
  const map = new Map();
  const slides = Array.isArray(llmVisualSpec?.slides) ? llmVisualSpec.slides : [];
  for (const slide of slides) {
    const index = Number.isInteger(slide.source_slide_index)
      ? slide.source_slide_index
      : Number.isInteger(slide.source_slide_number)
        ? slide.source_slide_number - 1
        : null;
    if (!Number.isInteger(index) || index < 0) continue;
    map.set(index, {
      visual_role: normalizeVisualValue(slide.visual_role, ""),
      visual_anchor: normalizeVisualValue(slide.visual_anchor, ""),
      best_for: normalizeVisualValue(slide.best_for, ""),
      avoid_for: normalizeVisualValue(slide.avoid_for, ""),
      generation_notes: normalizeVisualValue(slide.generation_notes, ""),
      risks: normalizeVisualValue(slide.risks, ""),
      has_visual_evidence: slide.has_visual_evidence === true,
    });
  }
  return map;
}

function fallbackVisualSummary({ slide, layoutName, useCase }) {
  const imageCount = Number(slide?.image_count || 0);
  const svgCount = Number(slide?.svg_count || 0);
  const tableCount = Number(slide?.table_count || 0);
  let visualAnchor = "文本层级和页面留白";
  if (imageCount >= 4) visualAnchor = "多图网格或图库区域";
  else if (imageCount > 0) visualAnchor = "图片容器和图文关系";
  else if (tableCount > 0) visualAnchor = "表格结构";
  else if (svgCount >= 20) visualAnchor = "图形、图表或装饰形状系统";
  else if (svgCount > 0) visualAnchor = "矢量装饰和分隔结构";

  return {
    visual_role: layoutName || "内容页",
    visual_anchor: visualAnchor,
    best_for: useCase || layoutName || "内容页",
    avoid_for: "与该页信息密度或视觉锚点明显不匹配的内容",
    generation_notes: "复制对应 pages/*.html 后只替换 data-slot 内容，保留源页面结构、SVG、图片容器和 CSS 引用。",
    risks: "",
    has_visual_evidence: false,
  };
}

function pageVisualSummary(page) {
  return page.visual_summary || {};
}

function buildDesignFeatureLines(payload, pages) {
  const colors = payload.theme?.colors || [];
  const topColors = colors.slice(0, 5).map((item) => item.value).join("、");
  const layoutNames = [...new Set(pages.map((page) => page.layout_name).filter(Boolean))].join("、");
  const imageCount = payload.assets?.images?.length || 0;
  const svgCount = (payload.slides || []).reduce((total, slide) => total + (slide.svg_count || 0), 0);
  const lines = [];

  if (topColors) {
    lines.push(`- 主色、辅助色和背景色以提取色彩证据为准，出现频率最高的色值包括：${topColors}。`);
  } else {
    lines.push("- 未提取到稳定色彩证据，生成时应优先参考源页面 HTML 和页面截图。");
  }

  if (layoutNames) {
    lines.push(`- 页面结构覆盖：${layoutNames}；生成新页面时优先读取 \`template-pages.md\` 的逐页视觉理解与选页指南，再复制语义最接近的 \`pages/*.html\`。`);
  }

  lines.push(`- 已迁移图片资源 ${imageCount} 个；替换图片时保留源页面中的裁切容器、尺寸和层级关系。`);

  if (svgCount > 0) {
    lines.push(`- 源 PPTX 包含 ${svgCount} 个 SVG/形状结构；这些结构可能承载装饰、图表或版式分隔，默认保留。`);
  } else {
    lines.push("- 未检测到 SVG/形状结构，页面主要依赖文本、图片和 CSS 布局。");
  }

  lines.push("- 文本、图片、指标和图表内容通过页面中的 `data-slot` 绑定；`template-pages.json` 仅作为机器校验和未来确定性替换器的轻量索引。");
  return lines;
}

function markdownList(values, emptyText = "无") {
  const items = (values || []).filter(Boolean);
  return items.length ? items.join(", ") : emptyText;
}

function sourceSlideNumbers(page) {
  return (page.source_slide_indexes || []).map((index) => index + 1).join(", ");
}

function formatSlotNames(page) {
  return markdownList((page.slots || []).map((slot) => `\`${slot.name}\``), "none");
}

function buildPageCoverageRows(pages) {
  return pages
    .map((page) => {
      return `| ${sourceSlideNumbers(page)} | \`${page.file}\` | ${page.layout_name} | ${formatSlotNames(page)} | ${markdownList(page.core_css_classes.map((item) => `.${item}`))} |`;
    })
    .join("\n");
}

function buildVisualSelectionRows(pages) {
  return pages
    .map((page) => {
      const visual = pageVisualSummary(page);
      return `| ${sourceSlideNumbers(page)} | \`${page.file}\` | ${visual.visual_role || page.layout_name} | ${visual.visual_anchor || "文本层级"} | ${visual.best_for || page.use_case} | ${visual.avoid_for || "无"} | ${formatSlotNames(page)} | ${visual.generation_notes || "替换 data-slot 内容，保留页面结构。"} | ${visual.risks || "无"} |`;
    })
    .join("\n");
}

function buildSlotRows(pages) {
  return pages
    .map((page) => {
      const slots = page.slots?.length
        ? page.slots.map((slot) => `${slot.name}:${slot.type || "text"}`).join(", ")
        : "none";
      return `| \`${page.file}\` | ${sourceSlideNumbers(page)} | ${slots} |`;
    })
    .join("\n");
}

function buildLayoutInventoryRows(pages) {
  const groups = new Map();
  for (const page of pages) {
    const key = `${page.layout_kind}::${page.layout_name}`;
    if (!groups.has(key)) {
      groups.set(key, {
        layout_kind: page.layout_kind,
        layout_name: page.layout_name,
        files: [],
        source_slides: [],
        classes: new Set(),
      });
    }
    const group = groups.get(key);
    group.files.push(page.file);
    group.source_slides.push(...(page.source_slide_indexes || []));
    page.core_css_classes.forEach((className) => group.classes.add(className));
  }

  return [...groups.values()]
    .map((group) => {
      const sourceSlides = [...new Set(group.source_slides)]
        .sort((left, right) => left - right)
        .map((index) => index + 1)
        .join(", ");
      return `| \`${group.layout_kind}\` | ${group.layout_name} | ${sourceSlides} | ${group.files.length} | ${markdownList([...group.classes].map((item) => `.${item}`))} |`;
    })
    .join("\n");
}

export function buildSemanticPagePlan(payload, llmPagePlan = null, llmVisualSpec = null) {
  const candidates = payload.page_package_candidates || [];
  const usedNames = new Set();
  const occurrenceByKind = new Map();
  const visualSummaryMap = buildVisualSummaryMap(llmVisualSpec);

  return candidates.map((candidate) => {
    const sourceSlideIndex = candidate.source_slide_indexes?.[0] ?? 0;
    const slide = payload.slides?.find((item) => item.index === sourceSlideIndex) || {};
    const text = slideText(payload, sourceSlideIndex);
    const runs = slideTextRuns(payload, sourceSlideIndex);
    const occurrence = (occurrenceByKind.get(candidate.layout_id) || 0) + 1;
    occurrenceByKind.set(candidate.layout_id, occurrence);
    const [layoutKind, layoutName, slugHint] = inferLayoutKind({ payload, candidate, sourceSlideIndex, occurrence });
    const title = compactTitleFromRuns(runs);
    const baseName = sourceSlideIndex === 0
      ? "cover.html"
      : layoutKind === "contents"
        ? "contents.html"
        : `${String(sourceSlideIndex + 1).padStart(2, "0")}-${slugHint || `page-${sourceSlideIndex + 1}`}.html`;
    const override = llmPageOverride(llmPagePlan, sourceSlideIndex);
    const effectiveLayoutKind = override?.layout_kind || layoutKind;
    const effectiveLayoutName = override?.layout_name || layoutName;
    const effectiveFile = override?.file || `pages/${baseName}`;
    const slots = normalizeSlots(override?.placeholder_fields || semanticFields(candidate, effectiveLayoutKind));
    const useCase = override?.use_case || (title === "模板页面" ? effectiveLayoutName : `${title}${effectiveLayoutName}`);
    const visualSummary = {
      ...fallbackVisualSummary({ slide, layoutName: effectiveLayoutName, useCase }),
      ...(visualSummaryMap.get(sourceSlideIndex) || {}),
    };

    return {
      file: dedupeFileName(effectiveFile.replace(/^pages\//, ""), usedNames).replace(/^/, "pages/"),
      layout_kind: effectiveLayoutKind,
      layout_name: effectiveLayoutName,
      source_slide_indexes: candidate.source_slide_indexes || [sourceSlideIndex],
      source_title: override?.source_title || title,
      use_case: useCase,
      cleaned_html_path: candidate.cleaned_html_path || null,
      core_css_classes: [
        "slide-page",
        `layout-${effectiveLayoutKind}`,
        "template-page",
        ...(candidate.core_css_classes || []).filter((item) => item !== "slide-page" && !item.startsWith("layout-")),
      ],
      placeholder_fields: slots.map((slot) => slot.name),
      slots,
      original_placeholder_fields: candidate.placeholder_fields || [],
      asset_dependencies: "assets/images",
      visual_summary: visualSummary,
    };
  });
}

export function buildSemanticVisualSpec(payload, pages, transforms, options = {}) {
  const colors = payload.theme?.colors?.length
    ? payload.theme.colors.map((item) => `| ${item.value} | ${item.count} |`).join("\n")
    : "| 未提取 | 0 |";
  const fonts = payload.theme?.fonts?.length
    ? payload.theme.fonts.map((item) => `| ${item.name} | ${item.count} |`).join("\n")
    : "| pptx-html-renderer-default | 0 |";
  const risks = payload.risks?.length ? payload.risks.map((item) => `- ${item}`).join("\n") : "- 无";
  const designFeatures = buildDesignFeatureLines(payload, pages).join("\n");
  const llmVisualSpec = String(options.llmVisualSpec || "").trim();

  return [
    "# PPTX 可执行模板规范",
    "",
    "## 模板身份",
    "",
    `源文件：\`${payload.source?.name || "unknown"}\``,
    "",
    `- 输出格式：\`multi_html_page_package\`。`,
    `- 源幻灯片数量：${payload.presentation?.slide_count ?? pages.length}。`,
    `- 生成页面数量：${pages.length}。`,
    `- 页面来源：\`pages/*.html\`，后续生成 PPT 时复制对应页面并替换 \`data-slot\` 内容。`,
    `- 共享样式：\`theme.css\` + \`source.css\`。`,
    "",
    "## 画布",
    "",
    `- 源渲染尺寸：${payload.presentation?.canvas?.width || 960} × ${payload.presentation?.canvas?.height || 540}`,
    `- 目标生成尺寸：${payload.presentation?.target_canvas?.width || payload.presentation?.canvas?.width || 960} × ${payload.presentation?.target_canvas?.height || payload.presentation?.canvas?.height || 540}`,
    `- 缩放倍率：${payload.presentation?.scale_to_target || 1}`,
    `- 宽高比：${payload.presentation?.canvas?.aspect_ratio || "16:9"}`,
    "- 生成策略：保留源 PPTX 的定位和 SVG 结构，同时在页面、文档和映射表中补充语义化页面类型、槽位和核心类。",
    "",
    "## 设计语义",
    "",
    llmVisualSpec ? `### LLM 视觉语义摘要\n\n${llmVisualSpec}\n` : designFeatures,
    llmVisualSpec ? "### 结构证据补充" : "",
    llmVisualSpec ? designFeatures : "",
    "",
    "## 色彩、字体与视觉规则",
    "",
    "### 色彩证据",
    "",
    "| 色值 | 出现次数 |",
    "| --- | ---: |",
    colors,
    "",
    "### 字体证据",
    "",
    "| 字体 | 出现次数 |",
    "| --- | ---: |",
    fonts,
    "",
    "### 视觉规则",
    "",
    "- 间距：以源 PPTX 绝对定位和 cleaned HTML 中的 inline style 为准；公共间距 token 只放入 `theme.css`，源页特定定位保留在 `source.css` 或页面结构中。",
    "- 边框：保留源页面中的边框、描边、分隔线和 SVG stroke；公共边框色和边框风格放入 `theme.css`。",
    "- 阴影：只在源证据出现时迁移；不要为了美化额外添加未在源 PPTX 出现的投影。",
    "- 图片：复制源图片裁切容器、尺寸和层级关系；图片替换通过 `data-slot-type=\"image\"` 的节点完成。",
    "- SVG/图形：内联 SVG 默认保留，承载图形装饰、图表形状和版式分隔；不得拆出为外部资源。",
    "",
    "## 页面覆盖表",
    "",
    "| 源页 | 页面文件 | 页面类型 | 槽位 | 核心类 |",
    "| --- | --- | --- | --- | --- |",
    buildPageCoverageRows(pages) || "| 无 | 无 | 无 | 无 | 无 |",
    "",
    "## 逐页选页原则",
    "",
    "- 大模型生成新 PPT 页面时，先读取 `template-pages.md` 的「逐页视觉理解与选页指南」，选择视觉角色、信息密度和视觉锚点最接近的页面。",
    "- `template-pages.json` 只作为机器校验和未来确定性替换器的轻量索引，不作为大模型主要上下文。",
    "- 选定页面后复制对应 `pages/*.html`，只替换 `data-slot` 内容和必要图片资源，保留源页面层级、SVG、图形装饰、图片容器、`theme.css` 和 `source.css` 引用。",
    "",
    "## 布局与组件清单",
    "",
    "| Layout Kind | 页面类型 | 来源页 | 页面数 | 核心类 |",
    "| --- | --- | --- | ---: | --- |",
    buildLayoutInventoryRows(pages) || "| none | none | none | 0 | none |",
    "",
    "## 槽位规则",
    "",
    "- 所有可替换内容必须通过 `data-slot` 与 `data-slot-type` 标记。",
    "- 后续生成 PPT 时复制 `pages/*.html`，只替换槽位节点内容，不重建页面结构。",
    "- 文本槽位保留原文本节点的字体、颜色和定位；图片槽位保留原图片容器、裁切和层级。",
    "",
    "| 页面文件 | 来源页 | 槽位 |",
    "| --- | --- | --- |",
    buildSlotRows(pages) || "| none | none | none |",
    "",
    "## CSS 职责",
    "",
    "- `theme.css`：公共设计 token、可复用 layout/component class、模板级背景和视觉 helper。",
    "- `source.css`：从 PPTX 提取出的保真样式、源页面专用定位和复杂图形样式。",
    "- `pages/*.html`：独立页面模板，必须加载 `../theme.css` 和 `../source.css`，并保留必要的源 HTML 结构。",
    "- 页面内 inline style 只用于复杂绝对定位或无法安全抽象的源页几何信息。",
    "",
    "## 资产规则与风险",
    "",
    `- 已迁移图片资源：${payload.assets?.images?.length || 0} 个，全部位于 \`assets/images/\`。`,
    `- 外部资源：${payload.assets?.external_resources?.length || 0} 个。`,
    `- iframe 展平数量：${transforms.flattened_iframe_count || 0}。`,
    "- `pages/*.html` 使用 `../assets/images/...`、`../theme.css` 和 `../source.css`。",
    "- 不保留源 PPTX 绝对路径、外部 URL 或 data URL 资源引用。",
    "",
    "## 生成新 PPT 的使用规则",
    "",
    "- 先读取 `template-pages.md`，根据逐页视觉理解选择语义和视觉锚点最接近的页面。",
    "- 复制对应的 `pages/*.html` 到目标 PPT 项目页面目录。",
    "- 替换 `data-slot` 内容，保留页面结构、SVG、图形装饰、图片容器和 CSS 引用。",
    "- 新增图片必须写入目标项目本地资源目录，并使用相对路径引用。",
    "- 不使用 `preview.html` 作为页面来源；它只允许作为可选索引或预览入口。",
    "",
    "## 风险",
    "",
    risks,
    "",
  ].filter((line) => line !== null && line !== undefined).join("\n");
}

export function buildSemanticTemplatePages(pages) {
  const rows = pages.map((page) => {
    return `| \`${page.file}\` | ${page.layout_name} | ${page.source_slide_indexes.map((index) => index + 1).join(", ")} | ${page.use_case} | ${page.core_css_classes.map((item) => `.${item}`).join(", ")} | ${page.placeholder_fields.join(", ") || "none"} | ${page.asset_dependencies} |`;
  }).join("\n");
  const visualRows = buildVisualSelectionRows(pages);

  return [
    "# 语义化模板页面映射",
    "",
    "这是后续生成 PPT 页面时给大模型读取的主要选页文档。每个页面都对应源 PPTX 的一个原始页面；即使多个页面属于相同版式，也默认全部保留。",
    "",
    "| Page File | Layout Type | Source Slides | Use Case | Core CSS Classes | Placeholder Fields | Asset Dependencies |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    rows || "| none | none | none | none | none | none | none |",
    "",
    "## 逐页视觉理解与选页指南",
    "",
    "| 源页 | 页面文件 | 视觉角色 | 视觉锚点 | 适合内容 | 不适合内容 | 可替换槽位 | 生成注意事项 | 风险 |",
    "| ---: | --- | --- | --- | --- | --- | --- | --- | --- |",
    visualRows || "| 无 | 无 | 无 | 无 | 无 | 无 | 无 | 无 | 无 |",
    "",
    "## 使用规则",
    "",
    "- 生成新页面时先根据「逐页视觉理解与选页指南」选择基础页，再复制对应 `pages/*.html`。",
    "- 大模型直接读取本文件、`visual-spec.md` 和对应 HTML 页面；`template-pages.json` 只作为机器校验索引。",
    "- 复制页面后只替换 `data-slot` 内容和必要图片资源，不重建整体版式。",
    "- 修改文本时优先替换槽位对应文本节点，保留 `.shape-accent`、`.image-frame`、`.chart-shell` 等结构。",
    "- 替换图片时只使用模板目录内的 `assets/images/` 或新写入的本地资源。",
    "- 除非需要重做版式，不要删除内联 SVG；它们承载源 PPTX 的几何装饰和图表形状。",
    "",
  ].join("\n");
}

export function buildSemanticTemplatePagesJson({ pages, classificationSource }) {
  return {
    schema_version: 1,
    classification_source: classificationSource,
    pages: pages.map((page) => ({
      file: page.file,
      layout_kind: page.layout_kind,
      layout_name: page.layout_name,
      source_slide_indexes: page.source_slide_indexes,
      slots: page.slots || normalizeSlots(page.placeholder_fields),
      asset_dependencies: page.asset_dependencies,
      visual_role: pageVisualSummary(page).visual_role || page.layout_name,
      visual_anchor: pageVisualSummary(page).visual_anchor || "",
      best_for: pageVisualSummary(page).best_for || page.use_case,
    })),
  };
}
