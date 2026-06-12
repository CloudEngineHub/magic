# Tool Selection Decision Tree

Use this decision tree to pick the right tool or action at every step.

```
No magic.project.js in target folder?
├─ Yes -> create_self_media_project (choose platform first)
└─ No  -> continue

User asks for 发布入盘, post-publication review, article ops review, 复盘看板,
published-data fetch, or `ops/*` update for an existing post?
└─ Run the self-media/IP-operations data-sync workflow against the current
   posts/<post-id>/ folder. Read references/file-formats.md first and write only
   the fixed ops schema:
   ├─ ops/source.json.fetchStatus must be pending / fetched / failed.
   ├─ ops/metrics.json.metrics keys must be reads, likes, saves, comments,
      shares, follows, conversions.
   ├─ ops/metrics.json.derivedMetrics keys must be engagementRate, saveRate,
      shareRate, commentRate, followRate, conversionRate.
   ├─ ops/comments.json comments[].sentiment must be positive / neutral /
      negative / question.
   ├─ ops/comments.json comments[].intent must be consult / buy / question /
      objection / praise / topic-suggestion / case-request / share-intent /
      save-intent / other.
   ├─ Never write new arbitrary metric keys; unknown platform-specific counters
      go into notes or ops/review.html until the fixed schema is extended.
   ├─ Use saves for new save/collect values. Treat legacy collects as read-only
      historical input only.
   └─ Do not create AI Card artifacts for this request.

Preset not yet chosen for this post? (mandatory for ALL platforms)
└─ ask_user with platform-specific options
   ├─ rednote:   neo-brutalism / code-dispatch / dark-tech / Custom style / No template
   ├─ instagram: ins-modern / Custom style / No template
   └─ wechat:    Custom style / No template (presets coming soon)
      └─ If a preset is picked, read from presets/<platform>/<preset>/ and copy
         to shared/presets/<preset>/<preset>.{css,js} via read_files + write_file.

About to create a card-based post (rednote / instagram)?
└─ Generate complete meta first, including feedLikes, commentCount, 3-5 comments,
   and optional interactionReference. Then create_self_media_post (pass meta and
   planned cards[]; register_in_project=false if the frontend prompt says the
   post is already pre-registered; otherwise true)
   └─ If platform is rednote: load references/hashtag-library.md first, fill
      meta.tags as {core, mid, longtail, trend}, keep 5-8 total tags, hard cap
      10, and confirm auto-generated tags once when the user supplied none.

About to create a wechat-official-accounts post?
└─ Generate complete meta first, including feedLikes, commentCount, time, and
   3-5 comments as a reference evaluation pool, plus optional interactionReference.
   Then create_self_media_post (pass meta, article, hero_cover, thumbnail_cover;
   register_in_project=false if the frontend prompt says the post is already
   pre-registered; otherwise true)

Need images for the cards?
├─ Preset not yet chosen -> STOP. Run Step 4.1 first.
└─ Style resolved -> derive visual brief, then:
    ├─ Stylized visuals    -> generate_image with explicit style cues
    ├─ Real-world photos   -> image_search (batch) + visual_understanding to verify fit
    └─ Save to posts/<post-id>/assets/ (card-local) or shared/ (cross-post)

About to write card copy or WeChat article prose?
└─ Load references/human-writing-style.md, build the human-writing brief
   (author voice, target reader, reader action, evidence), then draft.

Need to write card HTML?
└─ write_file on posts/<post-id>/cards/<name>.html; link preset CSS/JS when applicable.

Need to write WeChat article HTML?
└─ write_file on posts/<post-id>/<article>.html; full-width document, no fixed canvas.

Need to tweak post meta or card order?
├─ Yes -> edit_file on posts/<id>/post.json
└─ No  -> continue

Finished writing final cards/article?
└─ Run the human-writing self-check from references/human-writing-style.md.
   Remove AI 通稿味 or 假人味, then re-check post.json.meta. If the final
   angle changed, update feedTitle, feedLikes, commentCount, comments,
   tags, and interactionReference to match.

Need to rename/reorder the project-level posts index?
└─ edit_file on magic.project.js, keep the JSONP wrapper intact. Posts live under
   self-media.<platform>.posts.
   Do not edit magic.project.js when the frontend prompt says the batch already
   pre-registered its posts.
```
