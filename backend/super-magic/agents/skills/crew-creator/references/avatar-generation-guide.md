# 数字员工 Logo 生成规范

本文件用于指导创建数字员工时，根据 `IDENTITY.md` 和 `SOUL.md` 自动生成默认 Logo。Logo 是数字员工的持久化 `icon`，不是仅供界面临时显示的占位图。

## 基本要求

| 项目 | 要求 |
|------|------|
| 格式 | PNG，必要时可使用 JPG |
| 生成尺寸 | `1024x1024` |
| 展示尺寸 | 正方形，市场通常缩放为 `512x512` |
| 风格 | 统一漫画或插画风格，专业、自然、易识别 |
| 内容 | 必须符合员工角色定位，不包含违规、敏感或难以辨识的内容 |
| 文字 | 默认不在图像中生成文字，避免小尺寸展示时出现乱码 |

## Prompt 输入来源

Logo prompt 必须基于当前员工文件生成，不得只使用通用头像模板：

1. 读取 `IDENTITY.md` 的 YAML frontmatter，提取 `name`、`role`、`description`。
2. 读取 `IDENTITY.md` 正文，提取角色身份、专业能力、目标用户和典型工作场景。
3. 读取 `SOUL.md`（如果存在），提取核心性格、审美偏好、沟通方式和行为气质。
4. 将专业能力转换为少量视觉符号，将性格和审美转换为表情、构图、配色和光影。
5. 不要从名称臆测敏感的人物属性；名称只能用于确定视觉主题和识别度。

## Prompt 结构

按以下顺序组装，具体内容必须来自员工文件：

```text
[统一风格前缀] + [角色身份] + [专业视觉元素] + [性格与气质] + [背景与配色] + [质量后缀]
```

推荐固定前缀：

```text
Professional cartoon-style illustration avatar, clean professional composition, warm lighting and soft shadows,
```

推荐固定后缀：

```text
Square 1:1 composition, bust shot or symbolic emblem, centered subject, clean simple background, no text, no watermark, high quality, professional, natural.
```

如果 `SOUL.md` 缺失，只使用 `IDENTITY.md` 的内容生成；如果身份信息也不完整，先使用已有字段，不要捏造具体人物背景。

## 生成与保存

1. 使用 `generate_images` 工具生成 1 张图片，`size` 必须为 `1024x1024`。
2. 将图片保存到当前员工工作区的 `avatars/agent-logo.png`；如果工具不支持直接指定该路径，生成后移动或重命名到该路径。
3. 确认图片存在、可读取、为正方形，并检查文件大小不超过 `500KB`；无法压缩到限制内时优先转换为质量合适的 JPG，并保持正方形。
4. 生成失败时不得伪造成功结果。保留员工创建流程，记录失败原因，并继续执行 name/role/description 同步。
5. 已经存在用户提供的 Logo 或 Agent 已有图片 icon 时，不覆盖现有图片。

## Agent 同步载荷

生成文件必须先通过当前 Agent 工作区的文件同步/上传机制获得 magic-service 可识别的 `file_key`。然后操作 Agent 更新工具，将员工元数据和 Logo 一次性提交：

```json
{
  "code": "<agent_code>",
  "name_i18n": {"default": "<name>"},
  "role_i18n": {"default": "<role>"},
  "description_i18n": {"default": "<description>"},
  "icon": {"type": "image", "url": "<logo_file_key>"},
  "icon_type": 2
}
```

语言字段应沿用 `IDENTITY.md` 的实际语言；不要为了同步而额外生成翻译字段。`icon.url` 必须是上传后 magic-service 可读取的对象存储 `file_key`，不能是本地路径或图片二进制内容。Logo 同步失败时可以只提交文本字段，不能阻断员工创建。

## 验收条件

- `avatars/agent-logo.png` 或等价 JPG 已生成，且为正方形。
- Agent 更新工具收到当前员工的 `code`、`name_i18n`、`role_i18n` 和 `description_i18n`。
- Logo 成功上传时，更新载荷包含 `icon` 和 `icon_type: 2`。
- Logo 生成或上传失败时，文本元数据仍然同步，且向用户报告失败原因。
- 已有用户 Logo 时，未被自动 Logo 覆盖。