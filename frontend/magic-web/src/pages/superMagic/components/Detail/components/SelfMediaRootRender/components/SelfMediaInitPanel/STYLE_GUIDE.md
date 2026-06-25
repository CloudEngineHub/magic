# Self Media Init Panel Style Guide

This guide defines the local visual language for `SelfMediaInitPanel`.
It is intentionally scoped to this module.

## Visual Direction

- Use a clean white workbench as the base.
- Use black for structure and primary text.
- Use orange-yellow (`primary`) as a focused accent, not as a full-page wash.
- Keep the mood hand-drawn and editorial, but avoid heavy neo-brutalist frames.

## Layout Rules

- Prefer open spacing, section dividers, left accent bars, and flat color blocks.
- Avoid wrapping every section in rounded cards.
- Avoid global grid backgrounds. Grid texture belongs only in the hero/illustration area.
- Use top-to-bottom hierarchy before side-by-side density.
- Put the most important action or summary first; secondary settings should sit below.

## Borders And Shapes

- Avoid `rounded-xl`, `rounded-2xl`, thick `border-2`, and hard shadows for layout containers.
- Use `border-b`, `border-t`, `border-l-2`, or `border-l-4` for structure.
- Keep rounded shapes only when they communicate a control affordance, like small dots or native checkboxes.
- For popovers and floating menus, a thin border and shadow are allowed for layering.

## Buttons

- Primary actions use solid black or `primary` flat backgrounds.
- Secondary actions use light zinc blocks without heavy borders.
- Avoid hard offset shadows and translate hover effects.
- Use `active:scale-[0.98]` for tactile feedback when needed.

## Forms

- Prefer underline-style inputs:
    - `border-0 border-b border-zinc-200`
    - `bg-zinc-50/40`
    - focused state: `focus:border-zinc-950 focus:bg-primary/[0.03]`
- Highlight the active field label rather than adding heavier input frames.
- Active labels should use black text with a subtle `primary/20` background.

## Illustration And Texture

- Use one meaningful illustration per step title area when possible.
- Brand form fields use dedicated field illustrations (`field-*.png`) via `SketchFieldIllustration`.
- Step titles use `title-*.png` via `SketchTitleIllustration`; do not reuse title art for form rows.
- Do not repeat the same illustration as both foreground and background decoration.
- Grid texture is allowed only inside hero/title areas and should remain very subtle.

## Common Tailwind Patterns

```tsx
// Open section
<div className="space-y-5 border-t border-dashed border-zinc-950/10 pt-5" />

// Accent header
<span className="bg-primary/20 px-2 py-0.5 text-[10px] font-black text-zinc-950" />

// Underline input
<input className="w-full border-0 border-b border-zinc-200 bg-zinc-50/40 px-4 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground/40 focus:border-zinc-950 focus:bg-primary/[0.03]" />

// Solid primary button
<button className="bg-zinc-950 px-5 py-2.5 text-xs font-black text-white transition-all hover:bg-zinc-900 active:scale-[0.98]" />
```
