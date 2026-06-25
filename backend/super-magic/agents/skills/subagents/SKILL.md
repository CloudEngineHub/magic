---
name: subagents
description: Use when multiple independent subtasks can run in parallel, when a research or exploration task is large enough to keep separate rather than do inline, when you need a specialized built-in agent type, or when the user asks what Crew agents are available or wants work delegated to an available Crew.
---

# Subagent Dispatch Skill

You can delegate work to other agents instead of doing everything yourself. Use `call_subagent` to dispatch a task, `wait_for_subagents` to collect results from background runs, and `agent_list` to discover available Crew agents.

## Routing Precedence

This skill is preloaded and owns routing for delegation requests. When a request matches any delegation signal below, route it through delegation first — before the generic capability-source (skill/MCP) selection. Do not use `find_skills` or `read_skills` to look for a matching "assistant" or "expert": a named employee, assistant, role, or Crew agent is a delegation target reached via `agent_list` and `call_subagent`, not a skill to acquire.

## Recognize Delegation Opportunities

Do not wait to be told to delegate. Actively watch for these signals while planning your own work, and prefer delegation whenever one of them appears:

- The user refers to an employee, assistant, expert, role, or named Crew agent (e.g. "use your travel assistant", "have the data analyst handle this", "ask the legal expert"). This is a delegation request: call `agent_list` to find the matching Crew agent by keyword, then `call_subagent` with the returned `code`. Never treat the named assistant as a skill to look up.
- The work splits into two or more independent parts that do not depend on each other's intermediate results — dispatch them in parallel instead of doing them one by one.
- A research, exploration, or reading task is large enough that doing it inline would flood your own context — hand it to a sub-agent and keep only the summary.
- The task is a natural fit for a specialized agent: read-only codebase exploration (`explore`), shell-heavy or environment work (`shell`), or web research (`search`).
- The user asks what employees, agents, or Crew agents are available.

Default bias: when a task is large, parallelizable, specialized, or names an employee/assistant, delegating is usually the better choice than doing it inline. Treat delegation as a first-class option in every plan, not a last resort.

Do not delegate when:

- The task is small and you can finish it directly in a step or two.
- The work requires constant access to the current conversation state and cannot be captured in a self-contained prompt.
- Multiple sub-agents would write to the same file with no merge plan.

**Depth limit**: sub-agents cannot call `call_subagent`. Only the root agent may dispatch.

## Choosing the target agent

Built-in types are described above under "Recognize Delegation Opportunities" (`explore`, `shell`, `search`); use `magic` for general multi-step work, or any other `.agent` file (e.g. `data-analyst`) by name. Employee-style agents are Crew agents with codes like `SMA-xxxx`.

Use `agent_list` before dispatching when:

- The user asks what employees, agents, or Crew agents are available
- The user names a role or employee but gives no exact `SMA-*` code
- You need to pick the best available Crew agent for a task

Pass `name_filter` in the user's language (the server searches the localized name and description and returns matches in that language); leave it empty for the full list. Use the returned `code` as `agent_name` in `call_subagent` — for `SMA-*` agents the local Crew runtime is prepared automatically before dispatching.

For generated micro-app or frontend code, prefer runtime selection via `window.Magic.agent.getAgents()`. If code generation must inspect real remote `agentId` values, use the helper script owned by `micro-app-architect` — do not use sub-agent delegation for that lookup.

## Reading wait_for_subagents results

For parallel work, dispatch each agent with `background=true`, then collect them with a single `wait_for_subagents`. Its `result.content` is formatted per agent:

```
[i/total] agent_type/session_id: status
Result:
```final output```
```

- `status`: `done`, `error`, `interrupted`, `running`, `not_found`, `ambiguous`
- `Result:` appears only when `done`; when `running` (timed out) it becomes `Last message:` — the sub-agent's last message before the timeout, useful for gauging progress
- Idempotent: if still `running`, call again or stop waiting. Use `timeout=-1` only when the final answer must wait for every child or until the parent run is interrupted
- `result.data["results"]`: structured list with `agent_id`, `agent_name`, `status`, `result`, `error`, `last_activity`

## Parameters

Full parameters and usage details for `call_subagent`, `wait_for_subagents`, and `agent_list` are in each tool's own definition (including how to write a self-contained prompt and how to set each sub-agent's output target). This skill covers when to delegate and which agent to choose.
