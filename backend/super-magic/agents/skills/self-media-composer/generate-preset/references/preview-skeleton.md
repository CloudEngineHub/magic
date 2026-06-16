# Preview HTML Skeleton

The preview file is a standalone HTML page that showcases all major components of the preset in a scrollable gallery layout. It allows designers and developers to visually verify the preset without creating a full post.

## File Location

```
<preset-folder>/preview.html
```

Sits alongside `<preset-name>.css` and `<preset-name>.js` in the same directory.

## Structure Rules

1. **Override the fixed canvas** — The preset CSS locks `html, body` to `540×720` (or platform-specific size). The preview must override this to allow scrolling and show multiple cards.
2. **Show at least 3 card variants** — Demonstrate the preset's cover card, at least one content card, and one card showcasing data/chart components.
3. **Use real-looking content** — Fill cards with representative placeholder content that matches the preset's content domain (from Step G1) and the user's preferred output language. Never leave cards empty.
4. **Exercise all major CSS classes** — Every §2 component and §3 utility class should appear at least once across all preview cards.
5. **Load the preset's JS** — Include `<script src="<preset-name>.js"></script>` at the end of `<body>` so chart presets can be demonstrated.
6. **Include ECharts** — If the preset includes chart presets, load ECharts from CDN and render at least one chart to verify the JS file works.

## Platform-Specific Layout

### For `rednote` (540×720 cards)

```html
<!DOCTYPE html>
<html lang="{user-language}">
  <head>
    <meta charset="UTF-8" />
    <title><Preset Display Name> — Preview</title>
    <link rel="stylesheet" href="<preset-name>.css" />
    <style>
      html,
      body {
        width: auto;
        height: auto;
        overflow: auto;
        background: #e5e5e5;
      }
      .preview-container {
        display: flex;
        flex-wrap: wrap;
        gap: 32px;
        padding: 40px;
        justify-content: center;
        align-items: flex-start;
      }
      .preview-card-wrapper {
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
        border-radius: 4px;
        overflow: hidden;
        width: 540px;
        height: 720px;
        position: relative;
      }
    </style>
  </head>
  <body>
    <div class="preview-container">
      <!-- Card 1: Cover -->
      <div class="preview-card-wrapper">
        <div class="<prefix>-card <prefix>-cover">
          <!-- Cover card content: hero title, subtitle, author, decorations -->
        </div>
      </div>

      <!-- Card 2: Content with data/stats -->
      <div class="preview-card-wrapper">
        <div class="<prefix>-card <prefix>-content">
          <!-- Header, section label, data cards, list rows -->
        </div>
      </div>

      <!-- Card 3: Content with chart -->
      <div class="preview-card-wrapper">
        <div class="<prefix>-card <prefix>-content">
          <!-- Header, chart container, note/footer -->
          <div id="preview-chart-1" style="width:100%;height:240px;"></div>
        </div>
      </div>

      <!-- Card 4: Content with list/ranking -->
      <div class="preview-card-wrapper">
        <div class="<prefix>-card <prefix>-content">
          <!-- List rows, badges, tags, dividers -->
        </div>
      </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
    <script src="<preset-name>.js"></script>
    <script>
      // Initialize preview charts
      (function() {
        var el = document.getElementById('preview-chart-1');
        if (el && typeof echarts !== 'undefined' && window.<PascalCase>Presets) {
          var chart = echarts.init(el);
          var option = <PascalCase>Presets.get('<preset-name>-bar', {
            categories: ['A', 'B', 'C', 'D', 'E'],
            values: [120, 200, 150, 80, 170],
            highlightIndex: 1
          });
          chart.setOption(option);
        }
      })();
    </script>
  </body>
</html>
```

### For `instagram` (1080×1350 cards, scaled down)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title><Preset Display Name> — Preview</title>
    <link rel="stylesheet" href="<preset-name>.css" />
    <style>
      html,
      body {
        width: auto;
        height: auto;
        overflow: auto;
        background: #e8e8e8;
      }
      .preview-container {
        display: flex;
        flex-direction: column;
        gap: 40px;
        padding: 40px;
        align-items: center;
      }
      .preview-card-wrapper {
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        border-radius: 4px;
        overflow: hidden;
        transform: scale(0.5);
        transform-origin: top center;
        width: 1080px;
        height: 1350px;
        margin-bottom: calc(-1350px * 0.5);
      }
    </style>
  </head>
  <body>
    <div class="preview-container">
      <!-- Card 1: Cover -->
      <div class="preview-card-wrapper">
        <div class="<prefix>-card <prefix>-cover">
          <!-- Cover card content -->
        </div>
      </div>

      <!-- Card 2: Content -->
      <div class="preview-card-wrapper">
        <div class="<prefix>-card <prefix>-content">
          <!-- Content card -->
        </div>
      </div>

      <!-- Card 3: Data / Chart -->
      <div class="preview-card-wrapper">
        <div class="<prefix>-card <prefix>-content">
          <!-- Data visualization -->
        </div>
      </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
    <script src="<preset-name>.js"></script>
  </body>
</html>
```

## Content Guidelines for Preview Cards

Each preview card should demonstrate specific capabilities:

| Card                | Must showcase                                                                        | Content tips                                                                     |
| ------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Cover**           | `.<prefix>-cover`, decorative elements, display typography                           | Use a catchy title related to the content domain; show accent colors prominently |
| **Content (stats)** | `.<prefix>-header`, `.<prefix>-section-label`, `.<prefix>-data-card`, utility badges | Show 2-3 data cards with varied values; use `.text-positive` / `.text-negative`  |
| **Content (chart)** | ECharts integration, `.<prefix>-note` footer                                         | Render one chart preset (bar or line); add a footer note below                   |
| **Content (list)**  | `.<prefix>-list-row`, `.<prefix>-divider`, `.<prefix>-badge`                         | Show 3-5 ranked items; highlight the top item; include tag chips                 |

## Verification

After writing the preview, open it in a browser (or verify mentally) against these checks:

- [ ] All cards render at the correct dimensions (no overflow, no blank areas)
- [ ] Colors match the `:root` token values exactly
- [ ] Typography hierarchy is visible (display vs body fonts, weight contrast)
- [ ] At least one chart renders correctly using the JS preset
- [ ] All §2 component classes appear at least once across all cards
- [ ] Utility classes (badges, text colors, highlights) are demonstrated
- [ ] The preview scrolls smoothly and cards don't overlap
