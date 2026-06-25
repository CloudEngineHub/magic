# AI Card HTML Specification

## File Requirements

1. **Folder-based preferred**: Use a folder-based multi-file structure for maintainability (`index.html` + optional `styles.css` + optional `scripts.js`). Single-file is still supported for legacy and lightweight scenarios.
2. **Encoding**: Must include `<meta charset="utf-8">`.
3. **Viewport**: Must include `<meta name="viewport" content="width=device-width, initial-scale=1.0">`.
4. **External Resources Policy**: Default to no external resources, but allow a small whitelist of trusted CDN dependencies when they unlock major value. ECharts CDN is explicitly allowed for chart-driven cards.
5. **Responsive**: Use CSS Grid or Flexbox for layout. Card should render well at various widths (300px–1200px).
6. **Source Preservation**: If generated content is based on web or file sources, keep source URLs in the rendered HTML and optionally in `data/sources.json`.
7. **Interactive by Purpose**: Add interactions that help analysis or action (filters, tabs, source previews, AI follow-ups). Avoid purely decorative controls.
8. **iframe View Modes**: The same HTML must support compact card iframes and full detail iframes through CSS breakpoints.

## Recommended Project Layout

Preferred (multi-file):

```text
{card-directory}/
├── template/
│   ├── index.html
│   ├── styles.css        # optional
│   ├── scripts.js        # optional
│   └── data/             # optional seed schemas
│       ├── card-data.json
│       └── sources.json
├── latest/
│   ├── index.html
│   ├── styles.css        # optional
│   ├── scripts.js        # optional
│   └── data/             # optional generated data
│       ├── card-data.json
│       └── sources.json
└── history/
  └── YYYY-MM-DD_HH-mm/
    ├── index.html
    ├── styles.css        # optional
    ├── scripts.js        # optional
    └── data/             # optional snapshot data
        ├── card-data.json
        └── sources.json
```

Legacy (single-file):

```text
{card-directory}/template.html
{card-directory}/latest.html
```

## Dark Mode Support

Use CSS `prefers-color-scheme` media query:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a2e;
    --text: #e0e0e0;
    --card-bg: #16213e;
  }
}
```

## Responsive iframe Modes

Cards are displayed inside host iframes. CSS media queries observe the iframe width, so every template should define these modes:

| Mode | Breakpoint | Layout Intent |
| --- | --- | --- |
| Compact card | `max-width: 420px` | Cover-like summary for grid thumbnails. Show title, timestamp, key metrics, and 1-3 bullets. Hide dense sections, long lists, source iframes, and secondary controls. |
| Mobile detail | `421px-767px` | Single-column readable report. Keep all core content, stacked and scrollable. |
| Desktop detail | `min-width: 768px` | Full dashboard/report layout with columns, charts, source previews, and richer interaction. |

Compact card CSS pattern:

```css
@media (max-width: 420px) {
  body {
    min-height: 100vh;
    padding: 0;
    overflow-x: hidden;
  }

  .page {
    min-height: 100vh;
    padding: 18px;
    display: flex;
    flex-direction: column;
  }

  .details,
  .source-frame-wrap,
  .secondary-actions {
    display: none;
  }

  .summary {
    margin-top: auto;
  }
}
```

Rules:

- Do not rely on the parent page to pass a mode flag; iframe width should be enough.
- If the host later adds `?mode=card` or a body class, it may refine the layout, but CSS breakpoints must still work without it.
- Compact mode should not simply scale down the desktop page. It should intentionally select the most useful summary content.
- Avoid viewport-width font scaling. Use normal responsive layout, line clamping, and section hiding/reordering.

## Data Section Marking

Mark dynamic data sections with HTML comments so the agent can locate and replace them:

```html
<!-- DATA_SECTION_START -->
<div class="content">
  <!-- Dynamic content goes here -->
</div>
<!-- DATA_SECTION_END -->
```

For multiple data zones, use named markers:

```html
<!-- DATA:metrics_START -->
<div class="metrics">...</div>
<!-- DATA:metrics_END -->

<!-- DATA:list_START -->
<ul class="items">
  ...
</ul>
<!-- DATA:list_END -->
```

## Template Variables

Templates may use placeholder patterns that the agent replaces during generation:

| Placeholder            | Description                                      |
| ---------------------- | ------------------------------------------------ |
| `{{CARD_TITLE}}`       | Card display name                                |
| `{{GENERATED_AT}}`     | Generation timestamp (ISO 8601 or locale string) |
| `{{UPDATE_COUNT}}`     | Total generation count                           |
| `{{CARD_DESCRIPTION}}` | Card description text                            |

## Scenario-Driven Template Modules

Use the user's request to choose modules instead of blindly copying a preset:

| Scenario | Useful Modules |
| --- | --- |
| Hotspot / public opinion | Ranking list, trend curve, platform mix, sentiment/risk badges, lifecycle estimate, source preview |
| Daily / weekly digest | Executive summary, metric groups, timeline, action checklist, citation list, expandable details |
| Analytics dashboard | KPI grid, funnel, cohort/channel breakdown, anomaly alerts, range tabs, drilldown prompts |
| Research / intelligence | Claims, evidence matrix, source reliability, iframe preview, comparison table, contradiction notes |
| Decision / planning | Option comparison, risk/reward matrix, milestone timeline, owners, next actions |

## Source Links and iframe Preview

Every fetched URL that materially supports a claim should be recorded. At minimum, render an accessible source list with title, site, retrieval time, short relevance note, and an open-in-new-tab link.

Recommended `data/sources.json` shape:

```json
[
  {
    "id": "src-001",
    "title": "Source title",
    "url": "https://example.com/article",
    "site": "Example",
    "type": "article",
    "publishedAt": "2026-06-10T08:00:00+08:00",
    "retrievedAt": "2026-06-10T09:00:00+08:00",
    "summary": "Why this source matters",
    "linkedClaimIds": ["claim-01"],
    "display": "iframe"
  }
]
```

Display rules:

- `display: "iframe"` for public articles, docs, PDFs, maps, dashboards, generated local HTML, or pages whose original layout helps interpretation.
- `display: "link"` for login-gated, payment, private, sensitive, or commonly frame-blocked pages.
- Even when iframe preview is used, always include `<a target="_blank" rel="noopener noreferrer">`.
- Use `sandbox`, `loading="lazy"`, and `referrerpolicy="no-referrer"` on iframes.
- If preview fails, keep the card usable with a clear fallback and the external link.

Example:

```html
<section class="sources" aria-label="Sources">
  <article class="source-card">
    <strong>Source title</strong>
    <p>Why this source matters.</p>
    <button type="button" class="source-preview" data-preview-url="https://example.com/article">
      Preview
    </button>
    <a href="https://example.com/article" target="_blank" rel="noopener noreferrer">Open</a>
  </article>
  <iframe
    class="source-frame"
    title="Source preview"
    sandbox="allow-scripts allow-same-origin allow-popups"
    loading="lazy"
    referrerpolicy="no-referrer"
  ></iframe>
</section>
```

## html-api-sdk Interaction (Optional)

Cards can include optional UI actions that cooperate with Agent analysis:

1. Build a "Generate Deep Analysis Prompt" action based on rendered card content and source links.
2. Prefer `window.Magic.project.createTopicAndSend(prompt, { model: "auto" })` for substantial follow-up work.
3. Fall back to `window.Magic.setInputMessage(prompt)` when project APIs are unavailable.
4. If `window.Magic` is unavailable, show a readable fallback status message instead of failing silently.

Recommended runtime guard:

```javascript
if (
  window.Magic &&
  window.Magic.project &&
  typeof window.Magic.project.createTopicAndSend === "function"
) {
  window.Magic.project.createTopicAndSend(prompt, { model: "auto" });
} else if (window.Magic && typeof window.Magic.setInputMessage === "function") {
  window.Magic.setInputMessage(prompt);
} else {
  statusEl.textContent = "Magic API unavailable in current environment";
}
```

## Recommended Structure

```html
<!DOCTYPE html>
<html lang="{user-language}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{CARD_TITLE}}</title>
    <style>
      :root {
        --bg: #ffffff;
        --text: #1a1a1a;
        --card-bg: #f8f9fa;
        --accent: #3b82f6;
        --border: #e5e7eb;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #0f172a;
          --text: #e2e8f0;
          --card-bg: #1e293b;
          --accent: #60a5fa;
          --border: #334155;
        }
      }
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg);
        color: var(--text);
        padding: 24px;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>{{CARD_TITLE}}</h1>
      <p class="subtitle">{{CARD_DESCRIPTION}}</p>
      <time datetime="{{GENERATED_AT}}">Updated: {{GENERATED_AT}}</time>
    </header>

    <!-- DATA_SECTION_START -->
    <main>
      <!-- Agent fills content here -->
    </main>
    <!-- DATA_SECTION_END -->

    <footer>
      <p>Auto-generated · Update #{{UPDATE_COUNT}}</p>
    </footer>
  </body>
</html>
```

## History Snapshot Naming

When archiving the current latest output to `history/`, prefer folder snapshots:

```
history/YYYY-MM-DD_HH-mm/index.html
```

Copy the entire `latest/` folder contents into the snapshot folder, including
`styles.css`, `scripts.js`, images, and any other same-folder assets referenced
by relative URLs.

Legacy single-file naming is still acceptable:

```
history/YYYY-MM-DD_HH-mm.html
```

Example: `history/2026-05-23_09-00.html`

## Whitelisted External Resources

- `https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js`
- `https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js`

Use only one ECharts source per card. Additional external libraries should stay default-deny unless explicitly approved by scenario requirements.

## Performance Guidelines

- Keep total HTML file size practical for iframe rendering. The previous 500KB target is still recommended, but may be exceeded when chart runtime is loaded from a trusted CDN.
- Minimize inline JavaScript; use it only for essential interactivity
- Prefer CSS animations over JavaScript animations
- Use semantic HTML for accessibility

## ECharts Implementation Notes

- Prefer direct ECharts rendering for trend charts, funnels, bars, pies, and sparklines.
- Initialize charts after DOM creation and call `resize()` on window resize.
- Read colors from CSS variables so chart theme follows light/dark mode changes.
- If CDN loading fails in a restricted environment, the card should still preserve readable narrative sections.
