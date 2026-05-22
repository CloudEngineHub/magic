# Tool Selection Decision Tree

Use this decision tree to pick the right tool or action at every step.

```
No magic.project.js in target folder?
├─ Yes -> create_self_media_project (choose platform first)
└─ No  -> continue

Preset not yet chosen for this post? (mandatory for ALL platforms)
└─ ask_user with platform-specific options
   ├─ rednote:   neo-brutalism / code-dispatch / dark-tech / Custom style / No template
   ├─ instagram: ins-modern / Custom style / No template
   └─ wechat:    Custom style / No template (presets coming soon)
      └─ If a preset is picked, read from presets/<platform>/<preset>/ and copy
         to shared/presets/<preset>/<preset>.{css,js} via read_files + write_file.

About to create a card-based post (rednote / instagram)?
└─ create_self_media_post (pass meta and planned cards[]; register_in_project=false
   if the frontend prompt says the post is already pre-registered; otherwise true)

About to create a wechat-official-accounts post?
└─ create_self_media_post (pass meta, article, hero_cover, thumbnail_cover;
   register_in_project=false if the frontend prompt says the post is already
   pre-registered; otherwise true)

Need images for the cards?
├─ Preset not yet chosen -> STOP. Run Step 4.1 first.
└─ Style resolved -> derive visual brief, then:
    ├─ Stylized visuals    -> generate_image with explicit style cues
    ├─ Real-world photos   -> image_search (batch) + visual_understanding to verify fit
    └─ Save to posts/<post-id>/assets/ (card-local) or shared/ (cross-post)

Need to write card HTML?
└─ write_file on posts/<post-id>/cards/<name>.html; link preset CSS/JS when applicable.

Need to write WeChat article HTML?
└─ write_file on posts/<post-id>/<article>.html; full-width document, no fixed canvas.

Need to tweak post meta or card order?
├─ Yes -> edit_file on posts/<id>/post.json
└─ No  -> continue

Need to rename/reorder the project-level posts index?
└─ edit_file on magic.project.js, keep the JSONP wrapper intact. Posts live under
   self-media.<platform>.posts.
   Do not edit magic.project.js when the frontend prompt says the batch already
   pre-registered its posts.
```
