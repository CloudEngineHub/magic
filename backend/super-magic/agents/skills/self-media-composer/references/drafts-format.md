# Drafts And Templates File Format

The frontend self-media planning panel stores work-in-progress files inside the self-media project under `__drafts/`. These files let the AI resume planning, inspect uploaded references, and continue creation without re-asking resolved questions.

---

## Directory Structure

```text
<self-media-folder>/
└── __drafts/
    ├── draft.json
    ├── draft.md
    ├── reference-index.json
    ├── brand-images/
    │   ├── mascot.png
    │   └── style-guide.pdf
    ├── draft-materials/
    │   ├── 0/
    │   │   ├── article-chart.png
    │   │   └── outline-proof.pdf
    │   └── 1/
    │       └── reference.docx
    ├── archive/
    │   └── arc-abc123/
    │       ├── manifest.json
    │       ├── draft.json
    │       ├── draft.md
    │       ├── reference-index.json
    │       └── draft-materials/
    │           └── 0/
    │               └── article-chart.png
    ├── templates/
    │   ├── tpl-abc123.json
    │   └── tpl-abc123.md
    └── templates-materials/
        └── tpl-abc123/
            └── 0/
                └── hero.jpg
```

`draft.json` is the active slot. `archive/` contains historical snapshots created when generation starts. `templates/` is for reusable patterns and must not be confused with archive snapshots.

---

## `draft.json` Schema

```jsonc
{
  "version": 1,
  "currentStep": 3, // Current frontend step index
  "createdAt": "2026-05-19T10:30:00Z",
  "updatedAt": "2026-05-19T11:15:00Z",
  "global": {
    "author": "Magic Lab",
    "brandPosition": "AI productivity tutorials",
    "targetAudience": "Young professionals",
    "brandImages": [
      {
        "id": "brand-1",
        "name": "mascot.png",
        "description": "Brand mascot reference",
        "relativePath": "self-media/__drafts/brand-images/mascot.png",
        "isImage": true
      }
    ]
  },
  "articles": [
    {
      "title": "AI accounting app comparison",
      "folderName": "ai-bill",
      "style": "tutorial",
      "visualPreset": "code-dispatch",
      "cardCount": 6,
      "outline": [
        {
          "id": "node-1",
          "text": "Why AI accounting matters",
          "materials": [
            {
              "id": "outline-mat-1",
              "name": "outline-proof.pdf",
              "description": "Source for the intro node",
              "relativePath": "self-media/__drafts/draft-materials/0/outline-proof.pdf"
            }
          ],
          "children": []
        }
      ],
      "materials": [
        {
          "id": "article-mat-1",
          "name": "article-chart.png",
          "description": "Main comparison chart",
          "relativePath": "self-media/__drafts/draft-materials/0/article-chart.png"
        }
      ],
      "notes": "Close with a follow CTA",
      "platform": "rednote",
      "description": "A comparison-style Rednote post",
      "visualReferenceFiles": [
        {
          "name": "visual-guide.pdf",
          "content": "optional inline fallback content",
          "kind": "text",
          "file_id": "file-123",
          "file_path": "shared/visual-guide.pdf"
        }
      ]
    }
  ]
}
```

### Field notes

- `global.brandImages` are brand or IP assets. They influence generated visuals and should be read before image generation.
- `articles[].materials` are article-level references.
- `articles[].outline[].materials` are node-scoped references and should influence only the matching outline node unless the content clearly applies more broadly.
- `articles[].visualReferenceFiles` are visual-style references. They may come from:
  - an existing project file via `file_path` / `file_id`
  - inline `content` with `kind: "text"` or `kind: "data-url"`
- `platform` is stored per article. Do not expect `global.platforms`.

---

## `reference-index.json` Schema

`reference-index.json` is the unified reference entry point. It does not replace the semantic fields in `draft.json`; it mirrors them in one place so the AI can read all references first, then group them by role.

```jsonc
{
  "version": 1,
  "createdAt": "2026-05-19T10:30:00Z",
  "updatedAt": "2026-05-19T11:15:00Z",
  "items": [
    {
      "id": "brand-1",
      "role": "brand",
      "name": "mascot.png",
      "description": "Brand mascot reference",
      "relativePath": "self-media/__drafts/brand-images/mascot.png",
      "kind": "file"
    },
    {
      "id": "article-mat-1",
      "role": "article-material",
      "articleIndex": 0,
      "name": "article-chart.png",
      "description": "Main comparison chart",
      "relativePath": "self-media/__drafts/draft-materials/0/article-chart.png",
      "kind": "file"
    },
    {
      "id": "outline-mat-1",
      "role": "outline-material",
      "articleIndex": 0,
      "outlineNodeId": "node-1",
      "name": "outline-proof.pdf",
      "description": "Source for the intro node",
      "relativePath": "self-media/__drafts/draft-materials/0/outline-proof.pdf",
      "kind": "file"
    },
    {
      "id": "visual-0-0",
      "role": "visual-reference",
      "articleIndex": 0,
      "name": "visual-guide.pdf",
      "kind": "text",
      "file_id": "file-123",
      "file_path": "shared/visual-guide.pdf",
      "content": "optional inline fallback content"
    }
  ]
}
```

### Reading priority

For each reference item, resolve content in this order:

1. `relativePath`
2. `file_path` / `file_id`
3. inline `content`

Never silently skip a reference because the preferred source is unavailable. If one source fails, fall back to the next available source and state any remaining limitation.

---

## `archive/<archiveId>/manifest.json` Schema

```jsonc
{
  "version": 1,
  "archiveId": "arc-abc123",
  "createdAt": "2026-05-19T11:20:00Z",
  "currentStep": 3,
  "articleCount": 2,
  "titles": ["Post A", "Post B"]
}
```

Archive snapshots contain a frozen copy of the active planning state at generation start. Use them for recovery, audit, or historical review. Do not treat them as the active draft slot.

---

## `template.json` Schema

Same as `draft.json`, but uses `id` and `name` instead of `currentStep`:

```jsonc
{
  "version": 1,
  "id": "tpl-abc123",
  "name": "Tech review template",
  "createdAt": "2026-05-18T09:00:00Z",
  "updatedAt": "2026-05-18T09:00:00Z",
  "global": { /* same structure as draft */ },
  "articles": [ /* same structure as draft */ ]
}
```

---

## `draft.md`

`draft.md` is a human-readable mirror. It is helpful for quick scanning, but `draft.json` and `reference-index.json` are the source of truth.

Do not rely on `draft.md` alone for detailed reference resolution.

---

## Visual Preset Values

The `visualPreset` field maps directly to the presets in this skill's `presets/` directory:

| Value | Platform | Meaning |
| --- | --- | --- |
| `neo-brutalism` | rednote | Built-in preset |
| `code-dispatch` | rednote | Built-in preset |
| `dark-tech` | rednote | Built-in preset |
| `ins-modern` | instagram | Built-in preset |
| `custom:{description}` | any | Triggers the `generate-preset` sub-skill |
| `none` | any | No preset; design freely |
| empty / undefined | any | Frontend has not resolved the preset yet |

---

## Content Style Values

| Value | Meaning |
| --- | --- |
| `professional` | Authoritative, data-driven |
| `casual` | Conversational, friendly |
| `storytelling` | Narrative-driven |
| `tutorial` | Step-by-step instructional |
| `emotional` | Emotion-first, relatable |
| `custom` | User-provided free text |

---

## How The AI Should Use These Files

### Reading an active draft

1. Read `__drafts/draft.json`.
2. If present, read `__drafts/reference-index.json`.
3. Read and understand all referenced files before drafting or designing content.
4. Group the references by role:
   - `brand`
   - `article-material`
   - `outline-material`
   - `visual-reference`
5. Apply them at the correct scope.

### Reading an archive snapshot

If the user asks to restore, inspect, or compare a previous planning state:

1. Read `__drafts/archive/<archiveId>/manifest.json`
2. Read the matching `draft.json`
3. Read the matching `reference-index.json`

### Important rule

All uploaded references must be read and understood before content creation starts, regardless of where the user attached them in the frontend.

---

## Path Rules

1. `relativePath` values are project-root-relative and may already include the self-media folder prefix, for example `self-media/__drafts/draft-materials/0/chart.png`.
2. `__drafts/` lives inside the self-media folder, which itself is a subdirectory of the project root.
3. `draft-materials/` is planning-time storage. Final generated post assets usually live under `posts/<post-id>/assets/` or `posts/<post-id>/materials/`.
4. When authoring card or article HTML, convert any draft-stage path to the correct runtime-relative asset path, or copy the asset into the post-local asset directory first.
