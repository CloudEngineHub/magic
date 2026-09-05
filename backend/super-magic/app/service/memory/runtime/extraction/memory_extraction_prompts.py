"""定义会话后记忆维护使用的内置提示词。"""

from collections.abc import Mapping
from enum import StrEnum

from agentlang.utils.annotation_remover import remove_developer_annotations


class MemoryExtractionPromptName(StrEnum):
    """内置记忆维护提示词名称。"""

    DEFAULT = "default"
    CLAW = "claw"
    MEMORY_MAINTENANCE = "memory_maintenance"


_MEMORY_MAINTENANCE_PROMPT = """
<!--zh
<memory_maintenance>
系统检查发现以下共享 MEMORY.md 文件偏大，需要进行记忆整理。每个文件后面的当前大小和建议目标仅用于辅助判断；建议目标不是硬性限制，也不是要求机械删减内容。
这不是文件大小处理，也不是简单的压缩或按行拆分，而是一次语义整理和记忆质量重构。分别维护每个列出的文件：
1. 编辑前重新读取当前文件；如果读取结果被截断，分段读取并先理解完整内容，再进行修改。
2. 按主题和语义检查现有内容，将每条内容归类为：应保留在 `MEMORY.md` 的核心事实、应整理到主题笔记的长期详细信息、重复或过时内容、临时过程日志、原始工具输出、敏感信息和无法证实的推断。
3. 重写 `MEMORY.md`，只保留短小、稳定、主体和作用域明确、未来经常需要直接使用的当前事实、约束、偏好和必要索引。不要按原行数机械保留，也不要把时间线、重复检查点、流水账或完整工具结果当作核心记忆。
4. 检查项目 `MEMORY.md` 中的每条记忆是否“换到完全不同的项目后仍然成立”。如果成立，它就是跨项目记忆：从项目 `MEMORY.md` 移出并写入共享的全局 `MEMORY.md`，先读取并去重全局内容，不要在两个作用域保留重复副本。只有确实限定于当前项目的内容才留在项目记忆中。
5. 将仍有长期价值但不适合核心记忆的理由、历史、取舍、流程和示例合并到一个或多个清晰命名的主题笔记中。每个 notes 文件名必须简短、稳定、可读，并能仅凭名称判断正文主题；可以使用简短中文或英文 kebab-case。不要使用 `notes.md`、`details.md`、`history.md`、`checkpoint-history.md`、纯时间戳或随机 ID 等泛化名称。已有笔记名称过于泛化时，整理时将其改为与内容直接相关的名称，并同步更新 `MEMORY.md` 中的索引。不要把所有剩余内容原样搬进一个巨大的 notes 文件；重复记录应先合并，只有对未来有用的内容才保留。
6. 删除不符合记忆写入条件的临时状态、无效或重复内容、原始日志、认证数据和模型猜测；建议目标只是参考，不要为了达到数字而删除仍有长期价值的事实。
7. 仅编辑列出的 `MEMORY.md` 及其同级 `notes/` 文件；如果需要把项目记忆迁移到全局记忆，可同时编辑对应的全局 `MEMORY.md`，但不要重写无关的记忆文件，也不要绕过正常的证据、作用域和去重规则。
8. 整理完成后检查 `MEMORY.md` 是否结构清晰、可独立理解、适合作为自动加载的核心记忆；检查主题笔记是否可检索、没有重复正文和敏感信息，并确认跨项目事实已归入全局作用域。

需要整理的文件：
{memory_files}
</memory_maintenance>
-->
<memory_maintenance>
The following shared MEMORY.md files were detected as large and require memory curation. The current size and suggested target shown after each file are guidance only, not hard limits or instructions to delete content mechanically.
This is not a file-size task, simple compression, or line-based splitting. Maintain each listed file as semantic curation and memory-quality refactoring:
1. Re-read the current file before editing. If the read is truncated, read it in chunks and understand the complete content before changing it.
2. Review the existing content by topic and meaning, classifying each item as core fact to keep in `MEMORY.md`, durable detail for a topic note, duplicate or obsolete content, temporary process log, raw tool output, sensitive information, or unsupported inference.
3. Rewrite `MEMORY.md` to keep only short, stable, attributable, correctly scoped facts, constraints, preferences, and necessary pointers that will be frequently useful directly. Do not preserve lines mechanically, and do not treat timelines, repeated checkpoints, activity logs, or complete tool results as core memory.
4. For each item in a project `MEMORY.md`, ask whether it would still be true after moving to a completely different project. If yes, it is cross-project memory: remove it from the project `MEMORY.md` and write it to the shared global `MEMORY.md`, reading and deduplicating the global file first. Do not keep duplicate copies in both scopes. Keep an item in project memory only when it is genuinely limited to the current project.
5. Consolidate durable rationale, history, trade-offs, procedures, and examples that do not belong in core memory into one or more clearly named topic notes. Every notes filename must be short, stable, readable, and specific enough to identify the topic from the name alone; use concise Chinese or English kebab-case. Do not use generic names such as `notes.md`, `details.md`, `history.md`, `checkpoint-history.md`, timestamps, or random IDs. If an existing note has an overly generic name, rename it to match its content and update any `MEMORY.md` pointer. Do not copy all remaining content verbatim into one giant notes file; merge repeated records and keep only detail that will help future work.
6. Remove temporary state, invalid or duplicate content, raw logs, authentication data, and model guesses that fail the memory quality gate. Treat the suggested target as a reference, and do not delete facts that still have durable value merely to reach that number.
7. Edit only the listed `MEMORY.md` and its sibling `notes/` files; when project memory must be migrated to global memory, you may also edit the corresponding global `MEMORY.md`, but do not rewrite unrelated memory files or bypass the normal evidence, scope, and deduplication rules.
8. After reorganizing, verify that `MEMORY.md` is clear, self-contained enough to use as automatically loaded core memory, and that topic notes are searchable, non-duplicative, and free of sensitive information; confirm that cross-project facts are stored in the global scope.

Files requiring maintenance:
{memory_files}
</memory_maintenance>
"""

_DEFAULT_MEMORY_EXTRACTION_PROMPT = """
<!--zh
这是专用的会话后记忆维护请求。

查看此消息之前的对话，并判断是否需要维护持久记忆。这不是新的业务请求：不要继续之前的任务，也不要把这条消息本身当作记忆候选。

来源 Agent 可能已经完成了记忆操作。编辑前检查之前对话中成功的记忆工具调用及其已确认的结果。如果当前文件内容与捕获的历史不同，以当前文件内容为准。

遵循 `<memory_filesystem>` 中关于存储和检索的说明，然后应用下面完整的会话后规则。不要要求普通 Agent 从这条消息继续业务工作。

应用以下记忆维护规则：

先判断本次对话是否产生了值得长期保留的信息；如果没有，不要修改任何记忆文件。判断示例：
- 通常值得记录：用户明确表达、未来可能反复适用的偏好；本次对话确认的项目级长期决策、约定或接口约束；根据当前权威代码或配置核实出的长期项目知识；用户纠正并确认应替换旧记忆的事实。
- 通常不值得记录：只对本次任务有效的临时步骤、一次性错误和已解决状态；原始工具输出、日志、完整对话或短期计划；没有用户确认或权威来源支持的推断。
- 这些只是判断示例，不要因为命中关键词就自动写入；仍需满足证据、主体、作用域、稳定性和安全要求。

1. 只使用用户明确陈述的事实、对话中确认的决定，或根据当前权威来源核实过的项目知识。不要把猜测、模型推断、临时工具输出或未经核实的声明写入记忆。
2. 使用明确主体规范化每一条存储的事实。如果主体或作用域不明确，则不要写入。
3. 将跨项目事实写入 `global/`；将项目特有事实写入来源项目的 `projects/p_<project_id>/`。如果项目 `MEMORY.md` 中已有一条换到完全不同项目后仍成立的记忆，将它迁移到全局 `MEMORY.md`，先读取并去重全局内容，不要在多个作用域重复保存同一事实。
4. 保持 `MEMORY.md` 短小、稳定、原子化且经常有用。将关联的理由、历史、取舍、流程、示例和其他持久详细内容写入匹配的 `notes/` 目录下的主题笔记；主题笔记文件名必须简短、稳定、可读，并能直接体现正文主题，不要使用 `notes.md`、`details.md`、`history.md`、纯时间戳或随机 ID 等泛化名称。不要仅因为内容不适合放入 `MEMORY.md` 就丢弃符合条件的详细内容。
5. 永远不要保存密码、Token、密钥、认证数据、敏感个人信息、临时任务状态、待处理操作或模型猜测。
6. 写入前，如果现有上下文缺失、被截断、发生变化或不足以支持精确编辑，则检查当前目标文件和相关笔记。优先合并并去重已有主题，不要追加相互冲突的副本。
7. 如果来源 Agent 已经成功完成记忆写入、编辑或删除，并且结果已确认，则视为已经处理。不要重复执行或重写格式；只有失败、未完成、被后续修正覆盖或独立符合条件的更新才继续处理。
8. 只有用户明确要求忘记，或确认信息已失效时才删除。必要时更新相关 `MEMORY.md` 指针，但不要修改无关内容。
9. 如果文件在编辑期间发生变化，或编辑报告冲突，则重新读取并基于最新内容合并。记忆维护是尽力而为的，不得阻断源任务。

完成所有符合条件的更新、必要的大小整理，或确认无需变更后结束。
-->
This is a dedicated internal post-run memory-maintenance request.

Review the conversation before this message and decide whether persistent memory maintenance is needed. This is not a new business request: do not continue the previous task, and do not treat this message itself as a memory candidate.

The source Agent may already have completed memory operations. Inspect the preceding conversation for successful memory tool calls and confirmed results before editing. The current file contents are authoritative when they differ from the captured history.

Follow the `<memory_filesystem>` storage and retrieval description, then apply the complete post-run rules below. The normal Agent should not be asked to continue business work from this message.

Apply the following memory-maintenance rules:

First decide whether this conversation produced information worth retaining long term; if not, do not modify any memory file. Examples:
- Usually worth recording: a preference explicitly stated by the user and likely to apply again; a project-level long-term decision, convention, or interface constraint confirmed in this conversation; durable project knowledge verified against current authoritative code or configuration; a fact the user corrected and confirmed should replace an older memory.
- Usually not worth recording: temporary steps, one-off errors, or resolved status that matter only to this task; raw tool output, logs, the full conversation, or short-lived plans; inferences without user confirmation or authoritative evidence.
- These are judgment examples, not automatic triggers. Still apply the evidence, subject, scope, durability, and safety requirements before writing.

1. Use only facts explicitly stated by the user, decisions confirmed in the conversation, or project knowledge verified against a current authoritative source. Do not turn guesses, model inferences, temporary tool output, or unverified claims into memory.
2. Normalize every stored fact with an explicit subject. If the subject or scope is unclear, do not write it.
3. Put cross-project facts in `global/`; put project-specific facts in the source project's `projects/p_<project_id>/`. If a project `MEMORY.md` already contains a memory that would remain true in a completely different project, migrate it to the global `MEMORY.md`, reading and deduplicating the global content first. Do not duplicate the same fact across scopes.
4. Keep `MEMORY.md` short, stable, atomic, and frequently useful. Put connected rationale, history, trade-offs, procedures, examples, and other durable detail into a topic-oriented file under the matching `notes/` directory; the topic filename must be short, stable, readable, and directly describe the note content. Do not use generic names such as `notes.md`, `details.md`, `history.md`, timestamps, or random IDs. Do not discard qualifying detail merely because it does not belong in `MEMORY.md`.
5. Never store passwords, tokens, keys, authentication data, sensitive personal information, temporary task state, pending operations, or model guesses.
6. Before writing, inspect the current target file and relevant notes when the existing context is missing, truncated, changed, or insufficient for a precise edit. Merge and deduplicate existing topics instead of appending conflicting copies.
7. Treat a successful source-Agent memory write, edit, or deletion with a confirmed result as already handled. Do not repeat it or rewrite formatting. Continue only for failed, incomplete, superseded, or independently qualifying updates.
8. Delete only when the user explicitly asks to forget or confirms that information is invalid. Update related `MEMORY.md` pointers when necessary, without changing unrelated content.
9. If a file changes during editing or an edit reports a conflict, re-read it and merge against the latest contents. Memory maintenance is best effort and must not block the source task.

Finish after applying only qualifying updates, required size maintenance, or determining that no change is needed.
"""

_CLAW_MEMORY_EXTRACTION_PROMPT = """
<!--zh
这是当前 Claw 的专用会话后记忆维护请求。

查看此消息之前的对话，并判断是否需要维护记忆。这不是新的业务请求：不要继续之前的任务，也不要把这条消息本身当作记忆候选。

首先按照继承的 `AGENTS.md`、工作区规则和 `<claw_memory>` 路径维护当前 Claw 自己的 workspace memory。如果 workspace memory 的写入、编辑或删除已成功完成并确认结果，则该记忆系统视为已经处理。

然后使用 `<memory_filesystem>` 和下面的规则，独立判断共享全局记忆和项目记忆。workspace memory 的更新不代表共享记忆也已更新；共享记忆不得替代、削弱或绕过 Claw 工作区规则。

应用以下记忆维护规则：

先判断本次对话是否产生了值得长期保留的信息；如果没有，不要修改任何记忆文件。判断示例：
- 通常值得记录：用户明确表达、未来可能反复适用的偏好；本次对话确认的项目级长期决策、约定或接口约束；根据当前权威代码或配置核实出的长期项目知识；用户纠正并确认应替换旧记忆的事实。
- 通常不值得记录：只对本次任务有效的临时步骤、一次性错误和已解决状态；原始工具输出、日志、完整对话或短期计划；没有用户确认或权威来源支持的推断。
- 这些只是判断示例，不要因为命中关键词就自动写入；仍需满足证据、主体、作用域、稳定性和安全要求。

1. 只使用用户明确陈述的事实、对话中确认的决定，或根据当前权威来源核实过的项目知识。不要把猜测、模型推断、临时工具输出或未经核实的声明写入记忆。
2. 使用明确主体规范化每一条存储的事实。如果主体或作用域不明确，则不要写入。
3. 将跨项目事实写入 `global/`；将项目特有事实写入来源项目的 `projects/p_<project_id>/`。如果项目 `MEMORY.md` 中已有一条换到完全不同项目后仍成立的记忆，将它迁移到全局 `MEMORY.md`，先读取并去重全局内容，不要在多个作用域重复保存同一事实。
4. 保持 `MEMORY.md` 短小、稳定、原子化且经常有用。将关联的理由、历史、取舍、流程、示例和其他持久详细内容写入匹配的 `notes/` 目录下的主题笔记；主题笔记文件名必须简短、稳定、可读，并能直接体现正文主题，不要使用 `notes.md`、`details.md`、`history.md`、纯时间戳或随机 ID 等泛化名称。不要仅因为内容不适合放入 `MEMORY.md` 就丢弃符合条件的详细内容。
5. 永远不要保存密码、Token、密钥、认证数据、敏感个人信息、临时任务状态、待处理操作或模型猜测。
6. 写入前，如果现有上下文缺失、被截断、发生变化或不足以支持精确编辑，则检查当前目标文件和相关笔记。优先合并并去重已有主题，不要追加相互冲突的副本。
7. 如果来源 Agent 已经成功完成记忆写入、编辑或删除，并且结果已确认，则视为已经处理。不要重复执行或重写格式；只有失败、未完成、被后续修正覆盖或独立符合条件的更新才继续处理。
8. 只有用户明确要求忘记，或确认信息已失效时才删除。必要时更新相关 `MEMORY.md` 指针，但不要修改无关内容。
9. 如果文件在编辑期间发生变化，或编辑报告冲突，则重新读取并基于最新内容合并。记忆维护是尽力而为的，不得阻断源任务。

完成所有符合条件的更新、必要的大小整理，或确认无需变更后结束。
-->
This is a dedicated internal post-run memory-maintenance request for this Claw.

Review the conversation before this message and decide whether memory maintenance is needed. This is not a new business request: do not continue the previous task, and do not treat this message itself as a memory candidate.

First maintain this Claw's own workspace memory according to the inherited `AGENTS.md`, workspace rules, and `<claw_memory>` path. A successful workspace-memory write, edit, or deletion with a confirmed result is already handled for that memory system.

Then independently evaluate shared global and project memory using `<memory_filesystem>` and the rules below. A workspace-memory update does not count as a shared-memory update, and shared memory must not replace, weaken, or bypass the Claw workspace rules.

Apply the following memory-maintenance rules:

First decide whether this conversation produced information worth retaining long term; if not, do not modify any memory file. Examples:
- Usually worth recording: a preference explicitly stated by the user and likely to apply again; a project-level long-term decision, convention, or interface constraint confirmed in this conversation; durable project knowledge verified against current authoritative code or configuration; a fact the user corrected and confirmed should replace an older memory.
- Usually not worth recording: temporary steps, one-off errors, or resolved status that matter only to this task; raw tool output, logs, the full conversation, or short-lived plans; inferences without user confirmation or authoritative evidence.
- These are judgment examples, not automatic triggers. Still apply the evidence, subject, scope, durability, and safety requirements before writing.

1. Use only facts explicitly stated by the user, decisions confirmed in the conversation, or project knowledge verified against a current authoritative source. Do not turn guesses, model inferences, temporary tool output, or unverified claims into memory.
2. Normalize every stored fact with an explicit subject. If the subject or scope is unclear, do not write it.
3. Put cross-project facts in `global/`; put project-specific facts in the source project's `projects/p_<project_id>/`. If a project `MEMORY.md` already contains a memory that would remain true in a completely different project, migrate it to the global `MEMORY.md`, reading and deduplicating the global content first. Do not duplicate the same fact across scopes.
4. Keep `MEMORY.md` short, stable, atomic, and frequently useful. Put connected rationale, history, trade-offs, procedures, examples, and other durable detail into a topic-oriented file under the matching `notes/` directory; the topic filename must be short, stable, readable, and directly describe the note content. Do not use generic names such as `notes.md`, `details.md`, `history.md`, timestamps, or random IDs. Do not discard qualifying detail merely because it does not belong in `MEMORY.md`.
5. Never store passwords, tokens, keys, authentication data, sensitive personal information, temporary task state, pending operations, or model guesses.
6. Before writing, inspect the current target file and relevant notes when the existing context is missing, truncated, changed, or insufficient for a precise edit. Merge and deduplicate existing topics instead of appending conflicting copies.
7. Treat a successful source-Agent memory write, edit, or deletion with a confirmed result as already handled. Do not repeat it or rewrite formatting. Continue only for failed, incomplete, superseded, or independently qualifying updates.
8. Delete only when the user explicitly asks to forget or confirms that information is invalid. Update related `MEMORY.md` pointers when necessary, without changing unrelated content.
9. If a file changes during editing or an edit reports a conflict, re-read it and merge against the latest contents. Memory maintenance is best effort and must not block the source task.

Finish after applying only qualifying updates, required size maintenance, or determining that no change is needed.
"""

_PROMPT_TEMPLATES = {
    MemoryExtractionPromptName.DEFAULT: _DEFAULT_MEMORY_EXTRACTION_PROMPT,
    MemoryExtractionPromptName.CLAW: _CLAW_MEMORY_EXTRACTION_PROMPT,
    MemoryExtractionPromptName.MEMORY_MAINTENANCE: _MEMORY_MAINTENANCE_PROMPT,
}


def get_memory_extraction_prompt(
    prompt_name: MemoryExtractionPromptName | str,
    placeholders: Mapping[str, object] | None = None,
    **kwargs: object,
) -> str:
    """按名称获取内置提示词，并使用传入的占位符完成渲染。"""
    try:
        normalized_name = MemoryExtractionPromptName(prompt_name)
    except ValueError as error:
        raise ValueError(f"未知的记忆维护提示词: {prompt_name}") from error

    prompt_template = _PROMPT_TEMPLATES[normalized_name]
    values = dict(placeholders or {})
    values.update(kwargs)
    try:
        rendered_prompt = prompt_template.format(**values)
    except KeyError as error:
        raise ValueError(f"记忆维护提示词缺少占位符: {error.args[0]}") from error
    return remove_developer_annotations(rendered_prompt).strip()


__all__ = ["MemoryExtractionPromptName", "get_memory_extraction_prompt"]
