# Slide Template `template.json` Specification

`template.json` 是模板目录内的轻量索引文件，只保留后续选择页面、替换 slot、定位文件所需的信息。机器校验可使用同目录下的 `template-json.schema.json`。

## 1. 文件位置

```text
<output-root>/<template-dir>/template.json
<output-root>/<template-id>-template.zip
```

ZIP 必须与模板目录平级。
`previews/` 不属于模板源码目录，也不能进入 ZIP。预览图由脚本从 `slides/*.html` 渲染生成，路径记录在发布产物的 `manifest.json` 或 `publish.json` 中。

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
- `files`：模板入口、资源目录和 ZIP 路径。
- `slides`：可复用页面列表，也是后续生成 PPT 的主要机器入口。
- `source`：来源文件和源画布信息。
- `warnings`：转换或预览图生成过程中的非致命问题。

## 3. `files`

```json
{
  "visual_spec": "visual-spec.md",
  "theme_css": "theme.css",
  "slides_dir": "slides",
  "images_dir": "images",
  "package_zip": "../business-minimal-finance-qbr-blue-001-template.zip"
}
```

约束：

- `visual_spec` 是模板设计说明，通常为 `visual-spec.md`。
- `theme_css` 是所有模板页共享样式。
- `slides_dir` 存放可复用页面模板，每页必须能加载 `../theme.css`。
- `images_dir` 存放本地化资源。
- `package_zip` 指向模板目录的平级 ZIP。
- 封面图、拼接图等预览图不写入模板包内 `template.json.files`。生成脚本应把它们写到 artifact，并由 artifact manifest 或发布状态记录路径。

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
