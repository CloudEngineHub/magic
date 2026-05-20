# CSS File Anatomy

Full structure specification for `<preset-name>.css`. Every section is required; omit components that don't apply by leaving a brief comment instead of deleting the section header.

## File Header & Table of Contents

```css
/*
 * <preset-name>.css
 * <Preset Display Name> — <one-line style summary>
 *
 * Design principles:
 *   <3-5 bullet points describing the visual language>
 *
 * Color palette:
 *   <token-name>  <hex>   <role>
 *   ... (list all tokens from Step G2)
 *
 * ─────────────────────────────────────────────────────────────
 * Table of Contents
 *
 * §0  CSS Variables & Base Reset
 * §1  Card Shell (.<prefix>-card)
 *     §1.1  Cover type (.<prefix>-cover)
 *     §1.2  Content type (.<prefix>-content)
 * §2  Content Components
 *     §2.1  Page header (.<prefix>-header)
 *     §2.2  Section label (.<prefix>-section-label)
 *     §2.3  Data cards (.<prefix>-data-card)
 *     §2.4  List / ranking rows (.<prefix>-list-row)
 *     §2.5  Divider (.<prefix>-divider)
 *     §2.6  Footer / note (.<prefix>-note)
 * §3  Utility Classes (<prefix>-*)
 *     §3.1  Tags & badges
 *     §3.2  Text colors
 *     §3.3  Background fills
 *     §3.4  Inline highlights
 * §4  Layout Helpers
 * ─────────────────────────────────────────────────────────────
 */
```

## §0 — CSS Variables & Base Reset (mandatory)

```css
:root {
  --<prefix>-bg:        <bg-primary>;
  --<prefix>-surface:   <bg-surface>;
  /* ... all tokens ... */
}

*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; padding: 0; }

html, body {
  width: 540px;
  height: 720px;
  overflow: hidden;
}

body {
  font-family: var(--<prefix>-font-body);
  background: var(--<prefix>-bg);
  color: var(--<prefix>-text-primary);
}
```

> **Non-negotiable**: `html, body { width:540px; height:720px; overflow:hidden; }` must appear verbatim. Never set `font-size` on `html`.

## §1 — Card Shell

Provide exactly two shell variants per card type:

- `.<prefix>-card` — Base 540×720 shell with `position:relative; overflow:hidden`
- `.<prefix>-cover` — Variant for the first/cover card (may use a bold hero background)
- `.<prefix>-content` — Variant for inner content cards (typically cleaner, more structured)

## §2 — Content Components

For each component, write a self-contained block. **Minimum required components:**

| Component | Purpose | Notes |
|---|---|---|
| `.<prefix>-header` | Top header bar or top section container | Fixed height recommended (48–64px) |
| `.<prefix>-section-label` | Small section divider / label row | Use accent color; small caps or uppercase |
| `.<prefix>-data-card` | Metric / stat card | Show a `.label`, `.value` (large), `.unit` |
| `.<prefix>-list-row` | Ranking or bulleted list row | Include a modifier for "highlight" / "top1" |
| `.<prefix>-divider` | Horizontal rule | Thin line, uses border or accent color |
| `.<prefix>-note` | Bottom caption / footer bar | Fixed to card bottom, 48–56px tall |

**Additional components** to include when relevant to the content domain (infer from Step G1):

- `.<prefix>-compare-grid` — two-column product/option comparison (product reviews)
- `.<prefix>-timeline-row` — chronological event row (history, roadmap topics)
- `.<prefix>-quote-block` — styled pull quote (lifestyle, thought-leadership)
- `.<prefix>-tag-row` — horizontal keyword chip row (all domains)
- `.<prefix>-progress-bar` — labelled progress/ratio bar (data-heavy topics)

## §3 — Utility Classes

Always provide these utility groups, even if minimal:

```css
/* Tags & badges */
.<prefix>-badge { ... }            /* Default accent badge */
.<prefix>-badge-muted { ... }      /* Subdued grey badge */

/* Text colors */
.<prefix>-text-accent { color: var(--<prefix>-accent); }
.<prefix>-text-muted  { color: var(--<prefix>-text-muted); }
.<prefix>-text-positive { color: var(--<prefix>-positive); }
.<prefix>-text-negative { color: var(--<prefix>-negative); }

/* Background fills */
.<prefix>-bg-accent { background: var(--<prefix>-accent); }
.<prefix>-bg-surface { background: var(--<prefix>-surface); }

/* Inline text highlights (underline wash style) */
.<prefix>-hl { background: linear-gradient(180deg, transparent 55%, <accent-alpha> 55%); }
```

## §4 — Layout Helpers

```css
/* Flex helpers */
.<prefix>-row    { display: flex; align-items: center; }
.<prefix>-col    { display: flex; flex-direction: column; }
.<prefix>-spacer { flex: 1; }
.<prefix>-center { display: flex; align-items: center; justify-content: center; }

/* Gap helpers */
.<prefix>-gap-xs { gap: 6px; }
.<prefix>-gap-sm { gap: 12px; }
.<prefix>-gap-md { gap: 20px; }
.<prefix>-gap-lg { gap: 32px; }
```

## Class Naming Rules

- All class names must share the same prefix and must not collide with Tailwind (`tw-` is safe; avoid single-word names like `.card`, `.header`).
- Use the 2–4 letter prefix derived in Step G2 consistently throughout.
