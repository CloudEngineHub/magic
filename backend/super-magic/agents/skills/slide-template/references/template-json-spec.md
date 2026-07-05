# Slide Template `template.json` Specification

`template.json` 是每个独立幻灯片模板目录的统一元数据文件。它同时服务三件事：

1. 给后台创建接口提供可直接提交的 `backend_payload`。
2. 给生成流程记录来源、文件、页面、质量和授权信息。
3. 给后续生成 PPT 时提供页面选择和 `data-slot` 替换依据。

机器校验可使用同目录下的 `template-json.schema.json`。

## 1. 文件位置

每个模板目录必须包含一个 `template.json`：

```text
<output-root>/<template-dir>/template.json
```

PPTX 转换生成的 ZIP 必须与模板目录平级：

```text
<output-root>/<template-dir>/
<output-root>/<template-id>-template.zip
```

## 2. 顶层结构

```json
{
  "schema_version": "1.0.0",
  "template_id": "business-minimal-finance-qbr-blue-001",
  "template_dir": "business-minimal-finance-qbr-blue-001",
  "package_type": "html_slide_template_project",
  "backend_payload": {},
  "files": {},
  "slides": [],
  "taxonomy": {},
  "generation": {},
  "quality": {},
  "license": {}
}
```

`package_type` 可用值：

- `html_slide_template_project`：推荐结构，目录可直接作为 PPT 项目预览。
- `html_slide_template`：兼容旧的简单模板结构。

## 3. `backend_payload`

`backend_payload` 必须与当前 `magic_slides_templates` 创建/更新接口对齐。

```json
{
  "label": {
    "zh_CN": "金融季度经营复盘",
    "en_US": "Finance Quarterly Business Review"
  },
  "description": {
    "zh_CN": "适用于金融行业季度经营分析、指标复盘、渠道表现和下季度计划汇报。",
    "en_US": "For finance quarterly business reviews, KPI analysis, channel performance, and next-quarter planning."
  },
  "thumbnail_file_key": "",
  "collage_file_key": "",
  "template_file_key": "",
  "preview_url": "",
  "status": 0,
  "sort": 0
}
```

约束：

- `label.zh_CN`、`label.en_US` 必填，单项最多 100 字符。
- `description.zh_CN`、`description.en_US` 必填，单项最多 1000 字符。
- `thumbnail_file_key`、`template_file_key` 在上传后回填。
- `collage_file_key`、`preview_url` 可为空。
- `status` 使用后台状态：`0` 不可用，`1` 可用。自动生成后建议先写 `0`。
- 后台创建后返回的 `code`、`id` 等发布结果不写入 `backend_payload`。

## 4. `files`

推荐的类 PPT 项目结构：

```json
{
  "entry_html": "index.html",
  "project_config": "magic.project.js",
  "theme_css": "theme.css",
  "slides_dir": "slides",
  "images_dir": "images",
  "package_zip": "../business-minimal-finance-qbr-blue-001-template.zip"
}
```

约束：

- `entry_html` 是预览入口，通常为 `index.html`。
- `project_config` 是 `magic.project.js`，格式与普通 slide project 保持一致。
- `theme_css` 是所有模板页共享样式。
- `slides_dir` 存放可复用页面模板，每页必须能加载 `../theme.css`。
- `images_dir` 存放本地化资源；模板页不得引用远程或原始临时路径。
- `package_zip` 必须指向模板目录的平级 ZIP，通常为 `../<template-id>-template.zip`。

## 5. `slides`

`slides` 是页面选择和替换的唯一机器入口，不再生成 `template-pages.md` 或 `template-pages.json`。

```json
[
  {
    "file": "slides/slide-001.html",
    "title": "季度经营复盘",
    "layout": "cover",
    "source_slide": 1,
    "slots": [
      {
        "name": "title",
        "type": "text",
        "role": "title",
        "sample": "季度经营复盘"
      },
      {
        "name": "hero_image",
        "type": "image",
        "role": "heroImage",
        "sample": ""
      }
    ],
    "best_for": "封面、章节开场、主题页",
    "risks": []
  }
]
```

约束：

- `file` 必须是模板目录内相对路径。
- `source_slide` 使用原始 PPTX 页码，从 1 开始。
- `slots` 必须对应页面 HTML 中的 `data-slot`、`data-slot-type`、`data-slot-role`。
- 生成新 PPT 时只替换 slot 内容，不重写页面结构。

## 6. `taxonomy`

```json
{
  "industries": ["finance"],
  "scenes": ["quarterly-business-review"],
  "styles": ["business", "minimal"],
  "layout_pack": ["cover", "content", "chart"],
  "languages": ["zh_CN", "en_US"],
  "keywords": ["季度复盘", "经营分析"]
}
```

英文字段值使用小写 kebab-case；中文关键词只放在 `keywords`。

## 7. `generation`

```json
{
  "batch_id": "2026-07-05-daily-001",
  "method": "pptx_to_slide_template_project",
  "source_kind": "pptx_import",
  "model": "deterministic",
  "created_at": "2026-07-05T12:00:00+08:00",
  "inspiration_urls": [],
  "source_files": ["brand-template.pptx"],
  "source_canvas": {
    "width": 1280,
    "height": 720
  }
}
```

`source_kind` 建议枚举：

- `original`：自研原创。
- `licensed`：已获得可再分发授权。
- `cc`：Creative Commons 或其他开源授权。
- `research_only`：仅竞品研究，不允许发布。
- `pptx_import`：从用户或授权 PPTX 转换。

## 8. `quality`

```json
{
  "review_status": "pending_review",
  "score": 0,
  "similarity_score": null,
  "checks": {
    "html_valid": true,
    "preview_rendered": true,
    "text_overflow": false,
    "asset_localized": true,
    "zip_created": true,
    "backend_payload_ready": false
  },
  "notes": []
}
```

`review_status` 建议枚举：

- `draft`
- `pending_review`
- `approved`
- `rejected`
- `needs_fix`
- `published`
- `disabled`

## 9. `license`

```json
{
  "status": "unknown",
  "copyright_risk": "medium",
  "requires_attribution": false,
  "attribution_text": "",
  "third_party_assets": true,
  "asset_sources": []
}
```

版权风险高或 `status` 为 `unknown`、`research_only` 的模板不得自动发布。
