---
name: slide-template
description: "Use when the user asks to create slides with a specific style, wants to see available PPT templates before creating, describes a custom template style, or wants to extract a template from an existing PPT project."
---

# Slide Template Manager

Use this skill to choose a built-in slide template,create a custom template from a style description,or extract one from an existing PPT project.

## Templates

| dir | name | visual cue | trigger keywords |
| --- | --- | --- | --- |
| `business-minimal` | Corporate Whitepaper | white + McKinsey-style deep blue (#1A56DB); dark cover/section pages; SWOT, KPI dashboard, waterfall chart layouts; strict whitespace; no decoration | business report,quarterly review,annual report,strategy deck,investor pitch,proposal,roadshow,financial analysis,corporate |
| `tech-dark` | Midnight Code Lab | near-black deep navy (#070B14) + electric cyan (#00E5FF); glassmorphism cards; scan-line texture; code demo and architecture diagram layouts; gradient glow titles | tech talk,AI/ML product,engineering architecture,code demo,product launch,developer keynote,system design |
| `creative-flat` | Neon Geometry | flame orange (#FF4D1C) + creative purple (#6C27D9); zero shadows; hard-edged flat; diagonal color-block cuts; offset-shadow cards; dot-matrix texture | creative campaign,brand identity,advertising,design showcase,bold visual,new media,mood board |
| `academic-research` | Academic Blueprint | white + deep navy (#0F2444) + teal (#1A8A7A); Noto Serif SC titles; numbered sections, citation cards, experiment comparison tables; rigorous academic structure | thesis defense,academic paper,research presentation,conference paper,dissertation,SOTA comparison,methodology |
| `gradient-fashion` | Glass Candy | deep purple to matte gold gradient (#4A00E0→#E8C96A); glassmorphism with top-edge highlight; nebula purple dark cover (#0D0825); large radii (16–24px); feature cards with gradient top lines | internet product,app launch,consumer SaaS,fashion brand,youth lifestyle,gradient style |
| `aicon-tech-blue` | Orbit Tech Blue | white + professional blue (#2F80ED) + rotating dashed rings; dual conference logo areas; speaker introduction and code/architecture layout | AI conference,tech summit,engineering talk,speaker introduction,technical forum |
| `gotc-open-orange` | Open Source Triangle | white + open-source orange (#FF9933); left triangle accent bar (GOTC signature); code blocks and terminal components; dual conference logos | open source,developer community,GitHub,OSS conference,programming talk,developer event,GitHub |
| `charity-dark-green` | Deep Sea Green | abyss ink (#010B14) + jade green (#2DD4A0) to dark jade cyan (#0EA5C9); multi-level glassmorphism; gold accent (#D4AF6A) for high-value numbers; restrained premium dark | charity,NGO,public welfare,social impact,environmental,sustainability,impact report,NGO |
| `neo-brutalism-bold` | Neo-Brutalism Bold | gray-white (#F4F4F0) + pure black borders (4–8px) + flame red (#D92D20); offset solid shadows; ultra-heavy 900-weight titles; editorial collage rotations | internal training,startup pitch,founder deck,bold brand strategy,neo-brutalism,edgy design |
| `museum-art-edu` | Museum Academy | warm ivory beige (#FAF8F5) + ink black + academy red (#C0392B); Noto Serif SC titles; light/dark page rhythm; museum label aesthetic; low-radius academic feel | art course,humanities,art appreciation,museum,cultural education,liberal arts,art history,classic literature |
| `edu-activity-orange` | Vibrant Classroom | white content pages + dark navy cover; vivid orange (#F97316) sole accent; left-border principle cards; SBI framework cards; activity overview grids; dark goal boxes | classroom activity,workshop,team training,experiential learning,course design,interactive teaching,activity guide |
| `ink-classic` | Ink on Paper | ink black (#0A0A0B) + paper white (#F1EFEA); Playfair Display + IBM Plex Mono labels; zero rounded corners/shadows; WebGL noise texture; mandatory photo cover | academic research,ecology,policy report,think tank,science communication,high-quality report,humanities |
| `monocle-editorial` | Editorial Redline | pure white + charcoal (#1A1A1A) + editorial red (#C8102E); Cormorant Garamond + DM Sans + DM Mono; magazine column grid system; masthead top bar | global affairs,cultural media,city report,editorial,journalism,brand magazine,Monocle style |
| `blueprint` | Engineer's Blueprint | off-white (#FAF8F5) + engineering blue (#2563EB); background grid lines simulate drafting paper; technical connector lines; flowchart and architecture diagram layouts | architecture design,engineering doc,system design,infrastructure,data analysis,technical review,blueprint |
| `notion` | Clean Dashboard | Notion light gray (#F7F7F5) + blue (#2383E2) + white cards; product-grade SaaS UI; Inter font; status tags, progress bars, property rows | SaaS product,B2B demo,dashboard,product roadmap,project overview,metrics,data board,SaaS,B2B |
| `hand-drawn-edu` | Macaron Doodle | warm cream (#F5F0E8) + macaron color blocks (sky blue/mint/lavender/peach); ZCOOL KuaiLe relaxed font; hand-drawn borders with wobble; cartoon doodle decorations | popular science,course tutorial,process explanation,educational explainer,friendly training,doodle style |
| `vector-illustration` | Retro Picture Book | cream beige (#F5F0E6) + unified 2–3px black outlines; retro palette (coral/mint/mustard/slate); Playfair Display serif; geometric simplified characters; panoramic narrative scenes | brand story,product intro,warm narrative,retro illustration,picture book,heritage brand |
| `chalkboard` | Chalkboard Lettering | blackboard black (#1A1A1A) or green (#1C2B1C) + chalk white/yellow/pink/blue; Caveat handwritten font; doodle arrows and circled annotations; teaching narrative layout | teaching,classroom explanation,knowledge sharing,lecture,tutorial,educational keynote |
| `scientific` | Lab Diagram | off-white (#FAFAFA) + color-coded pathways (teal/blue/purple); serif academic titles; annotation-driven; pathway/flow diagrams with arrows and labeled components | biology,chemistry,medicine,life sciences,pathway diagram,molecular biology,scientific explanation |
| `vintage` | Parchment Scroll | aged parchment (#F5E6D3) + deep brown + gold (#C9A227); Playfair Display + EB Garamond; antique map elements; compass ornaments; handwritten annotations | history,geography,cultural heritage,travel,museum,exploration,legacy brand,classical |
| `watercolor` | Coral Watercolor | warm white (#FAF8F0) + coral (#F4A261) + sage green (#87A96B); Dancing Script handwritten font; watercolor wash textures; organic shapes; natural element decorations | lifestyle,health,wellness,food,travel,personal brand,artisan,watercolor |
| `intuition-machine` | Cream Infographic | aged cream (#F5F0E6) + teal (#2F7373) + maroon (#7A2F37); bilingual labels (English term + Chinese); black outlines; technical print aesthetic; information-dense split layouts | concept breakdown,infographic,bilingual presentation,deep explanation,knowledge explainer,technical education |
| `fantasy-animation` | Ghibli Fairy Tale | soft sky blue (#E8F4FC) + deep forest green (#2D5A3D) + gold (#F4D03F); Ghibli/Disney narrative; character-driven layouts; watercolor wash background; magical star and sparkle decorations | children,story,fantasy,animation,fairy tale,kids education,storybook,imagination |
| `dark-atmospheric` | Dark Neon Glow | void black (#060610) + deep purple (#9D6FFF) + ice cyan (#22D3EE); cinematic spotlight gradients; 5-layer background depth; dramatic focal design; restrained lower-saturation neon | music event,entertainment,concert,gaming,premium product launch,brand reveal,nightlife,film |

## Decision

- Explicit template name/dir/alias:use it directly.
- User describes concrete visual style(colors, materials, layout, decorative elements, visual keywords):generate a custom template first,then use it.
- User only describes scenario/topic/audience without enough visual specs:recommend 3-5 built-in templates with `ask_user`.
- `ask_user` options must include name+short description+dir,and include "no template/default style".
- If the user asks to see templates,show suitable options and mention previews at `<skill_dir>/assets/templates/<dir>/preview.html` (see Built-In Template Workflow for `<skill_dir>`).
- Editing/fixing/refactoring existing slides does not trigger template selection unless the user asks for a new PPT/project.

## Built-In Template Workflow

Do not resolve this skill's bundled templates under `.magic/skills/slide-template/`. After `read_skills(skill_names=["slide-template"])`, read the absolute skill root from the `<skill_dir>` tag (or parent of `<location>`). In examples below, `<skill_dir>` is that directory. Use `read_files` and `cp` sources only as fully qualified paths: `<skill_dir>/` plus the relative paths listed in this skill.

1.Load selected spec and preview gallery:

```
read_files(files=[
  {"file_path":"<skill_dir>/assets/templates/<dir>/visual-spec.md"},
  {"file_path":"<skill_dir>/assets/templates/<dir>/preview.html"}
])
```

2.Treat `preview.html` as the template example gallery. Before writing slides, inspect its Color Palette/Color System, Layout Page Types, and Core/Extended Components sections. Extract concrete page structures, component patterns, color-role usage, spacing rhythm, and visual anchors. For each slide, choose the closest preview layout or component pattern and adapt it to the user's content.

3.Do not copy preview wrapper styles such as `preview-header`, `slides-grid`, `slide-wrap`, or tiny thumbnail sizing into final slide pages. Do not link `preview.html` from generated slides. The preview demonstrates composition and proportions; final slides must still be fixed 1920x1080 pages using local `theme.css`, template CSS variables/classes, and the Google Fonts link from `visual-spec.md`.

4.Authority order: `theme.css` owns final CSS variables, fonts, decorations, components, layout helpers, and fixed canvas reset. `visual-spec.md` owns design rules, typography, Google Fonts link, layout types, ECharts rules, and image style guidance. `preview.html` demonstrates how to apply them. If `preview.html` conflicts with `theme.css` or `visual-spec.md`, follow `theme.css`/`visual-spec.md` and use preview only as composition guidance.

5.Before creating slide pages, summarize the template internally: palette roles, layout inventory from `.slide-label`, component inventory from Core/Extended Components, composition rules such as header/footer, grid columns, visual anchors, and the adaptation rule for replacing demo content while preserving structure, color roles, and rhythm.

6.Create project with `create_slide_project`,then copy CSS to project root before creating slide pages (use absolute source path):

```
shell_exec(command="cp <skill_dir>/assets/templates/<dir>/theme.css <project>/theme.css")
```

7.Each slide HTML must include local CSS and the Google Fonts `<link>` declared in `visual-spec.md`:

```html
<link rel="stylesheet" href="theme.css" />
```

8.Load `creating-slides` and generate slides. Keep every slide fixed at 1920x1080; do not use responsive design. Use only template CSS variables,components,dedicated layout types,ECharts rules,and image guidance from `visual-spec.md`/`theme.css`. Prefer a matching dedicated layout from `visual-spec.md` or `preview.html`; if none fits, compose the page from template components,decorations,and layout helpers instead of generic centered text. Each slide should have one clear visual anchor, such as an image area,chart,matrix,large number,color block,or template-specific decoration.

9.Never link to skill files or assets outside the PPT project. All images/assets used by slides must be inside the PPT project,usually under `images/`.

## Image Rules

- First decide whether the page needs images. Use images for visual layouts,cover/section/closing pages,specific person/product/scene/case,or sparse text.
- Skip image search for dense comparison,card grid,timeline/process,data dashboard,or chart pages.
- Prefer `image_search`. Try at least 2 content-relevant keyword groups and include template style keywords from `visual-spec.md`.
- If search results are poor,use `generate_images` and save output under the PPT project `images/` folder.
- Apply template style only to creative illustrations(concept visuals,atmosphere,decorative or abstract images). Do not stylize factual photos,real people,real places,products,history/science references,brand marks,screenshots,QR codes,or data graphics.
- Images should occupy meaningful visual space; do not use them as tiny icons.
- Images can be used as local section backgrounds with an overlay when they support the content and template style.
- If a slide skips images,use a non-image visual anchor instead of leaving sparse text floating in empty space.
- Do not repeat the same background-image treatment on most consecutive slides.

## Custom Template Workflow

Use when the user describes a style in text, provides screenshots, or gives an existing PPT project. Read `<skill_dir>/references/custom-template-workflow.md` and follow it before generating custom template files.

## Style Specificity & Template Scope

- `theme.css` must only contain template-specific styles: color variables, background decorations, typography, template components, and visual helpers. It must NOT contain structural layout properties (padding, flex, grid) on framework-level selectors like `.slide-container`.
- `.slide-container` in `theme.css` should only set: dimensions (`width`/`height`), `position`, `overflow`, `box-sizing`, and template-specific backgrounds/colors. Layout properties (`padding`, `margin`, `display: flex`, `flex-direction`) must be defined in each slide page's own `<style>` block.
- Page-level `<style>` in each slide HTML has higher specificity than `theme.css` by nature of source order (page styles load after `theme.css`). If needed, use more specific selectors (e.g., `.slide-container.my-page`) to ensure page styles override template defaults.
- When writing slide pages, always define layout (padding, flex, grid) directly in the page `<style>` rather than relying on `theme.css`, to avoid cross-page style conflicts.

## Output

- Built-in/custom workflow output:a complete slide project generated through `creating-slides`.
- Custom template output must include `visual-spec.md`,`theme.css`,`preview.html`.
- Do not paste raw HTML in chat.
