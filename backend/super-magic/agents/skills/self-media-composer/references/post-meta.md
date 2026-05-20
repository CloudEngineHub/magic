# Post Meta Field Reference

`post.json.meta` is free-form but these keys have conventional meanings consumed by previewers:

| Key            | Type   | Platform          | Purpose                                                                                                                        |
| -------------- | ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `title`        | string | all               | Primary post title shown on card and feed.                                                                                     |
| `subtitle`     | string | all               | Optional secondary line.                                                                                                       |
| `tags`         | string | all               | Space-separated hashtag string, for example `"#AI #Billing"`.                                                                  |
| `author`       | string | all               | Author handle displayed in previews.                                                                                           |
| `feedTitle`    | string | all               | Title shown in a feed-style preview (can differ from `title`).                                                                 |
| `feedLikes`    | string | all               | Display string such as `"1.8w"` or `"12.3k"`; free text, not math.                                                            |
| `commentCount` | string | all               | Display count string, free text.                                                                                               |
| `comments`     | array  | rednote/instagram | Array of `{ name, text }` objects for mock comment lists.                                                                      |
| `time`         | string | wechat            | Relative time string shown in feed cover (e.g. `"4 minutes ago"`); falls back to "Just now" if omitted. |

Unknown keys are tolerated — previewers ignore what they do not recognize. Add domain-specific keys when the content demands it.
