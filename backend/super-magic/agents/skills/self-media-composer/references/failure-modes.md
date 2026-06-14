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
- **Creating post content without reference engagement data**: forbidden. Every generated post needs `feedLikes`, `commentCount`, and 3-5 content-specific `comments`. Mark generated values as reference/display data, not real analytics.
- **Letting self-media ops files drift into random schemas**: forbidden. `ops/source.json`, `ops/metrics.json`, and `ops/comments.json` must follow `references/file-formats.md` exactly. Do not add arbitrary nested keys because a platform exposed a new counter.
- **Writing arbitrary `ops/metrics.json.metrics` keys**: forbidden. New writes may only use `reads`, `likes`, `saves`, `comments`, `shares`, `follows`, and `conversions`. Unknown platform-specific counters belong in `notes` or `ops/review.html` until the fixed contract is extended.
- **Writing arbitrary `ops/metrics.json.derivedMetrics` keys**: forbidden. New writes may only use `engagementRate`, `saveRate`, `shareRate`, `commentRate`, `followRate`, and `conversionRate`.
- **Writing `collects` in new ops sync output**: forbidden. `collects` is a legacy read-only alias for old files; new save/favorite/collect counts must be written as `saves`.
- **Inventing comment sentiment or intent labels**: forbidden. `comments[].sentiment` must be `positive`, `neutral`, `negative`, or `question`; `comments[].intent` must be one of `consult`, `buy`, `question`, `objection`, `praise`, `topic-suggestion`, `case-request`, `share-intent`, `save-intent`, or `other`.
- **Generating self-media ops data from AI Card**: forbidden. 发布入盘, post-publication review, article ops review, and ops file updates belong to this self-media/IP-operations workflow, not `ai-card-generator`.
- **Pretending reference engagement is real ops data**: forbidden. `post.json.meta.feedLikes`, `commentCount`, `comments`, `time`, and `interactionReference` are reference/display data. They must not be copied into `ops/metrics.json` or `ops/comments.json` as fetched real data unless clearly labeled with `source: "reference"` and never paired with `fetchStatus: "fetched"`.
- **Asking for brand basics before checking `__brand/brand-config.json`**: avoid. When author, brand position, target audience, voice, reusable proof points, or brand/IP assets are needed and `draft.json.global` is incomplete, first try `__brand/brand-config.json`. Current user instructions and explicit draft values still outrank this file.
- **Creating AI 通稿味 content**: forbidden. Load `references/human-writing-style.md` before drafting; remove macro openings, generic value words, mechanical three-part structure, vague authority, and slogan endings.
- **Adding 假人味 instead of real 作者声音**: forbidden. Do not invent first-person experience, fake customer proof, forced jokes, exaggerated emotion, or casual filler just to make copy sound human.
- **Creating a Rednote post with unstructured or weak tags**: forbidden for new posts. Use `meta.tags.core/mid/longtail/trend`, keep 5-8 total tags, and load `references/hashtag-library.md` before filling them.
- **Tag stuffing or traffic-bait tags**: forbidden. Do not exceed 10 Rednote tags, do not use unrelated hot tags, and do not repeat the full tag block on every card.
- **Publishing travel Rednote tags without a concrete place**: forbidden. Add a city, area, route, or attraction tag before creating or updating the post.
- **Filling both `cards` and `article` in a `wechat-official-accounts` `post.json`**: forbidden. Only `article` / `heroCover` / `thumbnailCover` are read by the WeChat previewer; `cards` will be silently ignored.
- **Using fixed canvas dimensions in a WeChat article HTML**: forbidden. Article HTML is full-width and scrollable — no fixed canvas.
- **Placing post assets under `shared/` when only one post uses them**: avoid. Keep `shared/` for true cross-post assets and preset bundles.
