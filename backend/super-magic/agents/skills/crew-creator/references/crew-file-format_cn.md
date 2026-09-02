# Crew Agent 文件格式规范（权威参考）

本文档定义每个自定义员工（Crew Agent）定义文件的格式、字段说明和示例。
编辑员工配置时，必须严格遵循这些格式规范。

---

## 1. IDENTITY.md — 身份定义（入口文件，必需）

YAML 头部承载 Agent 级元数据；正文定义角色描述。

### YAML 头部字段

| 字段 | 描述 | 映射到 |
|------|------|--------|
| `name` | 员工名称 | `AgentProfile.name` |
| `role` | 员工角色 | `AgentProfile.role` |
| `description` | 员工描述 | `AgentProfile.description` |

### AgentProfile 渲染规则

- 有角色时：`"Your name is {name}, you are a {role}. {description}"`
- 没有角色时：`"Your name is {name}. {description}"`

### 完整示例

```markdown
---
name: Research Assistant
role: Academic Researcher
description: A professional research assistant for academic work
---

You are a professional academic research assistant, skilled in
literature search, data analysis, and report writing.
You have a rigorous academic attitude and critical thinking ability.
```

### 编译目标

正文内容会注入编译后 `.agent` 文件的 `<identity>` 部分。

---

## 2. AGENTS.md — 工作流参考指南（权威规范）

定义该员工专属的标准操作流程（SOP）和规则。**不包含 YAML 头部**，内容为纯 Markdown。工作流必须明确每个步骤要做什么、输入是什么、输出是什么，以及需要调用哪个工具或 skill。

### 编写指南

- 先用简短段落说明工作流简介、目标、适用场景和整体流程。
- 使用按执行顺序排列的 SOP 步骤；每个步骤都必须说明要做什么、输入、输出和调用的工具或 skill。
- 明确输入来源和类型，包括用户文本、上传的图片、上传的文件、已有工作区文件以及上一步的输出。
- 明确输出类型和格式，例如 Markdown 文件、HTML 文件、结构化数据、执行指令或用户可直接查看的结果。
- 将工具或 skill 调用写在实际使用它的步骤中，不能只在文档末尾笼统列出。
- 包含 if/then/else 决策逻辑，说明缺少输入、格式不支持或工具执行失败时的处理方式。
- 为每个步骤定义可验证的完成条件，并明确规则和输出质量要求。

### 编译目标

内容会注入编译后 `.agent` 文件的 `<agents>` 部分。

---

## 3. SOUL.md — 个性、审美与行为指南（可选）

定义员工的个性、审美偏好和行为准则。**不包含 YAML 头部**，内容为纯 Markdown。

### 示例

```markdown
## Core Personality
- Rigorous: All conclusions must be data-backed
- Honest: Say "I'm not sure" when uncertain
- Concise: No filler, let data speak

## Communication Style
- Academic and professional, but accessible
- Proactively point out research limitations
```

### 编写指南

- 用 3-5 个关键词概括核心个性，并为每个关键词提供具体行为描述
- 明确员工的审美偏好，包括内容呈现、表达方式和创作风格
- 沟通风格必须可执行（使用“正式但易懂”，而不是“友好”）
- 清晰定义行为边界和禁区

### 编译目标

内容会注入编译后 `.agent` 文件的 `<soul>` 部分。

---

## 4. TOOLS.md — 工具配置（可选）

YAML 头部定义相对于模板基线新增的工具及排除项。`run_python_snippet`、`run_sdk_snippet` 和 `compact_chat_history` 由运行时管理，不得列入 `tools`。

### 示例

```markdown
---
tools:
  - web_search
  - read_webpages_as_markdown
  - visual_understanding
  - video_understanding
  - list_dir
  - file_search
  - read_files
  - grep_search
  - shell_exec
  - write_file
  - edit_file
  - edit_file_range
  - delete_files
---

## Tool Usage Preferences

- Prefer `run_python_snippet` for data processing
- Prefer `grep_search` over `file_search` for file searching
```

### 编译规则

- `crew.template.agent` 中的 `tools` → 内置工具基线
- YAML 中的 `tools` 列表 → 追加额外工具
- YAML 中的 `exclude_builtin_tools` 列表 → 从内置基线中移除指定工具
- 未提供 TOOLS.md → 使用 `crew.template.agent` 的默认工具集

### 注意事项

- 工具名称必须与项目中注册的名称完全一致
- 完整工具列表请参考 `available-tools` 参考文档

---

## 5. SKILLS.md — 技能配置（可选）

YAML 头部使用以下字段定义技能配置：

- `skills`：Crew 专属技能（覆盖模板中的 `crew_skills`），运行时从 `crews/{code}/skills/` 或已安装技能中搜索
- `system_skills`：追加到模板默认 `system_skills`（自动去重），运行时从 `agents/skills/` 中搜索
- `preload`：将指定技能的文件内容**直接嵌入系统提示词**；预加载的技能不会显示在可用技能列表中，模型可以直接使用，无需额外读取文件；此处列出的技能不需要再次声明到 `system_skills`/`skills` 中，因为 preload 会自动定位并加载
- `excluded_skills`：移除已加载的技能（适用于系统、Crew 和工作区来源）；`compact-chat-history` 始终挂载，不能排除

以上 4 个字段彼此独立，可以按需组合使用。

### 示例：仅使用 Crew 专属技能

```markdown
---
skills:
  - my-custom-skill
  - another-skill
---
```

### 示例：追加系统技能

```markdown
---
system_skills:
  - deep-research
  - creating-slides
---
```

### 示例：同时使用两个字段

```markdown
---
skills:
  - my-custom-skill
  - another-skill
system_skills:
  - deep-research
  - creating-slides
---
```

### 示例：使用 `preload` 字段（将技能内容直接嵌入系统提示词）

```markdown
---
skills:
  - my-custom-skill
system_skills:
  - deep-research
preload:
  - deep-research             # 简写：默认加载 SKILL.md
  - name: my-custom-skill
    files:
      - SKILL.md
      - QUICK-REF.md          # 加载额外的参考文件
---
```

### 示例：排除不需要的技能

```markdown
---
excluded_skills:
  - using-mcp      # 此 Crew 不需要 MCP 能力；从已加载的技能中移除
---
```

### 编译规则

- `skills` 列表 → 覆盖编译后 `.agent` frontmatter 中的 `crew_skills`；运行时从 `crews/{code}/skills/` 中搜索
- `system_skills` 列表 → 追加到模板默认 `system_skills`（自动去重）；运行时从 `agents/skills/` 中搜索
- `preload` 列表 → 追加到编译后 `.agent` frontmatter 的 `preload` 字段；运行时将文件内容直接嵌入系统提示词，并从可用技能列表中移除该技能；无需再次声明到 `system_skills`/`skills` 中
- `excluded_skills` 列表 → 覆盖 `excluded_skills`；适用于系统、Crew 和工作区来源；`compact-chat-history` 始终挂载，不受影响
- 未提供 SKILLS.md → 使用 `crew.template.agent` 的默认技能集，不预加载任何技能

---

## 6. skills/ — 自定义技能目录（可选）

复用现有的 SKILL.md 格式。每个技能都是一个独立目录，包含 SKILL.md 和可选的子目录。

```
skills/
└── my-skill/
    ├── SKILL.md          (必需)
    ├── references/       (可选，按需加载的参考文档)
    ├── scripts/          (可选，可执行脚本)
    └── assets/           (可选，模板、图标等资源)
```

SKILL.md 必须以 YAML frontmatter 开头：

```yaml
---
name: my-skill
description: "English description of what this skill does and when to trigger"
---
```

定义文件使用一种选定语言编写。不要创建翻译、特定语言的重复段落或用于翻译的 HTML 注释标记。

示例：

```markdown
## English

English content.

## Chinese

Chinese content.
```

---

## 8. 文件缺失时的行为

| 文件 | 缺失时的行为 |
|------|--------------|
| `IDENTITY.md` | **无效**：没有此文件，Crew Agent 不被视为有效 |
| `AGENTS.md` | 没有专属指令；等同于默认 magic.agent + 自定义身份 |
| `SOUL.md` | 没有额外个性；使用默认风格 |
| `TOOLS.md` | 使用默认工具集 |
| `SKILLS.md` | 使用默认技能集 |
| `skills/` | 没有自定义技能 |