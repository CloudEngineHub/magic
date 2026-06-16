# Card HTML Constraints

Cards are static HTML files. Keep them self-contained and deterministic.

## Visual Language Priority

Top beats bottom:

1. **User artifacts supplied in the current session** — `@`ed HTML template, style screenshot, Figma frame, explicit CSS spec. Reproduce them faithfully; do not normalize away their signature traits.
2. **Built-in preset chosen in Step 4.1** — follow its CSS classes, palette, typography, and component patterns. Link the copied CSS/JS via `<link href="../../shared/presets/<preset>/<preset>.css">` and `<script src="../../shared/presets/<preset>/<preset>.js"></script>`.
3. **Platform defaults** — fall back to the Platform Defaults table and the constraints listed here.

## Technical Constraints

- **Fixed canvas**: set both `<html>` and `<body>` to the chosen `width` and `height`. No media queries, no responsive tricks. The card must render identically at any viewport.
- **Tech stack**: Prefer the chosen preset CSS via `<link>`. Add native CSS in a `<style>` block only for styles the preset does not cover. Avoid TailwindCSS unless the project explicitly requires it. Inline JS at the bottom of `<body>` only when strictly needed. Do not load external data.
- **CSS strategy**:
  1. First choice: use classes already defined by the preset, such as `.cd-header`, `.cd-body`, or `.bg-dark`.
  2. Second choice: add small native CSS supplements in `<head><style>`.
  3. Avoid: do not add the TailwindCSS CDN unless the project explicitly requires it.
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
<html lang="{user-language}">
  <head>
    <meta charset="utf-8" />
    <title>Card 01</title>
    <!-- Required preset CSS -->
    <link
      rel="stylesheet"
      href="../../shared/presets/code-dispatch/code-dispatch.css"
    />
    <link
      rel="stylesheet"
      href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css"
    />
    <!-- Small style supplements not covered by the preset -->
    <style>
      /* Only custom styles missing from the preset CSS */
    </style>
  </head>
  <body class="bg-light">
    <!-- Build the layout directly with preset classes -->
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
5. Inline 1-2 high-value tags only when the sentence remains natural and matches the user's output language, for example:

```html
<p>This checklist makes <span class="tag-inline">#commuteoutfits</span> easier to reuse on busy mornings.</p>
```

Do not repeat the same full hashtag block on every card. Do not place unrelated traffic tags in visible copy.
