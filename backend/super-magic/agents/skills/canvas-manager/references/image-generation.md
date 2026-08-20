# Image generation

Load this reference for image generation, image revision, reference images, or image retry. It never widens the parent skill's retry limit or permits direct file operations.

## Workflow

1. Query the Canvas and any exact reference Elements.
2. Call `visual_understanding` first when you need to understand the subject, composition, dimensions, or what to preserve.
3. Confirm the creative direction when the direction is ambiguous.
4. New logical image → `add_canvas_elements`.
5. New candidate on an existing image → `add_canvas_contents`.
6. Failed and the user agrees → `retry_canvas_content_generation`.
7. The user confirms a candidate → `select_canvas_main_content`.

## Tool choice

- New logical image: `add_canvas_elements`, `element_type=image`, Content `source=generated`, `content_type=image`.
- New candidate on an existing image: `add_canvas_contents` — appends, never overwrites.
- In-place retry: `retry_canvas_content_generation` with the exact Element ID and failed Content ID.
- After the user confirms: `select_canvas_main_content`.

## Version rules

- Ordinary Content is never overwritten; create a new candidate for a revision.
- Retry only `failed` Content with explicit user consent.
- At most 2 retries per Content; never loop.
- Always show completed candidates and wait for the user to choose before selecting main.

## Writing a high-quality prompt

A prompt is a creative brief, not a keyword list. State what must stay fixed and what may change.

### Separate content from style

- **Content (what)** — the subject: shape, color, texture, quantity, identity. Must not drift.
- **Style (how)** — photography, background, lighting, color grade, mood. May change.

When the user says "redesign this in a dark moody style", they mean: keep the subject unchanged, change the presentation. Make that split explicit.

### Specificity over adjectives

Replace vague adjectives with what actually creates the effect:

| Vague term | Specific replacement |
|---|---|
| cinematic / film-like | 35mm anamorphic lens, film grain (Cinestill 800T), letterbox 2.39:1 crop, motivated practical lighting |
| vintage / retro | Kodak Portra 400 color science, faded highlights, lifted blacks, slight vignette, halation around highlights |
| professional photography | 85mm f/1.4, studio softbox at 45°, clean seamless backdrop, controlled catch-light |
| dramatic lighting | single hard key light at 90° to subject, deep shadow on opposite side, chiaroscuro contrast |
| moody / atmospheric | underexposed by 1 stop, cool blue shadow fill, haze or mist in background, low contrast colour grade |
| luxury / high-end | medium-format rendering, muted earth tones, razor-sharp product focus, generous negative space |
| minimal / clean | flat even lighting, white or off-white background, single subject, no decorative props |
| editorial | overhead 90° flat lay or eye-level straight-on, even diffused lighting, graphic colour block background |

### Technical language

Photography and cinematography vocabulary gives the model precise anchors for decisions it would otherwise default on. Use it when the output needs specific visual qualities, not as boilerplate.

Camera bodies encode color science (Fujifilm → warm, organic tones; GoPro → wide, immersive distortion). Lens specs control perspective and depth (85mm → compressed, flattering; wide-angle → environmental, expansive). Lighting setups encode mood (softbox → clean commercial; chiaroscuro → cinematic tension; golden hour → warmth, nostalgia). Color grade sets the emotional register.

Only include these when they are relevant to what the image needs to communicate.

### Sensory stacking

Pure visual description is often not enough — especially for food, beverages, textured materials, and any scene where tactile or atmospheric qualities are part of the appeal.

Image models have learned associations between visual cues and non-visual sensations. "Steam wisps slowly rising" produces a different image than "hot food"; "caramelised crust with visible cracks" produces a different image than "crispy".

When the visual alone cannot convey what makes the subject compelling, layer in non-visual sensory dimensions:

- Texture / tactile: "velvety matte finish", "coarse-grain leather with visible stitching".
- Motion / dynamic: "steam wisps slowly rising and dispersing", "fabric lifting at the edge in a gentle draft".
- Temperature / atmosphere: "warm condensation on the outside of a cold glass", "heat haze shimmering above the surface".
- Aroma as visual suggestion: "caramelised edges that imply burnt sugar".

Apply selectively — for food or beverages, textured materials, atmospheric scenes, or abstract concepts where multi-sensory language gives the model something concrete to visualize.

### Reference roles

Every reference carries subject, composition, palette, lighting, texture, and style. Assign each attribute explicitly: which reference it comes from, locked or free, and which part of the output it governs. Cite references by position — "the first image", "the second image" — since filenames are not visible.

### Positive framing, negative constraints

Describe what should be present. Use negative constraints only to block known failures that have no positive equivalent: "no text or watermarks", "the product shape and proportions must not be altered".

### Scene quick reference

| Scene | Technical anchors | Common negatives |
|---|---|---|
| Product / commercial | Medium-format rendering, studio softbox, seamless backdrop, macro surface detail | Product must not be distorted or redesigned; no text or watermarks |
| Portrait | 85mm f/1.4, shallow DOF, catch-light in eyes, skin-tone accuracy | Preserve facial features exactly; do not alter identity |
| Food / beverage | 45° overhead or 30° side angle, diffused side light, textured surface, steam or condensation details | No utensil clutter; no text |
| Cinematic / film | Anamorphic lens, film grain, letterbox crop, practical motivated lighting | — |
| Japanese / minimal | High-key exposure, wabi-sabi negative space, diffused natural light, desaturated warm tones | No neon colours; no artificial studio glow |
| Design / poster | Grid-based layout, flat graphic style, limited colour palette | Clear visual hierarchy; no decorative noise |
| Lifestyle / environmental | Wide-angle environmental framing, natural available light, subject in context | No artificial product distortion |
| Concept / atmospheric | Volumetric light, environmental haze, scale cues for depth, sensory stacking | — |

### From user intent to prompt

When the user asks for an image, you translate intent into a visual specification. This is a reasoning task, not template-filling.

**Step 1 — Identify what the user cares about.** Start from the failure conditions: a product shot fails if the product looks wrong, a mood illustration fails if the atmosphere is off, a portrait fails if the face drifts.

**Step 2 — Fill in the visual decisions the user left open.** The user said "a cat on a rooftop at sunset" but did not specify camera angle, lens, depth of field, palette, or the cat's pose. Make those decisions; do not leave them for the model to default on.

**Step 3 — Construct the prompt as a coherent scene description.** Write as if briefing someone who will create the image — clear prose or structured direction, not a comma-separated keyword dump.

Format: simple single-subject scenes with no strict preservation → connected prose. Complex scenes with several elements, strict preservation, or multiple references → structured groups with short labels:

```
Subject: [what must be preserved]
Lighting: [setup, direction, quality]
Background / environment: [what to change or keep]
Style: [colour grade, aesthetic reference]
Constraints: [what must not appear or change]
```

Use only the labels that carry real information; not every prompt needs all five.

### Handling user-provided prompts

**Vague idea** (e.g. "draw a cat at sunset"): this is an intent signal, not a finished prompt. Expand it into a complete visual specification, weaving the user's original phrasing in naturally so their core intent passes through.

**Detailed, crafted prompt**: respect their work. Use their prompt as the primary body and only append what the generation API needs but the prompt lacks (dimensions, technical specs, reference roles). Do not rewrite or "improve" their wording.

**Either way**, the user's own words — their specific nouns, adjectives, and descriptive phrases — must survive into the final prompt so their intent reaches the model unfiltered.

The prompt, `name`, and any new `project_path` follow the user's language.
