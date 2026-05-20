# Card HTML Constraints

Cards are static HTML files. Keep them self-contained and deterministic.

## Visual Language Priority

Top beats bottom:

1. **User artifacts supplied in the current session** — `@`ed HTML template, style screenshot, Figma frame, explicit CSS spec. Reproduce them faithfully; do not normalize away their signature traits.
2. **Built-in preset chosen in Step 4.1** — follow its CSS classes, palette, typography, and component patterns. Link the copied CSS/JS via `<link href="../../shared/presets/<preset>/<preset>.css">` and `<script src="../../shared/presets/<preset>/<preset>.js"></script>`.
3. **Platform defaults** — fall back to the Platform Defaults table and the constraints listed here.

## Technical Constraints

- **Fixed canvas**: set both `<html>` and `<body>` to the chosen `width` and `height`. No media queries, no responsive tricks. The card must render identically at any viewport.
- **Tech stack**: TailwindCSS CDN + FontAwesome; inline custom CSS in `<head>`; inline JS at the bottom of `<body>` only when strictly needed. Do not load external data.
- **Images**: only reference local files. `assets/<name>` for post-local assets, `../../shared/<name>` for shared assets. Never hotlink remote images in the final card.
- **Fonts and icons** — use the same CDN set as other Magic projects to keep caching consistent:
  - TailwindCSS: `https://cdn.tailwindcss.com/3.4.17` (via `<script>` tag)
  - FontAwesome: `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css`
  - Google Fonts: `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap`
- **Root scale**: leave `<html>` at the browser default root (16px). Do NOT set `font-size` on `<html>` — Tailwind's rem-based utilities are calibrated against the default 16px baseline.
- **No dynamic effects**: no keyframe animations, no timed transitions, no fetches. Static visuals only.

## Content Density Rules

- **Structural fill rule**: every card should include at least **4 of these 6 element classes** — (a) main title, (b) subtitle or lead-in, (c) body block / paragraph / data list, (d) numeric stat or callout badge, (e) tag chips or metadata row (≥2 items), (f) decorative element (illustration, icon cluster, divider, background motif, or shape). The chosen elements should span at least **2 of the 3 vertical zones** (top 0-33%, middle 33-67%, bottom 67-100%). Avoid large continuous blank regions that exist only because no content was authored.
- **Whitespace discipline**: breathing room around a focal point, grouping boundaries, and safe margins are allowed when they carry intent. When content is genuinely sparse, enrich the card with subtitle, quote, tag chips, section divider, illustration, or background texture — never pad with blank space.
- **Content density per card**: one strong focal point supported by secondary structure; concise copy; one primary image plus optional decorative motifs.

## Minimal Skeleton (rednote, 540×720)

```html
<!doctype html>
<html lang="zh" style="width:540px;height:720px">
  <head>
    <meta charset="utf-8" />
    <title>Card 01</title>
    <script src="https://cdn.tailwindcss.com/3.4.17"></script>
    <link
      rel="stylesheet"
      href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css"
    />
    <!-- Optional preset (rednote: neo-brutalism) -->
    <!-- <link rel="stylesheet" href="../../shared/presets/neo-brutalism/neo-brutalism.css" /> -->
  </head>
  <body class="w-[540px] h-[720px] bg-white overflow-hidden">
    <!-- layout -->
    <!-- <script src="../../shared/presets/neo-brutalism/neo-brutalism.js"></script> -->
  </body>
</html>
```

Swap the inline dimensions when the platform or user-specified size differs. `overflow-hidden` on `<body>` keeps accidental overflow from leaking into the screenshot.
