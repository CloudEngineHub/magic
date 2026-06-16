# Post Meta Field Reference

`post.json.meta` is free-form but these keys have conventional meanings consumed by previewers:

All user-facing string values in `meta` must follow the parent Output Language Contract. Keep JSON keys and enum-like values stable; localize titles, subtitles, feed titles, comments, relative time strings, and display labels.

| Key            | Type   | Platform          | Purpose                                                                                                                        |
| -------------- | ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `title`        | string | all               | Primary post title shown on card and feed.                                                                                     |
| `subtitle`     | string | all               | Optional secondary line.                                                                                                       |
| `tags`         | object \| string \| string[] | all | Hashtags. For `rednote`, use the structured pyramid object below. Legacy space-separated strings or arrays are tolerated for backwards compatibility. |
| `author`       | string | all               | Author handle displayed in previews.                                                                                           |
| `feedTitle`    | string | all               | Title shown in a feed-style preview (can differ from `title`).                                                                 |
| `feedLikes`    | string | all               | Required for generated posts. Platform-style reference/display likes such as `"1.8w"` or `"12.3k"`; free text, not math.       |
| `commentCount` | string | all               | Required for generated posts. Reference/display comment count string aligned with the likely engagement level.                  |
| `comments`     | array  | all               | Required for generated posts. Array of 3-5 `{ name, text }` mock evaluation objects tied to the actual content. Rendered by Rednote/Instagram; stored as reference data for WeChat. |
| `time`         | string | wechat            | Relative time string shown in feed cover (e.g. `"4 minutes ago"`); falls back to "Just now" if omitted. |
| `interactionReference` | object | all       | Optional non-rendered rationale for generated engagement values. Mark values as reference/display data, not real analytics.     |

Unknown keys are tolerated — previewers ignore what they do not recognize. Add domain-specific keys when the content demands it.

## Structured Tags for Rednote

Use this shape for `rednote` posts:

```json
{
  "tags": {
    "core": ["workwear"],
    "mid": ["commute outfits", "petite styling"],
    "longtail": ["outfits for new office workers", "155cm styling tips"],
    "trend": ["dopamine dressing"]
  }
}
```

| Field | Type | Count | Meaning |
| --- | --- | --- | --- |
| `core` | string[] | 1-2 | Category anchors, such as `workwear`, `food`, or `skincare`. |
| `mid` | string[] | 2-3 | Search-intent tags, such as `commute outfits`, `quick recipes`, or `minimal skincare`. |
| `longtail` | string[] | 2-3 | Audience, pain-point, location, or use-case tags, such as `155cm styling tips`, `15-minute dinners`, or `Hangzhou travel guide`. |
| `trend` | string[] | 0-1 | Current trend or official activity tag. Omit when no relevant trend exists. |

Flattened render order: `core -> mid -> longtail -> trend`.

Total count: 5-8 tags. Hard cap: 10.

Compatibility rule: if an existing post uses `tags` as a string or `string[]`, preserve that format when only doing unrelated edits. When creating a new `rednote` post or optimizing tags, normalize into the structured object.

## Interaction Reference Rules

Generate engagement metadata together with the article/card content. Do not leave it for a later cleanup pass.

- Values must fit the platform, content, and output language: Rednote can use `"1.8w"`-style likes, Instagram can use `"12.3k"`, and WeChat can use localized display strings.
- Sample evaluations should reveal likely audience reactions, objections, use cases, or purchase/reading intent. Avoid empty compliments.
- If the user provides real metrics, use them and state that they came from user-provided data in `interactionReference.basis`.
- If no real metrics are provided, make `interactionReference.disclaimer` explicit: `"reference display data, not real platform analytics"`.
