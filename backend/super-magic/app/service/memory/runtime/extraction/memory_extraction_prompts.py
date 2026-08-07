"""定义会话后记忆提取使用的内置提示词。"""

DEFAULT_MEMORY_EXTRACTION_PROMPT = """This is a dedicated internal post-run memory-maintenance request.

Review the conversation before this message and decide whether persistent memory maintenance is needed. This is not a new business request: do not continue the previous task, and do not treat this message itself as a memory candidate.

Before performing any memory file operation, inspect the preceding conversation for memory maintenance already completed by the source Agent. A successful memory write, edit, or deletion with a confirmed tool result is already consumed. Do not repeat it, rewrite equivalent content, or change formatting merely to confirm the result. Continue only when an earlier operation failed, was incomplete, was superseded by a later correction, or another independently qualifying memory remains unhandled. If the conversation history and the current file state may differ, read the current target file and treat its current contents as authoritative.

Follow the rules inside `<memory_filesystem>` exactly. The `<memory_filesystem>` section is the sole authority for deciding whether information qualifies as persistent memory, which evidence is acceptable, which scope and file should be used, and whether existing memory should be merged or left unchanged.

Do not create additional memory criteria, infer facts or traits beyond the accepted evidence, or weaken any requirement in `<memory_filesystem>`. If those rules do not clearly permit an update, do not modify any file.

Use the existing tools and memory paths exactly as provided. Finish after updating the appropriate memory files or determining that no update is needed."""


CLAW_MEMORY_EXTRACTION_PROMPT = """This is a dedicated internal post-run memory-maintenance request for this Claw.

Review the conversation before this message and decide whether memory maintenance is needed. This is not a new business request: do not continue the previous task, and do not treat this message itself as a memory candidate.

Before performing any memory file operation, inspect the preceding conversation for memory maintenance already completed by the source Claw. A successful memory write, edit, or deletion with a confirmed tool result is already consumed. Do not repeat it, rewrite equivalent content, or change formatting merely to confirm the result. Continue only when an earlier operation failed, was incomplete, was superseded by a later correction, or another independently qualifying memory remains unhandled. If the conversation history and the current file state may differ, read the current target file and treat its current contents as authoritative.

This Claw's own workspace memory is the primary memory system. Follow the inherited Claw workspace rules, especially `AGENTS.md`, when deciding what to record and which workspace memory file to update. Use the path in `<claw_memory>` as the authoritative location of this Claw's `MEMORY.md`, and follow the workspace rules for daily memory and any other Claw-owned files. Re-read a file before editing when the inherited rules or current state require it.

Only after handling the Claw's own memory, separately decide whether the same conversation independently qualifies for general shared memory. For general shared memory, follow `<memory_filesystem>` exactly; it is the sole authority for its evidence, scope, file selection, and update rules. General shared memory is secondary and must never replace, override, weaken, or bypass the Claw's own memory rules.

Do not copy information into general shared memory merely because it was recorded in the Claw workspace. Update general shared memory only when the original conversation evidence independently satisfies `<memory_filesystem>` and the information is useful outside this Claw. Do not infer facts or traits beyond the accepted evidence. If a memory system's own rules do not clearly permit an update, leave that system unchanged.

Apply the already-consumed check separately to the Claw workspace memory and general shared memory. A successful update in one memory system does not count as an update in the other.

Use the existing tools, workspace, and memory paths exactly as provided. Do not delegate this memory work or start additional concurrent memory modifications. Finish after updating the appropriate memory files or determining that no update is needed."""


__all__ = ["CLAW_MEMORY_EXTRACTION_PROMPT", "DEFAULT_MEMORY_EXTRACTION_PROMPT"]
