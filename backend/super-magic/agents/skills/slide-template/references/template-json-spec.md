# Slide Template `template.json` Specification

`template.json` 是模板源码目录内的唯一元数据入口。机器校验使用同目录下的 `template-json.schema.json`。

本规范只描述新版 HTML slide template project。旧的单文件 `preview.html`、`template-pages.*`、`source.css`、嵌套 `packages/` 和写入源码目录的 `previews/` 都属于历史格式，不再作为新模板输出。

## 1. 文件位置

```text
<template-dir>/
├── template.json
├── magic.project.js        # optional PPTX conversion draft helper only
├── visual-spec.md
├── theme.css
├── images/
└── slides/
    ├── cover.html
    └── ...
```

模板源码目录只保存可复用源文件。预览图、截图缓存、发布图片和打包产物不得放入模板源码目录。

PPTX 转换草稿目录可以包含 `magic.project.js`，用于 slide 预览或编辑。它不是模板元数据，不写入 `template.json.files`；最终 ZIP 不包含该文件。

打包 ZIP 与模板目录平级：

```text
<template-id>-template.zip
```

发布和预览产物可以输出到独立 artifact 目录：

```text
artifacts/<template-id>/
├── template.zip
├── home.png
├── thumbnail.png
├── collage.png
├── manifest.json
└── previews/
    └── slides/
        ├── cover.png
        └── ...
```

## 2. 顶层结构

```json
{
  "schema_version": "1.0",
  "template_id": "PPT-ink-classic",
  "label": {
    "zh_CN": "洇墨纸张风",
    "en_US": "Ink Classic"
  },
  "description": {
    "zh_CN": "适合学术报告、生态研究、政策分析、智库、科学传播和人文研究的纸张质感模板。",
    "en_US": "An ink-on-paper slide template for academic reports, ecological research, policy analysis, think tank briefs, science communication, and humanities research."
  },
  "files": {
    "theme_css": "theme.css",
    "slides_dir": "slides",
    "images_dir": "images",
    "package_zip": "../PPT-ink-classic-template.zip"
  },
  "slides": [
    {
      "file": "slides/cover.html",
      "title": "Forest Ecosystem Carbon Cycle",
      "layout": "cover",
      "description": "Opening cover with a full-bleed local visual, ink overlay, report title, subtitle, and author metadata."
    }
  ],
  "source": {
    "kind": "original",
    "file": "",
    "canvas": {
      "width": 1920,
      "height": 1080
    }
  },
  "warnings": []
}
```

必填字段：

- `schema_version`：固定为 `"1.0"`。
- `template_id`：模板 ID，必须匹配 `^PPT-[a-z0-9]+(?:-[a-z0-9]+)*$`。
- `label.zh_CN`、`label.en_US`：中英文展示名称。
- `description.zh_CN`、`description.en_US`：中英文模板描述。
- `files`：模板设计说明、CSS、页面目录和本地资源目录。
- `slides`：可复用页面列表，也是默认播放顺序。
- `source`：来源类型、来源文件和画布尺寸。
- `warnings`：转换或生成过程中的非致命问题。

可选字段：

- `category_code`：模板分类。可以由平台侧或发布流程维护；如果写入模板，必须匹配 `^PPT-CATE-[a-z0-9]+(?:-[a-z0-9]+)*$`，并来自平台分类表。
- `files.visual_spec`：模板视觉规范文件路径。PPTX 转换草稿可以暂时不写；最终发布前应由大模型根据转换后的页面风格分析生成 `visual-spec.md` 后再补入。

禁止写入：

- `template_dir`：由模板源码目录路径推导。
- `package_type`：由发布流程或 `files.slides_dir` 推导。
- `name`：展示名称使用 `label`。
- `taxonomy`、`review_status`、`copyright_notice`。
- `slides[].slots`、`slides[].source_slide`、`slides[].best_for`、`slides[].risks`。

## 3. `files`

```json
{
  "theme_css": "theme.css",
  "slides_dir": "slides",
  "images_dir": "images",
  "package_zip": "../PPT-ink-classic-template.zip"
}
```

约束：

- `theme_css` 是模板共享视觉系统。
- `slides_dir` 存放可复用页面模板，每页必须能加载 `../theme.css`。
- `images_dir` 存放本地化资源。
- `visual_spec` 可选。最终模板发布前应指向由大模型风格分析生成的 `visual-spec.md`。
- `package_zip` 可选，只描述推荐打包输出位置。
- 封面图、缩略图、拼接图等预览图不写入 `template.json.files`。
- `magic.project.js` 不写入 `template.json.files`。它只允许作为 PPTX 转换草稿辅助文件，最终 ZIP 必须排除。

## 4. `slides`

```json
[
  {
    "file": "slides/cover.html",
    "title": "Forest Ecosystem Carbon Cycle",
    "layout": "cover",
    "description": "Opening cover with a full-bleed local visual, ink overlay, report title, subtitle, and author metadata."
  }
]
```

约束：

- `file` 是模板目录内相对路径，格式为 `slides/<layout>.html`。
- `title` 使用英文，描述默认页面内容。
- `layout` 使用短横线命名，例如 `agenda-segments`、`kpi-chart-dashboard`。
- `description` 使用英文，说明该页面展示的结构和组件。
- `slides` 数组顺序表示默认播放顺序，不依赖文件名数字排序。
- 每个 slide 文件必须采用不同布局或组件组合，不能复制同一结构后只改标题。
- `slides` 必须以模板目录中当前存在的页面文件为准。用户修改模板草稿后，若某个页面文件被删除、改名或移动，必须同步更新 `template.json.slides`；已不存在的页面引用必须自动移除。
- 打包、发布或继续编辑前，必须重新读取 `slides/` 目录和 `template.json.slides`，以用户最后修改后的文件状态为准。不要因为旧元数据还保留引用而恢复用户删除的页面。

HTML 中可以保留少量 `data-slot`、`data-slot-type`、`data-slot-role` 作为大模型编辑提示。它们不进入 `template.json` 元数据契约。生成新 PPT 时，应根据 HTML 的真实结构、样式和内容判断如何替换或改写，而不是依赖 `template.json.slots`。

## 5. `source`

```json
{
  "kind": "converted",
  "file": "brand-template.pptx",
  "canvas": {
    "width": 1920,
    "height": 1080
  }
}
```

约束：

- `kind` 只能是 `original`、`converted` 或 `derived`。
- `file` 记录来源文件名或空字符串。
- `canvas.width` 固定为 `1920`。
- `canvas.height` 固定为 `1080`。

## 6. 分类

分类可以不写入模板，由平台侧或发布流程维护。若写入 `category_code`，必须来自平台分类表。当前可用分类包括：

- `PPT-CATE-business-report`
- `PPT-CATE-startup-pitch`
- `PPT-CATE-product-growth`
- `PPT-CATE-sales-marketing`
- `PPT-CATE-education-training`
- `PPT-CATE-academic-research`
- `PPT-CATE-technology-engineering`
- `PPT-CATE-government-organization`
- `PPT-CATE-healthcare`
- `PPT-CATE-culture-creative`

## 7. 页面和资源要求

- 默认生成 9 个独立 slide 文件，必要时才扩展。
- 每页固定 1920x1080，并加载 `../theme.css`。
- 默认可见内容使用英文。
- 页面布局写在当前 slide 的 `<style>` 中，`theme.css` 只放模板级视觉系统。
- 页面必须使用原生 1920x1080 布局，不保留 `legacy-frame`、`legacy-stage`、`legacy-panel`、`composite-frame`、`preview-header`、`slides-grid` 或 `scale(3/5.3/6)` 缩略图放大结构。
- 每页需要明确视觉锚点，例如图表、KPI、矩阵、图片区、色块、时间线或模板特色装饰。
- 引用图片时只引用本地 `../images/...`。
- 需要插图、照片、头像、Logo 或场景图的页面，必须把必要资源落到本地 `images/` 并在 HTML/CSS 中引用。
- 不能保留空图片区、占位图 URL、占位文案或仅用于示意的灰框。
- 不使用远程字体、远程图片或无关脚本。复杂图表页可以引入 ECharts CDN，但只用于图表渲染。
- 制作过程中必须做轻量溢出检查，确认 `documentElement.scrollWidth/scrollHeight` 不超过 1920x1080，关键元素没有超出画布，文本没有明显被裁剪。
