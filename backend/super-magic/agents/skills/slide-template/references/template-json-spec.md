# Slide Template `template.json` Specification

`template.json` 是模板目录内的轻量索引文件，只保留后续选择页面、替换 slot、定位文件所需的信息。机器校验可使用同目录下的 `template-json.schema.json`。

## 1. 文件位置

```text
<output-root>/<template-dir>/template.json
<output-root>/<template-id>-template.zip
```

ZIP 必须与模板目录平级。

## 2. 顶层结构

```json
{
  "schema_version": "1.0.0",
  "template_id": "business-minimal-finance-qbr-blue-001",
  "name": "Finance QBR",
  "files": {},
  "slides": [],
  "source": {},
  "warnings": []
}
```

字段说明：

- `schema_version`：模板索引格式版本。
- `template_id`：模板目录名和包名基础 ID。
- `name`：展示名，PPTX 转换时默认使用源文件名。
- `files`：模板入口、资源目录、ZIP、预览图路径。
- `slides`：可复用页面列表，也是后续生成 PPT 的主要机器入口。
- `source`：来源文件和源画布信息。
- `warnings`：转换或预览图生成过程中的非致命问题。

## 3. `files`

```json
{
  "entry_html": "index.html",
  "project_config": "magic.project.js",
  "theme_css": "theme.css",
  "slides_dir": "slides",
  "images_dir": "images",
  "package_zip": "../business-minimal-finance-qbr-blue-001-template.zip",
  "thumbnail_image": "previews/cover.png",
  "collage_image": "previews/collage.png"
}
```

约束：

- `entry_html` 是预览入口，通常为 `index.html`。
- `project_config` 是 `magic.project.js`。
- `theme_css` 是所有模板页共享样式。
- `slides_dir` 存放可复用页面模板，每页必须能加载 `../theme.css`。
- `images_dir` 存放本地化资源。
- `package_zip` 指向模板目录的平级 ZIP。
- `thumbnail_image` 是封面图 PNG，通常为 `previews/cover.png`。
- `collage_image` 是最多 9 页的拼接预览 PNG，通常为 `previews/collage.png`。

## 4. `slides`

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
      }
    ],
    "best_for": "cover",
    "risks": []
  }
]
```

约束：

- `file` 必须是模板目录内相对路径。
- `source_slide` 使用原始 PPTX 页码，从 1 开始。
- `slots` 必须对应页面 HTML 中的 `data-slot`、`data-slot-type`、`data-slot-role`。
- 生成新 PPT 时只替换 slot 内容，不重写页面结构。

## 5. `source`

```json
{
  "kind": "pptx_import",
  "file": "brand-template.pptx",
  "canvas": {
    "width": 1920,
    "height": 1080
  }
}
```
