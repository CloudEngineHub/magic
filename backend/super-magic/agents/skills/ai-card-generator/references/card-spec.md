# AI Card HTML Specification

## File Requirements

1. **Folder-based preferred**: Use a folder-based multi-file structure for maintainability (`index.html` + optional `styles.css` + optional `scripts.js`). Single-file is still supported for legacy and lightweight scenarios.
2. **Encoding**: Must include `<meta charset="utf-8">`.
3. **Viewport**: Must include `<meta name="viewport" content="width=device-width, initial-scale=1.0">`.
4. **External Resources Policy**: Default to no external resources, but allow a small whitelist of trusted CDN dependencies when they unlock major value. ECharts CDN is explicitly allowed for chart-driven cards.
5. **Responsive**: Use CSS Grid or Flexbox for layout. Card should render well at various widths (300px–1200px).

## Recommended Project Layout

Preferred (multi-file):

```text
{card-directory}/
├── template/
│   ├── index.html
│   ├── styles.css        # optional
│   └── scripts.js        # optional
├── latest/
│   ├── index.html
│   ├── styles.css        # optional
│   └── scripts.js        # optional
└── history/
  └── YYYY-MM-DD_HH-mm/
    └── index.html
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

## html-api-sdk Interaction (Optional)

Cards can include optional UI actions that cooperate with Agent analysis:

1. Build a "Generate Deep Analysis Prompt" action based on rendered card content.
2. Send that prompt to Agent with `window.Magic.setInputMessage(prompt)`.
3. If `window.Magic` is unavailable, show a readable fallback status message instead of failing silently.

Recommended runtime guard:

```javascript
if (window.Magic && typeof window.Magic.setInputMessage === "function") {
  window.Magic.setInputMessage(prompt);
} else {
  statusEl.textContent = "Magic API unavailable in current environment";
}
```

## Recommended Structure

```html
<!DOCTYPE html>
<html lang="zh-CN">
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
