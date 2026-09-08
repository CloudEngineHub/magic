---
name: crew-creator
description: |
  Manage and optimize custom agent definition files (IDENTITY.md, AGENTS.md, SOUL.md, TOOLS.md).
  Also handles first-time employee initialization when .workspace/ has no IDENTITY.md.
  Use when users want to edit agent identity, modify workflow instructions, adjust personality,
  add/remove tools, optimize prompts, or initialize a new employee from scratch.
  Trigger signals: 'modify prompt', 'change identity', 'add tool', 'remove tool', 'optimize workflow',
  'adjust personality', 'initialize employee', '修改提示词', '改身份', '加工具', '去掉工具',
  '优化能力', '调性格', '初始化员工', '创建员工'.
  Do NOT use for: skill creation (use skill-creator), skill searching (use find_skills tool).
---

# Agent Prompt Manager

Manages the 4 core employee definition files under `.workspace/`, helping users view, edit, and optimize their employee's identity, instructions, personality, and tool configuration.
Also handles first-time employee initialization when the workspace has no definition files.

## Language Generation Strategy

Determine the output language in this order:

1. If the user explicitly specifies an output language in the current request, use that language.
2. Otherwise, run the language helper script before generating or editing employee files:

```python
shell_exec(
    command="python '<skill_dir>/scripts/language.py'"
)
```

将 `<skill_dir>` 替换为当前技能的绝对目录。不要省略技能目录前缀，因为 Shell 的当前目录可能是 `.workspace` 或其他目录。

The script reads `.credentials/metadata.json` and returns JSON such as `{"language": "zh_CN", "language_name": "Chinese"}`. It defaults to `zh_CN` when the metadata file is missing, invalid, or has no usable `language` value. `USER_AUTH_METADATA_PATH` can override the metadata path for testing or operational use.

When the user has not specified a language, use the returned `language_name` as the primary language when writing prompts and employee files. The system-injected `<user_preferred_language>` is not the source of truth for this decision.

**Default single-language mode**: Generate all content in the selected language. YAML header uses single-language fields only.

Always generate single-language output. Do not ask for, generate, or maintain translations or language-specific duplicate sections.

## Employee Initialization Flow

When `.magic/IDENTITY.md` does not exist, the workspace has no employee yet and you should guide the user through initialization.

### Detection

Use `list_dir` to check `.magic/`. If `IDENTITY.md` is missing, enter the initialization flow.

### Information Gathering (ask the user conversationally)

Collect information in rounds; you may combine questions but don't overwhelm the user.

When collecting information with `ask_user`, prioritize clickable choices instead of rendering every question as a free-text field:

- Combine questions from the same round into one `ask_user` call when practical.
- Use `confirm` for yes/no decisions, especially the Round 4 skill-decomposition decision.
- Use `select` whenever 2-8 useful candidate answers can be offered, and `multi_select` when multiple answers may apply. The UI adds an "Other" free-text choice, so options do not need to be exhaustive.
- Use `input` only for the employee name or a custom value the user must enter precisely. A request for a "one-line description", "detailed description", or "additional details" is not by itself a reason to use `input`.
- Use `select` for employee role. Use `multi_select` for core functions and traits, professional capabilities, specialties, working style, and communication style. Use `select` or `multi_select` for workflow types.
- Dynamically derive 3-6 concrete options for those choice questions from the name, selected role, and requirements already provided. After selection, synthesize the choices into the one-line description and full role definition; do not ask the user to rewrite the same information as free text.
- Give each option a short explanation that makes the tradeoff clear; do not provide bare abstract labels.

**Before gathering, determine the language using the priority above**. Communicate and collect information in the selected language.

**Round 1 (required)**:
1. **Employee name**: Ask with `input` in the selected language (e.g., for English users: "What name would you like to give your employee?")
2. **Employee role**: Derive 3-6 role candidates from the employee name and ask with `select`.
3. **Core functions and traits**: Derive 3-6 candidates from the employee name and selected role and ask with `multi_select`. Synthesize the selected choices into the one-line description; do not ask for that description again with `input`.

Do not ask for translations or offer multilingual output.

**Round 2 (recommended but optional)**:
4. **Professional capabilities**: Generate 3-6 concrete candidates and use `multi_select`.
5. **Professional domains and specialties**: Generate 3-6 concrete candidates and use `multi_select`.
6. **Working style**: Generate 3-6 concrete candidates and use `multi_select`. Synthesize this round into the full role definition for IDENTITY.md; do not ask the user to manually write the same details afterward.
7. **Personality and communication style**: Generate 3-6 candidates and use `multi_select` (goes into SOUL.md).

**Round 3 (required)**:
8. **Workflow / rules**: First offer selectable workflow types and common rules. Collect extra text only when the user chooses "Other" or an exact custom rule is genuinely required (goes into AGENTS.md).

Workflows must be split into clear, independently executable processes. Each process should be designed to call one independent skill; do not pile multiple complex workflows into AGENTS.md.

**Round 4 (required decision)**:
9. **Skill decomposition decision**: After collecting the workflow, use `confirm` to ask whether the independent processes should be created as separate skills. Do not infer consent from silence, and do not finish initialization before receiving a clear yes/no answer.
10. If the user chooses yes, summarize the proposed skill boundaries and specify which workflow in `AGENTS.md` will call each skill, or which invocation rules each skill will follow. Then load `skill-creator` and follow its plan, confirmation, conflict-check, creation, and validation workflow once for each independent process.
11. If the user chooses no, record that decision in the initialization summary and keep the workflow in `AGENTS.md`. If the user is unsure, explain the tradeoff and ask again; do not silently choose.

Round 2 may be skipped. If the user has not provided workflow / rules for Round 3, initialization cannot be completed and the conversation must continue until they provide them. Round 4 is a required decision gate even when the user ultimately chooses no.

### Generating Files

After collecting info, write a JSON config and call the init script:

**Single-language mode (default)**:

Use the selected language for all generated values. Do not add `_en`/`_cn` translation fields.

```python
# Write collected info as JSON config using only the selected language.
write_file(
    path=".crew_init_config.json",
    content='{"name": "Research Assistant", "role": "Academic Researcher", "description": "A professional research assistant", "role_body": "You are an academic researcher...", "instructions": "...", "personality": "..."}'
)

# 2. Call the init script only after the skill-decomposition decision is recorded.
shell_exec(
    command="python '<skill_dir>/scripts/init_crew.py' --config .crew_init_config.json"
)
```

The init script first checks the current directory, then the project's `.workspace` directory and project root for a relative config path. The command does not require copying the config into the skill directory.

The script generates files based on the config (TOOLS.md and SKILLS.md are intentionally not created by the initialization script — the system uses defaults):
- `IDENTITY.md` — always generated (YAML header + role definition body)
- `AGENTS.md` — generated if workflow instructions were provided
- `SOUL.md` — generated if personality was provided

If the user chooses skill decomposition in Round 4, after initialization call `skill-creator` once for each independent workflow. Follow `skill-creator`'s plan, confirmation, creation, and validation process; do not write `SKILL.md` manually.

### After Initialization

1. Before writing, read the `AGENTS.md` section of `references/crew-file-format.md`, then validate the drafted workflow against its specification: overview, ordered SOP steps, inputs, outputs, tool/skill calls, failure branches, and completion checks must be present. Add security constraints or other special rules only when the user explicitly requests them.
2. If validation fails, revise the workflow content and validate it again; do not initialize with a plain unstructured checklist or add special rules that the user did not specify.
3. Show the generated files to the user via `read_files`.
4. If the user chose skill decomposition, confirm that every skill has an invocation workflow or rule declared in `AGENTS.md`, then call `skill-creator` for each independent skill and validate the results before reporting completion.
5. Ask if the user wants any adjustments.
6. Clean up the temp config: `delete_files(path=".crew_init_config.json")`.
7. Inform the user: TOOLS.md and SKILLS.md were not generated by the initialization script (system defaults apply); custom skills are created under `.magic/skills/` and can be adjusted later through employee management.

## File Responsibility Mapping

| File | Dimension | Responsibility | Required |
|------|-----------|----------------|----------|
| `IDENTITY.md` | WHO — Identity | Name, role, description + role definition body | **Required** |
| `AGENTS.md` | WHAT — Instructions | Workflow, rules, special directives | Recommended |
| `SOUL.md` | HOW — Personality | Core personality, communication style, behavior guidelines | Optional |
| `TOOLS.md` | WITH WHAT — Tools | Tool whitelist (YAML) + usage preferences | Optional |

## Editing Workflow

### General Flow (applies to all files)

1. **Read current content**: Use `read_files` to read the target file's existing content
2. **Load quality guide**: Read reference file `references/prompt-engineering-guide.md`
3. **Load format spec**: Read reference file `references/crew-file-format.md`
4. **Write/modify content**: Edit following the format spec and quality guide
5. **Show quality assessment**: Present the modified content with a quality assessment summary
6. **Write after confirmation**: After user confirms, use `write_file` or `edit_file` to save

### Quality Assessment Summary Format

After each edit, present:

```
## Quality Assessment

| Check Item | Status | Notes |
|------------|--------|-------|
| Role clarity | pass | ... |
| Instruction specificity | pass | ... |
| Language consistency | pass | All generated content uses the selected language. |
| Format compliance | pass | ... |
| ... | ... | ... |
```

## File-Specific Editing Guides

### IDENTITY.md — Identity Definition

Contains YAML header (metadata) and body (role definition).

**YAML header fields**: `name`, `role`, and `description` in the selected language. Do not add language-suffixed variants.

**Body**: Write directly in the selected language.

**Key points**:
- Role definition must be specific; avoid vague descriptions like "you are an AI assistant"
- Define expertise domains, target users, and usage scenarios

### SOUL.md — Personality and Behavior

Pure Markdown, no YAML header. Defines the employee's personality and behavior guidelines.

**Key points**: Core traits (3-5 keywords + behavioral descriptions), aesthetic preferences including presentation, expression, and creative style, actionable communication style, and behavior boundaries.

### TOOLS.md — Tool Management

Contains YAML header (tool whitelist) and optional body (tool usage preferences).

**Key points**:
- Tools can only be selected from the project's available tool list — use `scripts/tools.py` to query dynamically
- Recommend tool combinations based on employee function
- Special tool usage preferences go in the body section

## Tool Management Workflow

When users want to add or remove tools:

1. **Query available tools**: Use the script to dynamically scan (see "Tool Query Script" section)
2. Read current TOOLS.md tool list
3. Evaluate tool needs based on employee function
4. Present tool change comparison to user
5. Write to TOOLS.md after user confirmation

## Tool Query Script

Use `scripts/tools.py` to dynamically scan all registered tools in the project (data source: `config/tool_definitions.json`).

### List all available tools

```python
shell_exec(
    command="python scripts/tools.py list"
)
```

### View details of a specific tool (parameters, description)

```python
shell_exec(
    command="python scripts/tools.py detail web_search"
)
```

### Search tools by keyword

```python
shell_exec(
    command="python scripts/tools.py search image"
)
```

## Reference Documents

Reference documents with detailed guides:

- **crew-file-format** — Complete format specs and examples for each definition file
- **prompt-engineering-guide** — Prompt engineering best practices (structure templates, quality checklists, anti-pattern detection)
- **available-tools** — Tool combination recommendations by function (fallback reference; prefer `scripts/tools.py` for dynamic queries)
