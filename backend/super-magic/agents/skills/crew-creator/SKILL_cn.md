---
name: crew-creator
description: |
  管理和优化自定义 Agent 定义文件（IDENTITY.md、AGENTS.md、SOUL.md、TOOLS.md）。
  当 `.workspace/` 中没有 IDENTITY.md 时，也负责首次员工初始化。
  用户希望编辑 Agent 身份、修改工作流指令、调整个性、添加或删除工具、优化提示词，
  或从头初始化新员工时使用。
  触发信号：'modify prompt'、'change identity'、'add tool'、'remove tool'、'optimize workflow'、
  'adjust personality'、'initialize employee'、'修改提示词'、'改身份'、'加工具'、'去掉工具'、
  '优化能力'、'调性格'、'初始化员工'、'创建员工'。
  不适用于：技能创建（使用 skill-creator）、技能搜索（使用 find_skills 工具）。
---

# Agent 提示词管理器

管理 `.workspace/` 下员工的 4 个核心定义文件，帮助用户查看、编辑和优化员工的身份、指令、个性和工具配置。
当工作区没有定义文件时，也负责首次员工初始化。

## 语言生成策略

按以下顺序确定输出语言：

1. 如果用户在当前请求中明确指定输出语言，使用该语言。
2. 否则，在生成或编辑员工文件前运行语言辅助脚本：

```python
shell_exec(
    command="python '<skill_dir>/scripts/language.py'"
)
```

将 `<skill_dir>` 替换为当前技能的绝对目录。不要省略技能目录前缀，因为 Shell 的当前目录可能是 `.workspace` 或其他目录。

脚本读取 `.credentials/metadata.json`，返回类似 `{"language": "zh_CN", "language_name": "Chinese"}` 的 JSON。
如果元数据文件缺失、无效或没有可用的 `language` 值，默认使用 `zh_CN`。可以通过 `USER_AUTH_METADATA_PATH` 覆盖元数据路径，以便测试或运行时使用。

当用户未指定语言时，使用返回结果中的 `language_name` 作为编写提示词和员工文件的主要语言。系统注入的 `<user_preferred_language>` 不是该决策的依据。

**默认单语言模式**：所有内容都使用选定语言生成。YAML 头部只使用单语言字段。

始终生成单语言输出。不要询问、生成或维护翻译内容或特定语言的重复段落。

## 员工初始化流程

当 `.magic/IDENTITY.md` 不存在时，说明工作区尚未创建员工，此时应引导用户完成初始化。

### 检测

使用 `list_dir` 检查 `.magic/`。如果缺少 `IDENTITY.md`，进入初始化流程。

### 收集信息（以对话方式询问用户）

分轮收集信息；可以合并问题，但不要一次提出过多问题。

使用 `ask_user` 收集信息时，优先让用户点击选择，不能把所有问题都生成为自由文本输入框：

- 同一轮的问题尽量合并到一次 `ask_user` 调用中。
- 是/否决策使用 `confirm`，尤其是第四轮的技能拆分决策。
- 能给出 2-8 个合理候选答案时使用 `select`；允许多选时使用 `multi_select`。系统会自动提供“其他”输入入口，因此候选项不必穷举。
- `input` 仅用于员工名称或必须由用户精确填写的自定义值。不能因为问题要求“一句话描述”“详细描述”或“补充说明”，就直接使用 `input`。
- 员工角色使用 `select`；核心功能与特点、专业能力、专业领域/特长、工作风格、沟通风格使用 `multi_select`；工作流类型使用 `select` 或 `multi_select`。
- 上述选择题必须根据用户已提供的名称、角色和需求动态生成 3-6 个具体候选项。用户选择后，由 Agent 将选项内容归纳成一句话描述和完整角色定义，不再要求用户重新手写同一信息。
- 每个候选项都要包含简短说明，帮助用户理解区别；不要只提供抽象标签。

**收集前，先按上述优先级确定语言**。使用选定语言沟通并收集信息。

**第一轮（必填）**：
1. **员工名称**：使用 `input` 询问（例如对英语用户：“What name would you like to give your employee?”）
2. **员工角色**：根据员工名称生成 3-6 个角色候选项，使用 `select`。
3. **核心功能与特点**：根据员工名称和已选角色生成 3-6 个候选项，使用 `multi_select`。根据用户选择自动归纳为一句话描述，禁止再用 `input` 要求用户手写描述。

不要询问翻译，也不要提供多语言输出选项。

**第二轮（建议但可选）**：
4. **专业能力**：生成 3-6 个具体能力候选项，使用 `multi_select`。
5. **专业领域与特长**：生成 3-6 个具体候选项，使用 `multi_select`。
6. **工作风格**：生成 3-6 个具体候选项，使用 `multi_select`。将本轮选择自动整理为完整角色定义并写入 IDENTITY.md 正文，禁止再要求用户详细手写相同内容。
7. **工作流 / 规则**：优先提供可选的工作流类型和常见规则；只有用户选择“其他”或确实需要精确自定义时，才收集补充文本（写入 AGENTS.md）。

**第三轮（可选，用户可以跳过）**：
8. **个性与沟通风格**：生成 3-6 个候选项并使用 `multi_select`（例如严谨、活泼、简洁），写入 SOUL.md。

**第四轮（必须做出选择）**：
9. **技能拆分决策**：使用 `confirm` 明确询问用户是否要将独立流程拆分为不同的 skill。不能把用户沉默或“先这样”理解为同意或拒绝，也不能在用户明确回答前完成初始化。
10. 如果用户选择拆分，先展示拟拆分的 skill 边界，并为每个 skill 明确它将在 `AGENTS.md` 的哪个流程中调用或遵循什么调用规则；再加载 `skill-creator`，严格执行其规划、确认、冲突检查、创建和验证流程。每个独立流程单独执行一次。
11. 如果用户选择不拆分，在初始化摘要中记录该决定，并将完整工作流保留在 `AGENTS.md`。如果用户不确定，说明拆分与不拆分的取舍后再次询问，不能替用户默选。

如果用户表示想跳过可选信息（例如“稍后再说”“先这样”），可以继续收集；但第四轮的技能拆分决策不能跳过。

### 生成文件

收集信息后，写入 JSON 配置并调用初始化脚本：

**单语言模式（默认）**：

所有生成值均使用选定语言。不要添加 `_en`/`_cn` 翻译字段。

```python
# 使用选定语言写入已收集信息的 JSON 配置。
write_file(
    path=".crew_init_config.json",
    content='{"name": "Research Assistant", "role": "Academic Researcher", "description": "A professional research assistant", "role_body": "You are an academic researcher...", "instructions": "...", "personality": "..."}'
)

# 2. 调用初始化脚本
shell_exec(
    command="python '<skill_dir>/scripts/init_crew.py' --config .crew_init_config.json"
)
```

初始化脚本会依次检查当前目录、项目的 `.workspace` 目录和项目根目录中的相对配置路径，因此不需要把配置文件复制到技能目录。

脚本根据配置生成文件（TOOLS.md 和 SKILLS.md 有意不生成，系统使用默认值）：
- `IDENTITY.md`：始终生成（YAML 头部 + 角色定义正文）
- `AGENTS.md`：提供工作流指令时生成
- `SOUL.md`：提供个性时生成

### 初始化完成后

1. 写入前，读取 `references/crew-file-format_cn.md`（`AGENTS.md` 部分），并按其中的规范检查工作流：概述、有序 SOP 步骤、输入、输出、工具/技能调用、失败分支、完成标准均需具备。
2. 如果检查不通过，先修订工作流并重新检查，不能把普通清单直接写入 `AGENTS.md`；不得自行补充用户未指定的特殊规则。
3. 使用 `read_files` 向用户展示生成的文件。
4. 如果用户选择拆分 skill，先确认每个 skill 都已在 `AGENTS.md` 中声明调用流程或调用规则，再按 `skill-creator` 流程创建并验证所有独立 skill，最后报告初始化完成。
5. 询问用户是否需要调整。
6. 清理临时配置：`delete_files(path=".crew_init_config.json")`。
7. 告知用户：TOOLS.md 和 SKILLS.md 未生成（使用系统默认值）；之后可以通过员工管理功能添加。

## 文件职责映射

| 文件 | 维度 | 职责 | 必需 |
|------|------|------|------|
| `IDENTITY.md` | WHO — 身份 | 名称、角色、描述 + 角色定义正文 | **必需** |
| `AGENTS.md` | WHAT — 指令 | 工作流、规则、特殊指令 | 建议 |
| `SOUL.md` | HOW — 个性 | 核心个性、沟通风格、行为准则 | 可选 |
| `TOOLS.md` | WITH WHAT — 工具 | 工具白名单（YAML）+ 使用偏好 | 可选 |

## 编辑工作流

### 通用流程（适用于所有文件）

1. **读取当前内容**：使用 `read_files` 读取目标文件的现有内容
2. **加载质量指南**：读取参考文件 `references/prompt-engineering-guide.md`
3. **加载格式规范**：读取参考文件 `references/crew-file-format.md`
4. **写入或修改内容**：遵循格式规范和质量指南进行编辑
5. **展示质量评估**：展示修改后的内容，并提供质量评估摘要
6. **确认后写入**：用户确认后，使用 `write_file` 或 `edit_file` 保存

### 质量评估摘要格式

每次编辑后展示：

```text
## 质量评估

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 角色清晰度 | 通过 | ... |
| 指令具体性 | 通过 | ... |
| 语言一致性 | 通过 | 所有生成内容均使用选定语言。 |
| 格式合规性 | 通过 | ... |
| ... | ... | ... |
```

## 文件专属编辑指南

### IDENTITY.md — 身份定义

包含 YAML 头部（元数据）和正文（角色定义）。

**YAML 头部字段**：`name`、`role` 和 `description`，使用选定语言。不要添加带语言后缀的变体。

**正文**：直接使用选定语言编写。

**要点**：
- 角色定义必须具体；避免“你是一个 AI 助手”之类的笼统描述
- 定义专业领域、目标用户和使用场景

### SOUL.md — 个性与行为

纯 Markdown，不包含 YAML 头部。定义员工的个性和行为准则。

**要点**：核心特征使用 3-5 个关键词概括，并为每个关键词提供具体行为描述；沟通风格必须可执行；清晰定义行为边界和禁区。

### TOOLS.md — 工具管理

包含 YAML 头部（工具白名单）以及可选正文（工具使用偏好）。

**要点**：
- 工具只能从项目可用工具列表中选择；使用 `scripts/tools.py` 动态查询
- 根据员工职能推荐工具组合
- 特殊工具使用偏好写入正文

## 工具管理流程

当用户希望添加或删除工具时：

1. **查询可用工具**：使用脚本动态扫描（见“工具查询脚本”部分）
2. 读取当前 TOOLS.md 工具列表
3. 根据员工职能评估工具需求
4. 向用户展示工具变更对比
5. 用户确认后写入 TOOLS.md

## 工具查询脚本

使用 `scripts/tools.py` 动态扫描项目中注册的所有工具（数据源：`config/tool_definitions.json`）。

### 列出所有可用工具

```python
shell_exec(
    command="python scripts/tools.py list"
)
```

### 查看指定工具的详细信息（参数、描述）

```python
shell_exec(
    command="python scripts/tools.py detail web_search"
)
```

### 按关键词搜索工具

```python
shell_exec(
    command="python scripts/tools.py search image"
)
```

## 参考文档

包含详细指南的参考文档：

- **crew-file-format**：每种定义文件的完整格式规范和示例
- **prompt-engineering-guide**：提示词工程最佳实践（结构模板、质量检查清单、反模式检测）
- **available-tools**：按职能提供工具组合建议（备用参考；优先使用 `scripts/tools.py` 动态查询）
