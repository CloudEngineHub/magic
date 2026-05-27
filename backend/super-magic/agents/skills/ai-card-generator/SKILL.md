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
│   └── prompts/                      # Optional analysis prompt snippets
│       └── deep-analysis.txt
├── latest/                           # Preferred output folder
│   ├── index.html
│   ├── styles.css                    # Optional
│   └── scripts.js                    # Optional
└── history/
  ├── 2026-05-23_09-00/
  │   ├── index.html
  │   ├── styles.css                # Optional
  │   └── scripts.js               # Optional
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
1. 必须是自包含的单 HTML 文件（CSS/JS 全部 inline）
2. 使用 `<meta charset="utf-8">` 和 viewport meta
3. 支持暗色模式（`prefers-color-scheme`）
4. 使用 HTML 注释标记数据区域，便于识别替换位置：
-->

1. Prefer a single HTML file; inline CSS/JS are still the default, but trusted external resources can be used when they provide clear value (for example ECharts)
2. Include `<meta charset="utf-8">` and viewport meta
3. Support dark mode (`prefers-color-scheme`)
4. External resources are default-deny, but ECharts CDN is allowed for chart-driven cards
5. Use HTML comments to mark data sections for easy replacement:

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{CARD_TITLE}}</title>
    <style>
      /* All styles inline */
    </style>
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
  </body>
</html>
```

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
3. 通过 web_search / read_webpages_as_markdown 获取最新数据
4. 根据提示词分析和组织数据
5. 归档：将当前 `latest/` 下所有文件复制到 `history/YYYY-MM-DD_HH-mm/`（兼容模式：重命名 `latest.html`）
6. 复制模板：将 `template/` 下所有文件复制到 `latest/`（覆盖），作为本次生成的基础
7. 修改数据区：仅修改 `latest/index.html` 中 `<!-- DATA_SECTION_START -->` 到 `<!-- DATA_SECTION_END -->` 之间的内容，填入最新数据；不改动 styles.css / scripts.js
8. 更新 magic.project.js 的 last_generated 和 generation_count
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

1. Use `window.Magic.setInputMessage(message)` to send a prefilled deep-analysis request to Agent.
2. Optionally use `window.Magic.fs.readFile` / `writeFile` for local card context and generated notes within the card app root.
3. Bind actions via `addEventListener` only (no inline onclick).

Example pattern in card UI:

1. "Generate analysis request" button: extract key text from card sections.
2. "Send to Agent" button: call `window.Magic.setInputMessage(...)`.
3. Show status text if Magic API is unavailable in current runtime.

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

- `hotspot-tracker/` — Hotspot tracker (trending list + trend markers + timestamps)
- `daily-digest/` — Daily digest (column layout + key metrics + industry updates)
- `analytics-panel/` — Analytics panel (KPI numbers + comparisons + trend charts)

Each template folder contains: `index.html`, `styles.css`, `scripts.js`, and `prompts/` (optional analysis prompt snippets).
When creating cards, you can reference these templates' structure and style, or create fully custom ones.
