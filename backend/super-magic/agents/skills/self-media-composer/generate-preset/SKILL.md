---
name: generate-preset
description: >
  Optional sub-skill of self-media-composer. Generates a custom CSS + JS preset pair from a user's
  style description. Load this skill when the user chooses "Custom style" in Step 4.1 of the
  self-media-composer workflow, or explicitly asks to create / design a new visual template.

  English triggers:
  - "make a new preset", "create a style for me", "I want a custom template"
  - "design a theme that looks like…", "generate a matching preset"
  - User provides a reference image / Figma frame / screenshot and asks for a matching preset

  中文触发词：
  - 自定义样式 / 帮我设计一套风格 / 我想要一个自定义模板
  - 新建预设 / 创建新的视觉模板 / 帮我设计一个主题
  - 生成一套配色方案 / 做一套设计规范
  - 用户提供参考图 / Figma 稿 / 截图并要求匹配风格时
---

# Generate Preset Sub-Skill

Generates a ready-to-use CSS + JS preset bundle for self-media cards, derived from the user's free-form style description. The output is a pair of files (`<preset-name>.css` + `<preset-name>.js`) that follow the exact same anatomy as the built-in presets (`neo-brutalism`, `code-dispatch`, `dark-tech`).

---

## When to Load This Skill

Load this skill immediately when **any** of the following is true:

**English triggers:**
- The user selects "Custom style — describe the visual language you want" in the Step 4.1 preset picker.
- The user says phrases like "make a new preset", "create a style for me", "I want a custom template", "design a theme that looks like…".
- The user provides a reference image, Figma frame, or screenshot and asks to "generate a matching preset".

**中文触发词（出现以下任意表达时立即加载本技能）：**
- 用户在 Step 4.1 中选择了"自定义样式"选项
- 自定义样式 / 帮我设计一套风格 / 我想要一个自定义模板
- 新建预设 / 创建新的视觉模板 / 帮我设计一个主题
- 生成一套配色方案 / 做一套设计规范 / 搞一个新的预设
- 用户提供参考图、Figma 稿或截图并要求"参考这个风格生成预设"

Do **not** load this skill for small card-level tweaks (e.g. "change this card's background color"). This skill is exclusively for authoring a reusable preset bundle.

---

## Workflow

### Step G1 — Extract the Design Brief

Interview the user (or infer from context) to resolve these five axes. Use `ask_user` if any axis is missing and cannot be safely inferred.

| Axis | Key questions | Examples |
|---|---|---|
| **Mood / Aesthetic** | How should a viewer *feel*? | Energetic, calm, authoritative, playful, minimalist, luxurious, retro, futuristic |
| **Color Palette** | Primary bg, accent, text, border colors | Light or dark bg? Warm or cool tones? Saturated or muted? |
| **Typography** | Font personality | Serif, sans-serif, monospace? Heavy weight contrast or uniform? |
| **Decoration** | Visual texture and ornamentation | Grid lines, ruled paper, noise texture, clean flat, geometric shapes, gradient overlays |
| **Content Domain** | What topics will the cards cover? | Tech/coding, lifestyle, beauty, finance, travel, food, product reviews |

If the user provides a reference image, use `visual_understanding` to extract the palette, dominant textures, typography weight, and layout language before proceeding.

### Step G2 — Define Design Tokens

Translate the brief into a concrete token set. Write these down before writing any code.

**Required tokens:**

```
Preset name:   <safe-for-filesystem slug, e.g. "soft-pastel">
Global prefix: <2-4 letter prefix for all CSS classes, e.g. "sp-">
JS namespace:  window.<PascalCase>Presets  (e.g. window.SoftPastelPresets)

Color tokens:
  bg-primary:    <hex>    Main card background
  bg-surface:    <hex>    Elevated surface / inner block bg
  bg-surface2:   <hex>    Second elevation (optional)
  accent:        <hex>    Primary accent / CTA color
  accent-light:  <hex>    Lighter accent variant (hover states, highlights)
  text-primary:  <hex>    Main body text
  text-muted:    <hex>    Secondary / subdued text
  border:        <hex>    Default border / rule color
  border-accent: <hex>    Accented border (optional)
  positive:      <hex>    Positive / success indicator (green-family)
  negative:      <hex>    Negative / danger indicator (red-family)

Typography tokens:
  font-display:  <CSS font-family string>   Titles and large display text
  font-body:     <CSS font-family string>   Body and label text
  weight-heavy:  <number>   e.g. 900 or 700
  weight-light:  <number>   e.g. 300 or 400
  letter-spacing-display: <em value>
  letter-spacing-body:    <em value>

Border & Shadow tokens:
  border-width:  <px>         e.g. 3px (neo-brutalism) or 1px (dark-tech)
  border-radius: <px or 0>    e.g. 0 for hard edges, 8px for soft
  shadow-style:  <CSS value or "none">   Hard offset = "4px 4px 0 #000", soft = "none"

Texture / background decoration:
  bg-pattern:    <CSS background-image or "none">  e.g. grid lines, dots, ruled lines
```

### Step G3 — Author the CSS File

Write `<preset-name>.css` using the token values from Step G2. Follow the exact section structure (§0 variables, §1 card shell, §2 content components, §3 utility classes, §4 layout helpers) documented in [references/css-anatomy.md](./references/css-anatomy.md).

**Critical constraint from §0**: `html, body { width:540px; height:720px; overflow:hidden; }` must appear verbatim. Never set `font-size` on `html`.

### Step G4 — Author the JS File

Write `<preset-name>.js` as a self-executing IIFE that exposes a global registry `window.<PascalCase>Presets`. Load [references/js-skeleton.md](./references/js-skeleton.md) for the complete skeleton to fill in.

**Key rules:**

- Keep design tokens in `T` object — same hex values as in the CSS `:root` block.
- Include **at least 3 preset chart types** from: bar, line, donut, radar, column, scatter.
- Only use ECharts (assumed present on page). No `fetch`, no DOM manipulation outside of ECharts.
- The IIFE must use the exact wrapper: `(function(global){ ... }(window));`
- Expose only one global: `window.<PascalCase>Presets`.
- Include the full CSS class quick-reference as a JSDoc comment block.

### Step G5 — Save the Files

Write both files directly into the project's `shared/presets/<preset-name>/` folder:

```
<project-root>/shared/presets/<preset-name>/<preset-name>.css
<project-root>/shared/presets/<preset-name>/<preset-name>.js
```

Use `write_file` for both. If the destination already exists, ask the user before overwriting.

### Step G6 — Register the Preset

After writing the files, do **not** modify the master `self-media-composer/SKILL.md`. The generated preset lives only in the project's `shared/presets/` folder. It is a **project-local** preset, not a built-in one.

The self-media-composer workflow (Step 4.4) will reference it exactly like a built-in preset:

```html
<link rel="stylesheet" href="../../shared/presets/<preset-name>/<preset-name>.css">
<script src="../../shared/presets/<preset-name>/<preset-name>.js"></script>
```

---

## Quality Checklist

Before handing off the generated files, verify every item:

**CSS**
- [ ] `html, body { width:540px; height:720px; overflow:hidden; }` present and exact
- [ ] No `font-size` set on `html`
- [ ] `:root` block lists all tokens from Step G2
- [ ] All six required component classes are present
- [ ] All four utility groups are present
- [ ] Layout helpers section complete
- [ ] Class names all share the same prefix and do not collide with Tailwind (`tw-` is safe; avoid single-word names like `.card`, `.header`)

**JS**
- [ ] Token object `T` matches CSS `:root` hex values exactly
- [ ] At least 3 chart presets implemented
- [ ] Wrapped in IIFE, exposes only one global
- [ ] CSS quick-reference included as JSDoc comment
- [ ] No external fetches or dynamic DOM manipulation

**Files**
- [ ] Both files saved at `shared/presets/<preset-name>/`
- [ ] File names match the preset slug exactly (e.g. `soft-pastel.css`, `soft-pastel.js`)

---

## References

Load these files during the corresponding steps:

| Reference | When to load |
|---|---|
| [CSS File Anatomy](./references/css-anatomy.md) | During Step G3 — full §0–§4 structure, component list, utility groups |
| [JS File Skeleton](./references/js-skeleton.md) | During Step G4 — complete IIFE skeleton to fill in |

---

## Example: Deriving a "Soft Pastel" Preset

**User description:** "I want something soft and feminine — pastel pink and mint, rounded corners, no harsh shadows, light and airy feel."

**Derived tokens:**

```
Preset name:   soft-pastel
Global prefix: sp-
JS namespace:  window.SoftPastelPresets

bg-primary:    #FFF8F8   Warm near-white
bg-surface:    #FFE8EE   Soft pink surface
bg-surface2:   #E8F8F2   Soft mint surface
accent:        #F472A0   Rose pink
accent-light:  #FBB6D1   Light rose
text-primary:  #3D2B35   Deep warm brown
text-muted:    #9E7A88   Muted pink-brown
border:        #F0D0DC   Soft pink border
positive:      #52C97A   Mint green
negative:      #F07070   Muted coral

font-display:  'Noto Serif SC', Georgia, serif
font-body:     'Noto Sans SC', sans-serif
weight-heavy:  700
weight-light:  300
letter-spacing-display: 0.02em
letter-spacing-body:    0.01em

border-width:   1.5px
border-radius:  16px
shadow-style:   0 4px 16px rgba(244,114,160,0.12)
bg-pattern:     none (clean flat)
```

**Resulting visual identity:** Warm white + blush pink + mint accent, soft rounded corners, gentle box shadows (no hard offset), serif display font for warmth. Ideal for beauty, lifestyle, relationship, wellness topics.
