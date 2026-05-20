# Common Failure Modes

Violations are listed in approximate order of severity.

- **Writing `magic.project.js` with `write_file`**: forbidden. Always go through `create_self_media_project`; edit only the inner `posts` array via `edit_file`.
- **Using absolute or project-root-relative paths in `post.json.cards`**: forbidden. Paths must be relative to the post folder.
- **Prefixing card filenames with sequence numbers**: forbidden. Order is derived from `post.json.cards`, not filenames.
- **Skipping the preset question in Step 4.1**: forbidden for all platforms. Must be explicit even for WeChat (offer "No template" while noting presets are coming soon).
- **Hotlinking remote images inside card HTML**: forbidden. Download to `assets/` or generate locally.
- **Linking preset CSS/JS from anywhere outside `shared/presets/<preset>/`**: forbidden. Always copy the bundle into the project first, then reference it with `../../shared/presets/<preset>/...` from within each card.
- **Reading preset source files from the wrong path**: forbidden. Source files live under `presets/<platform>/<preset>/` inside this skill folder — always include the platform subfolder when loading sources (e.g. `presets/rednote/neo-brutalism/neo-brutalism.css`).
- **Overriding the root `font-size` on `<html>` or `<body>`**: forbidden. Tailwind utilities are calibrated against the default 16px root; re-scaling breaks preset typography.
- **Collecting or generating images before the preset is chosen (Step 4.1)** for card-based platforms: forbidden. Images must serve the visual language, not the other way around.
- **Filling both `cards` and `article` in a `wechat-official-accounts` `post.json`**: forbidden. Only `article` / `heroCover` / `thumbnailCover` are read by the WeChat previewer; `cards` will be silently ignored.
- **Using fixed canvas dimensions in a WeChat article HTML**: forbidden. Article HTML is full-width and scrollable — no fixed canvas.
- **Placing post assets under `shared/` when only one post uses them**: avoid. Keep `shared/` for true cross-post assets and preset bundles.
