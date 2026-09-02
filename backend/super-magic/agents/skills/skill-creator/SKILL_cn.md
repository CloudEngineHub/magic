---
name: skill-creator
description: Create, modify, evaluate, package, and upload skills. Use when users want to create a skill from scratch, edit or optimize an existing skill, run evals to test a skill, benchmark skill performance, optimize a skill's description for better triggering accuracy, package a skill into a zip, or upload a skill to their skill library. Also use when user asks to "capture this workflow as a skill", "make a skill for X", "turn this into a reusable skill", "package this skill", or "upload to my skill library".
---

# Skill 创建器

帮助用户设计、构建、评估和持久化 Skill。你的核心工作不是“完成任务”，而是“教会 AI 如何处理一类任务”。

高级工作流：捕获意图 → 访谈 → 规划（写入 `<skill>_plan.md` 并在聊天中展示，等待确认）→ **检查冲突** → 编写 SKILL.md → 测试 → 迭代 → 优化 → 打包。
根据用户当前所处阶段直接开始处理。

---

## 语言感知

- 如果用户在当前请求中明确指定输出语言，使用该语言
- 否则，在生成或编辑技能内容前运行 `python '<skill_dir>/scripts/language.py'`，将 `<skill_dir>` 替换为当前技能的绝对目录，并使用返回的 `language_name`
- 使用选定语言生成技能内容（SKILL.md 正文、注释和示例）
- Skill 始终使用单语言内容。不要询问、生成或维护翻译内容或特定语言的重复段落
- `description` 保持英文（技能触发依赖英文语义）

当用户未明确指定语言时，在生成或编辑技能内容前运行语言辅助脚本：

```python
shell_exec(
  command="python '<skill_dir>/scripts/language.py'"
)
```

将 `<skill_dir>` 替换为当前技能的绝对目录。不要省略技能目录前缀，因为 Shell 的当前目录可能是 `.workspace` 或其他目录。脚本读取 `.credentials/metadata.json`；当元数据不可用或无效时回退到 `zh_CN`。

---

## SKILL.md 中的工具调用格式

SKILL.md 中的工具分为两类，格式不同：

1. **列在 `references/system-tools.md` 中的工具**：在 Python 代码片段中运行（通过 `run_sdk_snippet`），必须使用 Python 代码表示：

```python
from sdk.tool import tool

result = tool.call('tool_name', {
    "param1": "value1",
    "param2": "value2"
})

if result.ok and result.data:
    output = result.data['field_name']
```

2. **基础工具**（例如 `read_files`、`read_skills`、`shell_exec`、`run_python_snippet`）：直接调用，不需要包装在 Python 代码中：

```
read_files(files=[{"file_path": "path/to/file.md"}])
```

在技能中指定工具前，先读取参考文件 `references/system-tools.md`，了解完整的可用工具列表和使用示例。

常见工具类别速查（详细信息和示例请参阅 `references/system-tools.md`）：
- 网页搜索与抓取：`web_search`、`read_webpages_as_markdown`；外部文件下载使用 `download` 技能和 `run_sdk_snippet`
- 视觉：`visual_understanding`、`visual_understanding_webpage`、`video_understanding`
- 代码执行：`shell_exec`、`run_python_snippet`
- 图像生成与搜索：`generate_images`、`image_search`

---

## 完整技能创建工作流

### 阶段 1：捕获意图

了解用户想要什么。如果对话中已经包含工作流（例如“把这个变成一个技能”），从历史中提取：使用过的工具、步骤顺序、修正过程、输入输出格式。

然后确认：
1. 这个技能应让 AI 能够完成什么？
2. 什么时候触发？（用户会使用哪些短语或上下文）
3. **最终输出形式是什么？**（见下方“输出形式决策”，必须在此阶段决定）
4. 员工应在哪个工作流中调用此技能，或遵循什么调用规则？必须将该流程或规则写入员工的 `AGENTS.md`。
5. 是否需要设置测试用例？

在继续规划前，必须读取当前员工的 `AGENTS.md`。如果文件不存在，或没有明确说明此技能的调用流程、触发条件或适用场景，先暂停技能创建，补充这部分工作流并让用户确认；不能先创建 `SKILL.md` 再补写调用规则。

如果用户要创建的是知识库型 skill，或需求包含参考图、参考文件、模板资源、资料目录或知识索引，必须先读取 `references/knowledge-base-skill-guide_cn.md`，并将其中的目录、索引、资源加载和验证要求纳入后续流程。

### 输出形式决策（捕获意图阶段必需）

这是保证技能质量的关键。确定输出形式，并将其明确写入生成的 SKILL.md。

| 场景 | 推荐输出形式 |
|------|--------------|
| 多章节内容：行程、报告、分析 | 写入文件（Markdown / HTML） |
| 图表、可视化 | 写入 HTML 文件（ECharts） |
| 多个生成资源 | 将文件写入专用目录 |
| 简短回复、状态确认 | 直接在对话中输出 |
| 用户明确说“直接告诉我” | 直接在对话中输出 |

示例：“旅行规划技能”应明确生成并保存 HTML 行程报告，而不是把文本直接倾倒到聊天中。
在访谈期间询问并确认，然后在生成的 SKILL.md 中添加明确的“输出规范”章节。

```markdown
## 输出规范

此技能的最终输出是保存到 `.workspace/<project_name>/itinerary.html` 的 HTML 行程报告。
即使内容很短，也不要直接在对话中输出内容。
```

---

### 阶段 2：访谈与研究

主动询问边界情况、输入输出格式、示例文件、成功标准和依赖项。
对于知识库型 skill，还必须确认资源来源、文件类型、目录层级、索引字段、引用方式、更新方式，以及索引或资源缺失时的处理方式；未经用户确认，不得擅自复制或扩充知识库内容。
使用 `web_search` 和 `read_webpages_as_markdown` 研究最佳实践、API 文档和类似技能。
访谈完成后再编写测试用例。

**注意**：此环境没有浏览器，但可以使用 `web_search` 和 `read_webpages_as_markdown` 研究最佳实践、工具文档和类似技能的描述模式。

---

### 阶段 3：输出规划文档

访谈完成后，将规划写入 `<workspace-skills-dir>/<skill-name>_plan.md`（位于 `<workspace-skills-dir>/` 根目录，而不是技能子目录中；这样可以避免预先创建技能目录）。同时在聊天中展示规划供用户阅读。

规划文档包含：
- 技能范围和边界（能做什么、不能做什么）
- 工具列表及选择理由（包含代码格式示例）
- 员工 `AGENTS.md` 中的调用流程或调用规则，以及 skill 与该流程的对应关系
- 预期的 SKILL.md 结构大纲
- 是否需要 `scripts/`、`references/`、`assets/` 子目录
- 最终输出形式（来自阶段 1 的决策）
- 评估计划（测试提示词、预期输出）

如果是知识库型 skill，规划还必须说明资源目录、根索引、参考图和参考文件的组织方式，以及 SKILL.md 如何按需加载资源。

**等待用户确认后，才能进入阶段 4。**

---

### 阶段 4：检查冲突并写入文件

用户确认规划后，**先检查名称冲突**，再创建文件。

写入前再次确认员工的 `AGENTS.md` 已明确指定该技能在哪个流程中调用，或明确指定触发条件、适用场景和调用时机。该调用关系缺失或仍未获用户确认时，禁止写入任何技能文件。

如果是知识库型 skill，写入前必须按照 `references/knowledge-base-skill-guide_cn.md` 检查资源目录和索引设计。参考图、参考文件和索引必须位于该 Skill 的专用目录内，不能散落到目录之外，也不能把大段知识库内容直接内嵌到 `SKILL.md`。

**冲突检查**：查看系统提示词中已有的 `<available_skills>` 区块，确认是否存在同名技能。不需要调用工具或执行 Shell 命令。

**冲突规则**：
- 同名技能是内置技能（系统级，`can_override: false`）：**不能覆盖**。
  - 请用户选择**新名称**，重新确认后写入 `skills/<new-name>/`。
- 同名技能已经存在于 `<workspace-skills-dir>/<name>/`：询问用户确认。
  - 如果确认：先删除整个目录，然后从头重新创建（不要原地编辑）。
- 没有冲突：直接写入文件。

**编写 SKILL.md：**

SKILL.md **必须**以 YAML frontmatter 开头，否则打包校验器会拒绝该文件。

```markdown
---
name: skill_name
description: "One sentence on what this skill does. Use when [specific trigger conditions — what the user is trying to accomplish]. Also use when user says [example phrases like 'do X', 'help me with Y', 'turn this into Z']."
---

# Skill Name

...body content...
```

frontmatter 字段：
- **name**（必需）：只能包含小写字母、数字和下划线；不能为空；必须以字母开头；不能以下划线结尾；不能包含连续下划线（`__`）；长度为 2-64 个字符；必须与目录名称完全一致
- **description**（必需）：英文，最多 1024 个字符，不能包含尖括号 `<` `>`。
  必须包含两部分：
  1. **能力摘要**：此技能能做什么（一句话）
  2. **触发条件**：AI 什么时候应加载它（“Use when...”）以及用户示例短语（“Also use when user says...”）
  触发条件越具体，AI 越能准确判断何时加载此技能。没有触发指引的描述可能导致技能永远不加载，或在错误请求上触发。
- 其他常见可选字段：`license`、`allowed-tools`、`metadata`、`compatibility`；可以按需添加其他 YAML 字段

**注意**：打包校验只要求 frontmatter 中包含 `name` 和 `description`；没有固定的字段白名单。

**MCP 配置模板**：如果技能需要让其他用户注册同一个 MCP Server，可以在 SKILL.md 中包含 MCP 配置模板。敏感值使用环境变量占位符。不要在这里重复字段级规则或示例；请引用 `using-mcp` 技能中的支持字段、示例和工作流。

相对于 `.workspace/` 的目录结构（使用文件工具时，路径应为 `<workspace-skills-dir>/<skill-name>/...`）：

```
<workspace-skills-dir>/<skill-name>/
├── SKILL.md          (必需)
├── (此处不能有 plan.md — 规划文件位于 <workspace-skills-dir>/<skill-name>_plan.md)
├── evals/
│   └── evals.json    (测试用例)
├── scripts/          (可执行脚本，可选)
├── references/       (按需加载的参考文档，可选)
└── assets/           (模板、图标、字体等资源，可选)
```

**渐进式加载原则**：
1. 元数据（name + description）：始终在上下文中（约 100 个单词）
2. SKILL.md 正文：触发时加载（理想情况下少于 500 行）
3. 子目录资源：按需加载（没有大小限制）

保持 SKILL.md 简洁。将复杂内容移到 `references/`，并在正文中清晰指出何时读取这些文件。

**优先合并原则**：拆分前先检查：如果某个参考文件每次技能触发时都必须读取（例如角色定义、语气规则、核心示例），就将其合并到 SKILL.md 中。`references/` 目录只用于存放大多数请求不需要、可以按需查阅的内容。额外读取一个文件就会增加一次 LLM 请求；能合并时不要拆分。

**写入 skill_config.yaml：**

所有技能文件写入完成后，立即将 `<workspace-skills-dir>/skill_config.yaml` 写入（如果已存在则覆盖），内容使用 YAML。

只写入 `dir` 字段，此文件用于记录最近创建的技能目录：

```yaml
skill:
  dir: "my-skill"
```

---

### 阶段 5：测试

编写 2-3 个真实的测试提示词，即真实用户可能会说的话。先与用户分享。

将测试用例保存到 `.workspace/` 下的 `<workspace-skills-dir>/<skill-name>/evals/evals.json`：

```json
{
  "skill_name": "my-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "assertions": []
    }
  ]
}
```

**运行测试（使用 `using-llm` 模拟 with_skill / baseline）：**

此环境没有子 Agent。使用 `using-llm` 以编程方式调用 LLM：
1. 加载 `using-llm` 技能并读取 SKILL.md 内容
2. 对每个测试用例进行两次 LLM 调用：
   - **with_skill**：系统提示词包含完整的 SKILL.md 内容
   - **baseline**：系统提示词只有通用任务描述，不包含 SKILL.md
3. 将结果写入 `<workspace-skills-dir>/<skill-name>/evals/iteration-N/case-N-with_skill.json` 和 `case-N-baseline.json`
4. 根据断言为输出评分，并写入 `grading.json`

结果目录：`.workspace/` 下的 `<workspace-skills-dir>/<skill-name>/evals/iteration-N/`

**评分与聚合：**

```python
# <workspace-eval-path>：本次迭代评估目录在工作区中的绝对路径
#   例如：/app/.workspace/<workspace-skills-dir>/<skill-name>/evals/iteration-N
shell_exec(
    command='python scripts/aggregate_benchmark.py <workspace-eval-path> --skill-name <skill-name>'
)
```

**生成评估报告（无浏览器，输出静态 HTML）：**

此环境没有浏览器。使用 `--static` 模式输出独立 HTML 文件。

```python
# 所有路径均为工作区绝对路径
shell_exec(
    command='python eval-viewer/generate_review.py <workspace-eval-path> --skill-name <skill-name> --benchmark <workspace-eval-path>/benchmark.json --static <workspace-reports-path>/<skill-name>-eval-iteration-N.html'
)
```

生成后，告知用户报告路径，用户可以在前端文件管理器中打开。

---

### 阶段 6：迭代

根据用户反馈改进技能：
1. 修改 SKILL.md
2. 将新的测试结果放入 `iteration-N+1/` 目录
3. 重新生成报告，并通过 `--previous-workspace` 指向上一轮迭代

持续迭代，直到：用户满意、所有反馈为空，或没有有意义的改进空间。

**改进时请注意：**
- 从反馈中进行泛化，技能必须适用于未来一百万个类似提示词，而不只是当前测试用例
- 保持 SKILL.md 精简，删除不能发挥作用的内容
- 解释“为什么”，LLM 对带有理由的说明比僵化规则响应更好

---

### 阶段 7：描述优化

创建或改进技能后，主动提供优化 `description` 字段以提升触发准确率。

本项目使用 `using-llm` 技能进行描述评估：
1. 生成 20 个测试查询（混合应触发和不应触发的查询），让用户确认
2. 加载 `using-llm` 技能，使用 LLM 模拟“给定这个描述，AI 是否会加载此技能？”
3. 测试不同的描述版本，比较触发率
4. 使用表现最好的描述更新 SKILL.md frontmatter

详细流程参见 `references/system-tools.md`。

---

### 可选：安全审查

如果用户希望在打包或分享前验证新创建技能的安全性，例如确认其中没有危险模式，则加载 `skill-vetter` 进行审查：

```
read_skills(skill_names=["skill-vetter"])
```

---

### 阶段 8：询问是否打包和上传

技能完成并经用户确认后，始终询问：

> “你想将此技能打包并上传到技能库吗？还是只打包而不上传？”

**重要**：如果用户只要求“打包”“只打包”或“构建 .zip 文件”，但没有明确要求上传到技能库，**必须**使用仅打包命令（不要传入 `--upload`）。只有用户明确同意上传，或使用“打包并上传”“上传到我的技能库”等表述时，才使用 `--upload`。

`package_skill.py` 会在打包前自动运行 `quick_validate.py`。检查包括：
1. 目录名和 `name` 字段只能包含英文字母、数字和下划线，不允许连字符、中文、空格或其他特殊字符
2. `name` 字段必须与目录名完全一致

如果校验失败，修复问题后重试。

**仅打包（默认 CLI；用户只要求打包时使用）：**

```python
# <workspace-skill-path>：工作区技能目录下此技能的绝对路径
#   例如：/app/.workspace/<workspace-skills-dir>/<skill-name>
# 不指定 output_dir 时，默认输出到技能目录的上一级：<workspace-skills-dir>/<skill-name>-v1.0.0.zip
# 可以省略 --no-upload（与默认行为等价）
shell_exec(
    command='python scripts/package_skill.py <workspace-skill-path> --version 1.0.0'
)
```

**打包并上传到技能库（仅用户明确要求上传时使用；需要 `--upload`；会依次运行 `package_skill.py` 和 `upload_skill.py`）：**

```python
# 可选参数：--name-zh "中文名称" --name-en "英文名称"（会传递给 upload_skill.py）
shell_exec(
    command='python scripts/package_skill.py <workspace-skill-path> --version 1.0.0 --upload'
)
```

**先打包、后上传（分为两个独立步骤）：**先只执行打包；用户希望上传时，再使用生成的 `.zip` 文件路径调用 `upload_skill.py`。

```python
shell_exec(
    command='python scripts/upload_skill.py <absolute-path-to-.zip-file>'
)
```

可选：`python scripts/upload_skill.py <path> --name-zh "中文名称" --name-en "英文名称"`

- `--version` 为可选参数，但首次发布时建议指定
- `--name-zh` / `--name-en` 是上传时可选的国际化名称覆盖参数（用于 `--upload` 或单独运行 `upload_skill.py`）；如果不指定，则使用 SKILL.md frontmatter 中的名称
- 默认不要打包。不要跳过此步骤。

---

---

---

## 参考文件

- `references/system-tools.md` — 所有可用项目工具的详细描述和 Python 调用示例
- `references/schemas.md` — evals.json、grading.json 等文件的 JSON Schema
- `references/knowledge-base-skill-guide_cn.md` — 知识库型 Skill 的参考图、参考文件、目录和索引规范
