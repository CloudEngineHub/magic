---
name: ai-card-generator
description: |
  Generate AI Cards — HTML visual pages (single-file or folder-based multi-file) for scheduled automated reports.
  Use when: user wants to create a recurring visual card, hotspot tracker, daily digest,
  analytics panel, inspiration page, or any HTML-based automated visualization that updates on schedule.
  Trigger signals: AI卡片, 灵感卡片, 生成卡片, 可视化报告, 热点跟踪, 每日摘要, dashboard card, 定时可视化.
  Skip when: the task is about creating social media posts (use self-media-composer), or simple file generation without recurring schedule.

name-cn: AI 卡片生成器
description-cn: |
  生成 AI 卡片 — 自包含的 HTML 可视化页面，用于定时自动更新的报告/灵感页。
  当用户需要创建定期更新的可视化卡片（热点追踪、每日摘要、数据面板、灵感页）时使用。
---

<!--zh
# AI 卡片生成器
-->

# AI Card Generator

<!--zh
通过定时任务自动生成和更新自包含的 HTML 可视化卡片。每张卡片基于用户提示词 + 模板，定时获取最新数据并更新。
-->

Automatically generate and update HTML visual cards via scheduled tasks. Cards can be single-file or folder-based multi-file, and are generated from user prompts + templates with fresh data.

<!--zh
## 核心能力
-->

## Core Capabilities

<!--zh
- 创建带定时更新的 AI 可视化卡片
- 支持用户自定义 HTML 模板（用户可随时编辑模板改变样式）
- 每次执行基于模板结构 + 最新数据生成更新版本
- 自动管理历史版本快照
- 支持多种卡片类型（热点追踪、每日摘要、数据面板等）
-->

- Create AI visual cards with scheduled updates
- Support user-customizable HTML templates (users can edit templates anytime)
- Each execution generates updated content based on template structure + latest data
- Automatic history version snapshot management
- Support multiple card types (hotspot tracker, daily digest, analytics panel, etc.)
- Design scenario-specific interactive templates instead of only filling the preset skeletons
- Preserve source links from fetched data and expose them through source lists, new-tab links, or safe iframe previews

<!--zh
## 关联技能使用

当卡片包含交互、网页预览、文件读写、员工/模型选择、AI 深度分析入口时，必须先参考：
- `micro-app-architect`：用于拆解用户需求、确定交互层/数据层/Agent 协作边界
- `html-api-sdk`：用于确认 `window.Magic.*` API 的准确签名、消息格式、错误处理和降级方案

不要把 AI Card 当成静态截图。它是一个可更新的 HTML 微页面：模板负责交互和视觉骨架，Agent 定时任务负责数据采集、证据记录和内容替换。
-->

## Related Skill Usage

When a card needs interactivity, web-page previews, file I/O, agent/model selectors, or AI deep-analysis actions, read and apply these skills first:

- `micro-app-architect`: decompose the user's request, decide interaction/data/Agent boundaries, and choose Simple/Medium/Complex architecture.
- `html-api-sdk`: verify exact `window.Magic.*` API signatures, message formats, error handling, and fallback behavior.

Do not treat an AI Card as a static screenshot. It is an updateable HTML micro-page: the template owns the interaction and visual structure, while the scheduled Agent workflow owns data fetching, source tracking, and content replacement.

<!--zh
## 目录结构约定
-->

## Directory Structure Convention

<!--zh
卡片目录名由用户决定，不限定固定路径。核心要求是目录下包含 `magic.project.js` 且 type 为 `ai-card`。
-->

Card directory name is user-defined, no fixed path required. The core requirement is the directory must contain `magic.project.js` with type set to `ai-card`.

Preferred mode is folder-based multi-file for maintainability. Single-file mode is still supported for backward compatibility.

```
{card-directory}/
├── magic.project.js                  # REQUIRED — type="ai-card"
├── template/                         # Preferred template folder
│   ├── index.html
│   ├── styles.css                    # Optional
│   ├── scripts.js                    # Optional
│   ├── data/                         # Optional seed schemas
│   │   ├── card-data.json
│   │   └── sources.json
│   └── prompts/                      # Optional analysis prompt snippets
│       └── deep-analysis.txt
├── latest/                           # Preferred output folder
│   ├── index.html
│   ├── styles.css                    # Optional
│   ├── scripts.js                    # Optional
│   └── data/                         # Optional generated structured data
│       ├── card-data.json
│       └── sources.json
└── history/
  ├── 2026-05-23_09-00/
  │   ├── index.html
  │   ├── styles.css                # Optional
  │   ├── scripts.js               # Optional
  │   └── data/                    # Optional snapshot data
  │       ├── card-data.json
  │       └── sources.json
  └── 2026-05-22_09-00/
    ├── index.html
    ├── styles.css                  # Optional
    └── scripts.js                  # Optional

Backward compatible (legacy):

{card-directory}/
├── magic.project.js
├── template.html
├── latest.html
└── history/
  └── YYYY-MM-DD_HH-mm.html
```

<!--zh
## 创建流程
-->

## Creation Workflow

<!--zh
### 步骤 0：需求拆解与模板设计

创建或改造卡片前，先把用户需求拆成：信息类型、数据来源、更新频率、需要的交互、证据链接展示方式、是否需要 Agent 深度分析。

根据内容设计模板，不要只机械套用三个预设模板：
- 热点/舆情：排行、趋势曲线、平台分布、情绪/风险、生命周期、来源预览
- 日报/周报：执行摘要、指标组、事件时间线、行动清单、引用来源、可展开原文
- 数据看板：KPI、漏斗、分群、异常告警、区间切换、可追问洞察
- 研究/情报：论点卡片、证据矩阵、来源可信度、iframe 原文预览、比较视图
- 决策/规划：选项对比、风险收益、里程碑、负责人、下一步动作

优先加入有实际价值的交互：筛选、标签页、排序、展开/收起、图表 hover、时间范围切换、来源抽屉、iframe 预览、AI 追问按钮。交互必须围绕内容判断和后续行动，不要只做装饰。
-->

### Step 0: Requirement Decomposition and Template Design

Before creating or modifying a card, decompose the user's request into: information type, data sources, update cadence, expected interactions, source-link display mode, and whether Agent deep analysis is needed.

Design the template for the scenario instead of mechanically applying the three presets:

- Hotspot / public-opinion cards: ranking, trend lines, platform distribution, sentiment/risk, lifecycle, source preview.
- Daily / weekly digest cards: executive summary, metric groups, event timeline, action list, citations, expandable source text.
- Analytics dashboards: KPIs, funnels, cohorts, anomaly alerts, range switching, follow-up insight prompts.
- Self-media operations review dashboards: post-level KPI cards, content attribution scores, comment insight, data-source labels, and next-action backlog.
- Research / intelligence cards: claim cards, evidence matrix, source reliability, iframe source preview, comparison view.
- Decision / planning cards: option comparison, risk/reward, milestones, owners, next actions.

Prefer interactions that help judgment and action: filters, tabs, sorting, expand/collapse, chart hover, time-range switches, source drawers, iframe previews, and AI follow-up buttons. Avoid decorative-only interactions.

### Self-Media Operations Review Dashboards

When the prompt is for a self-media article/post review, post-publication retrospective, 复盘看板, or article operations dashboard, treat the AI Card as a file-backed operations surface, not just a scheduled report.

Read project-local operation files when paths are provided:

- `ops/source.json`: published article URL, platform, binding time, fetch status, last real-data fetch timestamp, auto-sync configuration, and any fetch failure reason. Treat this as an external data-sync contract owned by self-media/IP-operations agents.
- `ops/metrics.json`: exposure/read, likes, saves, comments, shares, follows, conversion, derived rates, platform-specific KPI fields, and `history` snapshots for trend rendering.
- `ops/comments.json`: comment samples, objections, buying/consulting signals, audience questions, reusable wording, and `history` snapshots for feedback changes.
- `ops/review.html`: the primary rich report preview. It should be a standalone styled HTML report with an executive brief, KPI interpretation, trend/efficiency charts, audience-signal analysis, attribution, and next-round action backlog. Use a restrained unified palette and compact dashboard-like layout rather than plain paragraphs.

If `ops/source.json` contains a `publishedUrl`, surface it prominently and show whether real-data fetching is pending, fetched, or failed. AI Card is the data consumer and review-dashboard renderer; it should not perform the article data-sync workflow as part of card generation.

When a user asks to fetch, refresh, ingest, or “发布入盘” a published self-media article, route or describe the work as a self-media/IP-operations data-sync task against the current post folder:

1. The data-sync task reads `ops/source.json`, `ops/metrics.json`, and `ops/comments.json`, then confirms `publishedUrl` is present.
2. The data-sync task visits or otherwise inspects the published URL when tools allow it.
3. The data-sync task writes the latest structured metrics to `ops/metrics.json` and appends or upserts the current sync in `metrics.json.history`.
4. The data-sync task writes audience feedback to `ops/comments.json` and appends or upserts the current sync in `comments.json.history`.
5. The data-sync task updates `ops/source.json.fetchStatus`, `lastFetchedAt`, any failure reason, and appends or upserts the current sync status in `source.json.history`.
6. The data-sync task writes a polished operational report to `ops/review.html`: include structured sections for performance brief, KPI takeaways, trend explanation, traffic-efficiency funnel, quality/interaction mix, comment insights, and next actions. Prefer inline HTML/CSS/SVG or simple CSS chart blocks so the report previews well without external assets. Render next actions as clickable buttons; bind events with `addEventListener` (no inline `onclick`), call `window.Magic.project.sendMessage(message, { model: "auto" })` when available, and fall back to `window.Magic.setInputMessage(message)`.

Do not turn that request into an AI Card analysis artifact. If a card already exists, it should simply read the updated `ops/*` files and refresh its displayed dashboard state.

Do not pretend real-data fetching has happened when no published URL is bound. If `ops/source.json` is missing or has no `publishedUrl`, ask the user to bind the published article URL first; generated/reference values may be shown only as placeholders and must be labeled as such.

Do not create, overwrite, or backfill `ops/metrics.json`, `ops/comments.json`, or `ops/review.html` from generated/reference values. `post.json.meta` fields such as `feedLikes`, `commentCount`, `comments`, `time`, and `interactionReference` are reference display data only. They can be shown in the card with clear provenance, but they must not make the card or article state look archived, fetched, or reviewed.

If the operations files do not exist, show missing/archive-needed states in the card and provide actions or guidance to bind a URL, fetch real platform data, or let the user manually supply real numbers. Clearly label data provenance in the card: real platform data fetched from the bound URL, user-supplied data, reference display data, or missing data.

The card must include, at minimum:

1. Published source binding: URL, platform, fetch status, last fetched time, and what data still needs to be collected.
2. KPI summary: exposure/read, likes, saves, comments, shares, follows, conversion, and missing-data placeholders.
3. Content attribution: score title, cover/first image, opening hook, structure rhythm, topic-audience fit, and call to action.
4. Comment insight: user concerns, objections, consulting/buying signals, reusable phrases, and remix opportunities.
5. Next actions: next post topics, title A/B options, cover direction, publish timing, channel distribution, and comment-area operations.
6. Data-source notes: show which values came from real data, user input, reference display values, or generated assumptions.

One-off review cards are valid. If the prompt says scheduling is disabled or this is a one-time review, do not create a cron task; still generate `magic.project.js`, `template/`, `latest/`, and any relevant `latest/data/*.json` files so the review remains reopenable and editable.

<!--zh
### 步骤 1：创建卡片目录结构

根据用户需求创建目录并写入所有必需文件：
-->

### Step 1: Create Card Directory Structure

Based on user requirements, create directory and write all required files:

```
1. 创建目录（名称由用户指定或根据内容推断）
2. 写入 magic.project.js（触发前端渲染识别，包含所有卡片配置和元数据）
3. 生成模板（推荐 `template/index.html`，兼容 `template.html`）
4. 首次获取数据并生成最新卡片（推荐 `latest/index.html`，兼容 `latest.html`）
5. 如需定时更新，使用 using-cron 创建定时任务
```

<!--zh
### 步骤 2：magic.project.js 格式

必须严格遵循以下格式，前端和后端均依赖此文件进行类型识别：
-->

### Step 2: magic.project.js Format

Must follow this format strictly — both frontend and backend depend on it for type recognition:

```javascript
window.magicProjectConfig = {
  type: "ai-card",
  name: "卡片名称",
  description: "卡片描述",
  prompt: "用户提示词全文",
  cards: [{ file: "latest/index.html", label: "最新" }],
  template: "template/index.html",
  schedule_id: "", // Will be filled after cron task creation
  last_generated: "", // ISO 8601 timestamp, updated each generation
  generation_count: 0, // Incremented each generation
  status: "active", // active | paused | error
};

// Legacy compatible example:
// cards: [{ file: "latest.html", label: "最新" }],
// template: "template.html",
```

<!--zh
### 步骤 3：Template 规范（`template/index.html` 或 `template.html`）

模板是卡片的"骨架"，定义布局和样式。Agent 每次执行时读取模板理解结构，用新数据填充生成最新版本（推荐 `latest/index.html`）。
-->

### Step 3: Template Specification (`template/index.html` or `template.html`)

The template is the card's "skeleton", defining layout and styling. The agent reads the template each execution to understand the structure, then fills in new data to generate the latest card output (recommended `latest/index.html`).

<!--zh
**模板规则：**
-->

**Template Rules:**

<!--zh
1. 优先使用目录结构：`template/index.html` + 可选 `styles.css` / `scripts.js`，生成到 `latest/` 同结构
2. 使用 `<meta charset="utf-8">` 和 viewport meta
3. 支持暗色模式（`prefers-color-scheme`）
4. 归档历史版本时必须复制 HTML、CSS、JS 等同目录资源，保持相对链接可用
5. 使用 HTML 注释标记数据区域，便于识别替换位置：
-->

1. Prefer folder-based templates: `template/index.html` plus optional `styles.css` / `scripts.js`, generated into the same structure under `latest/`
2. Include `<meta charset="utf-8">` and viewport meta
3. Support dark mode (`prefers-color-scheme`)
4. When archiving history snapshots, copy the HTML, CSS, JS, and other same-folder assets together so relative links keep working
5. External resources are default-deny, but ECharts CDN is allowed for chart-driven cards
6. Use iframe-width responsive design: narrow card iframes should render a compact cover/summary view, while wide iframes render the full report
7. Use HTML comments to mark data sections for easy replacement:

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{CARD_TITLE}}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header>
      <h1>{{CARD_TITLE}}</h1>
      <time>{{GENERATED_AT}}</time>
    </header>

    <!-- DATA_SECTION_START -->
    <main class="data-container">
      <!-- Agent fills this section with latest data -->
    </main>
    <!-- DATA_SECTION_END -->

    <footer>
      <p>Updated: {{GENERATED_AT}}</p>
    </footer>
    <script src="scripts.js"></script>
  </body>
</html>
```

## Responsive iframe Display

AI Cards are rendered inside iframes in both grid cards and detail pages. The template must adapt to the iframe viewport, not the parent page.

Required display modes:

- **Compact card mode (`<= 420px`)**: show a unified card-like cover with title, timestamp, 1-3 headline metrics or summary points, and status/source badges. Hide dense tables, long lists, iframe source previews, large charts, and secondary AI controls. Keep content visually complete within a portrait card frame.
- **Mobile detail mode (`421px-767px`)**: single-column readable report. Preserve all core content, but stack charts/lists and reduce chart height.
- **Desktop detail mode (`>= 768px`)**: full dashboard/report layout with multi-column sections and richer interaction.

Implementation rules:

- Use CSS media queries inside the card HTML (`@media (max-width: 420px)`, `@media (max-width: 767px)`, `@media (min-width: 768px)`). These queries naturally follow the iframe width.
- Prefer semantic sections that can be hidden/reordered in compact mode: header/summary/metrics/detail/sources/actions.
- In compact mode, avoid horizontal scroll and avoid text clipping. Use `line-clamp`, smaller fixed chart heights, or hide nonessential sections.
- If a template supports iframe source preview, hide the preview frame in compact card mode but keep source count or source badge visible.
- The card should still be usable if the host iframe height is clipped: important title/time/status content belongs near the top or bottom, not only after long scroll.

<!--zh
## 定时执行流程
-->

## Scheduled Execution Workflow

<!--zh
当定时任务触发时，执行以下流程：
-->

When a scheduled task triggers, execute the following:

```
1. 读取 magic.project.js 获取提示词和上下文配置
2. 读取模板目录（优先 `template/`，兼容 `template.html`）理解布局结构和数据区域标记
3. 通过 web_search / read_webpages_as_markdown 获取最新数据，并记录所有可用来源 URL
4. 根据提示词分析和组织数据；把来源写入 HTML 引用区和可选 `latest/data/sources.json`
5. 归档：将当前 `latest/` 下所有文件复制到 `history/YYYY-MM-DD_HH-mm/`（兼容模式：重命名 `latest.html`）
6. 复制模板：将 `template/` 下所有文件复制到 `latest/`（覆盖），作为本次生成的基础
7. 修改数据区：仅修改 `latest/index.html` 中 `<!-- DATA_SECTION_START -->` 到 `<!-- DATA_SECTION_END -->` 或命名 DATA 区之间的内容，填入最新数据；通常不改动 styles.css / scripts.js，除非模板结构需要升级
8. 更新 magic.project.js 的 last_generated 和 generation_count
```

## Source Link and Web Preview Requirements

When fetched data contains links, preserve them. Do not summarize away provenance.

Recommended source record shape:

```json
{
  "id": "src-001",
  "title": "Source title",
  "url": "https://example.com/article",
  "site": "Example",
  "type": "article",
  "publishedAt": "2026-06-10T08:00:00+08:00",
  "retrievedAt": "2026-06-10T09:00:00+08:00",
  "summary": "One-line relevance note",
  "linkedClaimIds": ["claim-01"],
  "display": "iframe"
}
```

Render sources according to content type and embed safety:

- Use an `<iframe>` preview for public pages that are likely useful to inspect inline, such as articles, dashboards, docs, charts, maps, public reports, PDFs that the browser can render, or generated local HTML.
- Always include an `<a href="..." target="_blank" rel="noopener noreferrer">` open-in-new-tab fallback next to iframe previews.
- Use link-only display for pages likely to block embedding, require login, contain payment flows, or show sensitive/private data.
- If an iframe fails to load or is blocked by the site, show a clear fallback message and keep the new-tab link.
- Use `sandbox`, `loading="lazy"`, and `referrerpolicy="no-referrer"` on iframes unless the scenario explicitly needs more permissions.

Recommended iframe pattern:

```html
<button
  type="button"
  class="source-preview"
  data-preview-url="https://example.com/article"
>
  预览来源
</button>
<a href="https://example.com/article" target="_blank" rel="noopener noreferrer"
  >新标签打开</a
>
<iframe
  class="source-frame"
  title="Source preview"
  sandbox="allow-scripts allow-same-origin allow-popups"
  loading="lazy"
  referrerpolicy="no-referrer"
></iframe>
```

<!--zh
## 与 using-cron 配合
-->

## Integration with using-cron

<!--zh
创建卡片后如需定时更新，使用 using-cron 创建定时任务：
-->

After creating a card, if scheduled updates are needed, use using-cron to create a scheduled task.
Use `shell_exec` from `agents/skills/using-cron`; do not use `run_sdk_snippet`.
For long update instructions, write the message to a temporary file and pass `--message-content-file`
to avoid shell parsing issues with punctuation, quotes, or brackets.

```python
shell_exec(
    command='''cat > /tmp/ai-card-cron-message.txt <<'EOF'
Update the AI card {card_name}. Read {card_directory}/magic.project.js for
configuration and prompts. Steps:
1. Archive: copy ALL files in latest/ to history/YYYY-MM-DD_HH-mm/
2. Copy template: copy ALL files from template/ to latest/ (overwrite)
3. Fetch fresh data based on the prompt in magic.project.js
4. Modify only the DATA_SECTION in latest/index.html with the new data
5. Update last_generated and generation_count in magic.project.js
Fallback for legacy single-file mode: use template.html → latest.html.
EOF
cd /app/agents/skills/using-cron &&
python scripts/create.py --task-name "AI Card: {card_name}" --message-content-file /tmp/ai-card-cron-message.txt --type daily_repeat --time "9:00" --topic-pattern ip-manager'''
)
```

<!--zh
创建成功后，将返回的 schedule_id 写入 magic.project.js。
-->

After successful creation, write the returned schedule_id into magic.project.js.

<!--zh
## 用户修改模板

用户可以随时修改 template.html 来改变卡片的布局和样式。修改方式：
1. 在前端直接编辑 template.html（使用现有 HTML 编辑功能）
2. 通过对话告诉 Agent 修改模板（如"把模板改成三列布局"）

修改后下次定时执行将自动使用新模板生成。
-->

## User Template Modification

Users can modify template/index.html (or template.html in legacy mode) anytime to change card layout and styling. Methods:

1. Edit template/index.html directly in the frontend (using existing HTML editing capability)
2. Tell the agent via conversation (e.g. "change the template to a three-column layout")

After modification, the next scheduled execution will automatically use the new template.

## html-api-sdk Integration (Optional but Recommended)

For interactive cards, you can use `window.Magic.*` APIs in HTML:

1. For substantial follow-up work, prefer `window.Magic.project.createTopicAndSend(message, { model })`; include agent/model selectors when users may want control.
2. Use `window.Magic.setInputMessage(message)` only as a lightweight fallback for current-topic prefill.
3. Optionally use `window.Magic.fs.readFile` / `writeFile` for local card context, generated notes, `data/card-data.json`, or `data/sources.json` within the card app root.
4. Use `window.Magic.fs.watchFile` only when the card needs to react to data-file edits without a full refresh.
5. Bind actions via `addEventListener` only (no inline onclick).

Example pattern in card UI:

1. Source preview controls: open trusted source URLs in a sandboxed iframe and always keep a new-tab `<a>` fallback.
2. "Generate analysis request" button: extract key text and source links from card sections.
3. "Send to Agent" button: call `window.Magic.project.createTopicAndSend(...)` with `{ model: "auto" }`; fall back to `setInputMessage(...)` when project APIs are unavailable.
4. Show status text if Magic API is unavailable in current runtime.

When sending file paths, follow `html-api-sdk` and `micro-app-architect`: use tiptap JSON with `@file` mentions, call `getAppBasePath()` for app-relative data files, and keep `.magic/` skill paths workspace-root relative.

<!--zh
## 预设模板

Skill 提供以下预设模板供参考，位于 templates/ 目录（folder-based 结构）：
- `hotspot-tracker/` — 热点追踪（热搜列表 + 趋势标记 + 时间戳）
- `daily-digest/` — 每日摘要（分栏布局 + 关键指标 + 行业动态）
- `analytics-panel/` — 数据面板（KPI 数字 + 对比变化 + 趋势图）

每个模板目录包含：`index.html`、`styles.css`、`scripts.js`、`prompts/`（可选分析提示词）。
创建卡片时可参考这些模板的结构和样式，也可完全自定义。
-->

## Preset Templates

This skill provides the following preset templates for reference, located in the templates/ directory (folder-based structure):

- `hotspot-tracker/` — Hotspot tracker (rankings, platform distribution, trend charts, AI follow-ups, source preview)
- `daily-digest/` — Daily digest (summary, metric groups, timeline, action list, source cards, AI follow-ups)
- `analytics-panel/` — Analytics panel (KPIs, funnels, channel breakdowns, range tabs, alerts, source preview, AI follow-ups)

Each template folder contains: `index.html`, `styles.css`, `scripts.js`, and `prompts/` (optional analysis prompt snippets).
When creating cards, use these as module examples, not as fixed limits. Compose or extend modules according to the user's domain, source types, and desired interactions.
