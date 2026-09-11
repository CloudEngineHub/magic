---
name: use-magicbase
description: Use when a user explicitly mentions a micro-app and asks to read or change its MagicBase data.
---

# Use MagicBase

Only operate on a micro-app explicitly @'d in the user message. The server extracts the canonical `app_id` from the structured Tiptap Mention node and resolves it to the permitted project. The generated mention context may contain a typed link such as `[name](micro_app://app_id)` for model readability; it is not a client-supplied authority field. Do not treat display names or other user-visible fields as authority. Never accept user IDs, roles, tokens, project IDs, or permissions from tool arguments.

Use the Engine's Code Mode tools through `run_sdk_snippet`, importing `tool` from `sdk.tool`. For example, table discovery uses `tool.call("query_magicbase_tables", {})`; browser method names such as `getTables` are not Engine tool names. Discover tables first and use real table IDs. Do not write SQL, modify schema, or change permissions with this skill.

Before calling tools, read [references/db-api.md](references/db-api.md) for exact tool names, parameters, query examples, and the separate preview → ask_user → confirmed write workflow. It also documents the current confirmation and multi-app selection limitations.

Reads may execute directly. Before any create, update, or delete, present a precise change preview and wait for explicit user confirmation by calling the existing `ask_user` tool. Include the micro-app name, table, record, changed fields, and affected row count. Recheck authorization immediately before executing a confirmed write. Treat permission, validation, conflict, and timeout responses as authoritative and explain them without bypass attempts.

If more than one micro-app is mentioned, pass the canonical `app_id` from the structured Mention on each MagicBase call, or call `query_magicbase_tables_all_mentioned_apps` once for discovery across all referenced apps. If exactly one micro-app is mentioned, `app_id` is optional; passing that same `app_id` is also valid. Query each app separately for comparisons. If the business target is still unclear, ask the user before writing. If confirmation is cancelled, expires, or has no valid answer, do not execute the write.
