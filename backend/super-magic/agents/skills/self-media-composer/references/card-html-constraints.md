# Card HTML Constraints

Cards are static HTML files. Keep them self-contained and deterministic.

## Visual Language Priority

Top beats bottom:

1. **User artifacts supplied in the current session** — `@`ed HTML template, style screenshot, Figma frame, explicit CSS spec. Reproduce them faithfully; do not normalize away their signature traits.
2. **Built-in preset chosen in Step 4.1** — follow its CSS classes, palette, typography, and component patterns. Link the copied CSS/JS via `<link href="../../shared/presets/<preset>/<preset>.css">` and `<script src="../../shared/presets/<preset>/<preset>.js"></script>`.
3. **Platform defaults** — fall back to the Platform Defaults table and the constraints listed here.

## Technical Constraints

- **Fixed canvas**: set both `<html>` and `<body>` to the chosen `width` and `height`. No media queries, no responsive tricks. The card must render identically at any viewport.
- **Tech stack**: 优先使用预设模板 CSS（通过 `<link>` 引用），模板未覆盖的样式使用内联 `<style>` 标签编写原生 CSS。非必要不使用 TailwindCSS。inline JS at the bottom of `<body>` only when strictly needed. Do not load external data.
- **CSS 策略**:
  1. 首选：直接使用预设 CSS 中已定义的 class（如 `.cd-header`, `.cd-body`, `.bg-dark` 等）
  2. 次选：在 `<head>` 中用 `<style>` 标签编写原生 CSS 补充模板缺少的样式
  3. 避免：不要引入 TailwindCSS CDN，除非项目明确要求
- **Images**: only reference local files. `assets/<name>` for post-local assets, `../../shared/<name>` for shared assets. Never hotlink remote images in the final card.
- **Fonts and icons** — use the same CDN set as other Magic projects to keep caching consistent:
  - FontAwesome: `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css`
  - Google Fonts: `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap`
- **Root scale**: leave `<html>` at the browser default root (16px). Do NOT set `font-size` on `<html>`.
- **No dynamic effects**: no keyframe animations, no timed transitions, no fetches. Static visuals only.

## Content Density Rules

- **Structural fill rule**: every card should include at least **4 of these 6 element classes** — (a) main title, (b) subtitle or lead-in, (c) body block / paragraph / data list, (d) numeric stat or callout badge, (e) tag chips or metadata row (≥2 items), (f) decorative element (illustration, icon cluster, divider, background motif, or shape). The chosen elements should span at least **2 of the 3 vertical zones** (top 0-33%, middle 33-67%, bottom 67-100%). Avoid large continuous blank regions that exist only because no content was authored.
- **Whitespace discipline**: breathing room around a focal point, grouping boundaries, and safe margins are allowed when they carry intent. When content is genuinely sparse, enrich the card with subtitle, quote, tag chips, section divider, illustration, or background texture — never pad with blank space.
- **Content density per card**: one strong focal point supported by secondary structure; concise copy; one primary image plus optional decorative motifs.

## Minimal Skeleton (rednote, 540×720)

```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <title>Card 01</title>
    <!-- 预设模板 CSS (必选) -->
    <link
      rel="stylesheet"
      href="../../shared/presets/code-dispatch/code-dispatch.css"
    />
    <link
      rel="stylesheet"
      href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css"
    />
    <!-- 模板未覆盖的补充样式 -->
    <style>
      /* 仅放置模板 CSS 中没有的自定义样式 */
    </style>
  </head>
  <body class="bg-light">
    <!-- 直接使用模板 class 构建布局 -->
    <div class="cd-header">...</div>
    <div class="cd-body is-content">...</div>
    <div class="cd-footer">...</div>
    <!-- <script src="../../shared/presets/code-dispatch/code-dispatch.js"></script> -->
  </body>
</html>
```

Swap the preset path when using a different template. The preset CSS already handles `html/body` dimensions (540×720) and `overflow: hidden`.

## Rednote Hashtag Rendering

Use these rules when `post.json.meta.tags` exists for a `rednote` post:

1. Render the full hashtag set only once, preferably on the final content card or in the final-card footer.
2. Format each tag with `#`; separate tags with single spaces. Do not use commas, bullets, or one-tag-per-line blocks.
3. Flatten structured tags in this order: `core -> mid -> longtail -> trend`.
4. Tag text should be visually secondary: 1-2 steps smaller than body text, brand accent or muted gray, no oversized badges that compete with the card message.
5. Inline 1-2 high-value tags only when the sentence remains natural, for example:

```html
<p>这套 <span class="tag-inline">#通勤穿搭</span> 的重点是腰线和外套长度。</p>
```

Do not repeat the same full hashtag block on every card. Do not place unrelated traffic tags in visible copy.
