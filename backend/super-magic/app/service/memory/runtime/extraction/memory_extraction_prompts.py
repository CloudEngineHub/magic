"""定义会话后记忆维护使用的内置提示词。"""

from collections.abc import Mapping
from enum import StrEnum

from agentlang.utils.annotation_remover import remove_developer_annotations


class MemoryExtractionPromptName(StrEnum):
    """内置记忆维护提示词名称。"""

    DEFAULT = "default"
    CLAW = "claw"
    MEMORY_FILE_SIZE_MAINTENANCE = "memory_file_size_maintenance"


_MEMORY_FILE_SIZE_MAINTENANCE_PROMPT = """
<!--zh
<memory_file_size_maintenance>
以下共享 MEMORY.md 文件已达到其配置的大小上限。
在新增任何条目之前，分别维护每个列出的文件：
- 仅编辑列出的 MEMORY.md，以及在必要时编辑其同级 notes/ 文件。
- 在 MEMORY.md 中保留短小、稳定、高频的事实。
- 将理由、历史、取舍、流程和示例等持久详细内容移入主题笔记；如果内容没有长期价值，则移除它。
- 不要将笔记正文复制回 MEMORY.md，不要重写无关的记忆文件，也不要绕过正常的证据、作用域和去重规则。
- 编辑前重新读取当前文件，并让整理后的 MEMORY.md 小于其配置的大小上限。

需要整理的文件：
{memory_files}
</memory_file_size_maintenance>
-->
<memory_file_size_maintenance>
The following shared MEMORY.md files have reached their configured size limit.
Before adding any new entry, maintain each listed file independently:
- Edit only the listed MEMORY.md and, when needed, its sibling notes/ files.
- Keep short, stable, high-frequency facts in MEMORY.md.
- Move durable detail such as rationale, history, trade-offs, procedures, and examples into topic notes, or remove it when it has no lasting value.
- Do not copy a note body back into MEMORY.md, rewrite unrelated memory files, or bypass the normal evidence, scope, and deduplication rules.
- Re-read the current file before editing and leave the cleaned MEMORY.md below its configured limit.

Files requiring maintenance:
{memory_files}
</memory_file_size_maintenance>
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
3. 将跨项目事实写入 `global/`；将项目特有事实写入来源项目的 `projects/p_<project_id>/`。不要在多个作用域重复保存同一事实。
4. 保持 `MEMORY.md` 短小、稳定、原子化且经常有用。将关联的理由、历史、取舍、流程、示例和其他持久详细内容写入匹配的 `notes/` 目录下的主题笔记。不要仅因为内容不适合放入 `MEMORY.md` 就丢弃符合条件的详细内容。
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
3. Put cross-project facts in `global/`; put project-specific facts in the source project's `projects/p_<project_id>/`. Do not duplicate the same fact across scopes.
4. Keep `MEMORY.md` short, stable, atomic, and frequently useful. Put connected rationale, history, trade-offs, procedures, examples, and other durable detail into a topic-oriented file under the matching `notes/` directory. Do not discard qualifying detail merely because it does not belong in `MEMORY.md`.
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
3. 将跨项目事实写入 `global/`；将项目特有事实写入来源项目的 `projects/p_<project_id>/`。不要在多个作用域重复保存同一事实。
4. 保持 `MEMORY.md` 短小、稳定、原子化且经常有用。将关联的理由、历史、取舍、流程、示例和其他持久详细内容写入匹配的 `notes/` 目录下的主题笔记。不要仅因为内容不适合放入 `MEMORY.md` 就丢弃符合条件的详细内容。
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
3. Put cross-project facts in `global/`; put project-specific facts in the source project's `projects/p_<project_id>/`. Do not duplicate the same fact across scopes.
4. Keep `MEMORY.md` short, stable, atomic, and frequently useful. Put connected rationale, history, trade-offs, procedures, examples, and other durable detail into a topic-oriented file under the matching `notes/` directory. Do not discard qualifying detail merely because it does not belong in `MEMORY.md`.
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
    MemoryExtractionPromptName.MEMORY_FILE_SIZE_MAINTENANCE: _MEMORY_FILE_SIZE_MAINTENANCE_PROMPT,
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
