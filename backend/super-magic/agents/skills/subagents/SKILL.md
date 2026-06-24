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

## Tool: call_subagent

```python
from sdk.tool import tool

result = tool.call("call_subagent", {
    "agent_name": str,   # required
    "agent_id":   str,   # required
    "prompt":     str,   # required
    "model_id":   str,   # optional, defaults to inheriting the caller's model
    "background": bool,  # optional, default False
})
```

### agent_name

Maps to a `.agent` filename under `agents/`. Built-in types:

- `magic`: general-purpose, full tool access (web, files, code). Use for complex multi-step tasks.
- `explore`: read-only. Searches files, reads code, answers structural questions. Cannot modify anything.
- `shell`: shell command specialist. Runs scripts, installs deps, performs system operations.
- `search`: web research specialist. Searches the web and reads pages to gather external information. Cannot modify local files.

Other `.agent` files (e.g. `data-analyst`) can also be used by name.

### Crew agents

The system represents employee-style agents as Crew agents. They usually have codes such as `SMA-xxxx`.

Use `agent_list` before dispatching when:

- The user asks what employees, agents, or Crew agents are available
- The user names a role or employee but does not provide an exact `SMA-*` code
- You need to choose the best available Crew agent for a task

```python
from sdk.tool import tool

result = tool.call("agent_list", {
    "name_filter": None,   # optional: one or more keywords in the user's language; the server fuzzy-matches name and description
    "limit": 30,
})
```

Pass `name_filter` keywords in the same language the user used: the server searches the localized name and description and returns names/descriptions in that language. Use one or more keywords separated by spaces or commas; any keyword can match. Leave `name_filter` empty to get the full list. If keywords match nothing, the full list is returned so you can still choose by name and description.

Use the returned Crew `code` as `agent_name` in `call_subagent`.
For `SMA-*` Crew agents, `call_subagent` prepares the local Crew runtime automatically before dispatching.
For generated micro-app or frontend code, prefer runtime agent selection with `window.Magic.agent.getAgents()`. If code generation must inspect real remote `agentId` values before writing the app, use the helper script owned by `micro-app-architect`; do not use sub-agent delegation for that code-generation lookup.

### agent_id

Human-readable session identity, e.g. `market-research-phase1`.

- Same `agent_id` → resume the existing conversation (same chat history)
- Different `agent_id` → fresh start with empty history
- Name by responsibility, not by sequence: `ppt-outline`, `shell-install-ffmpeg` — not `task1`, `worker-a`

### prompt

The sub-agent has **no access to the parent's conversation history**. The prompt must be fully self-contained. Include:

- The exact task
- Expected output format
- Relevant file paths or object identifiers
- Constraints (e.g. read-only, specific file to write)
- Success criteria

Bad:

```text
Find out what competitors are doing and summarize.
```

Good:

```text
Search the web for the top 3 competitors of [product category] that have launched or updated in the past 12 months.
For each, return: product name, target users, main differentiator, and source URL.
Focus on product launch articles, review sites, and tech media. Do not modify files.
```

### background

- `False` (default): run synchronously, block until the sub-agent finishes, return result immediately.
- `True`: dispatch as a background task and return immediately. Must follow with `wait_for_subagents` to collect the result.

Use `background=True` for all parallel workloads. Sequential `call_subagent(..., background=True)` calls result in concurrent execution regardless of whether the model supports parallel tool calls.

## Tool: wait_for_subagents

```python
from sdk.tool import tool

result = tool.call("wait_for_subagents", {
    "agent_ids": ["id-a", "id-b"],  # required, list of agent_ids from background calls
    "timeout":   30,                # optional, seconds, default 30, recommended 30–60
})
```

Awaits all listed agents together. `result.content` uses this format per agent:

```
[i/total] agent_type/session_id: status
Result:
```final output```
```

- `status` values: `done`, `error`, `interrupted`, `running`, `not_found`, `ambiguous`
- `Result:` appears only when status is `done` — contains the sub-agent's final output
- When status is `running` (timed out), `Result:` is replaced by `Last message:` — this is the last assistant message the sub-agent produced before the timeout, useful for gauging progress
- `wait_for_subagents` is idempotent — if status is still `running`, call it again or decide to stop waiting
- Use `timeout=-1` only when the final answer must wait until every child agent finishes or the parent run is interrupted
- `result.data["results"]`: structured list for programmatic access, fields: `agent_id`, `agent_name`, `status`, `result`, `error`, `last_activity`

## Output Target

Decide where results go before dispatching. If the output target is missing from the prompt, the sub-agent will guess — and will usually create a file or object it shouldn't.

Three patterns:

**Shared container** (canvas, slides): pass the same container identifier (e.g. project path) to every sub-agent; tell each one which section it owns. Do not let sub-agents create or choose their own container.

**Single file** (report, document): assign the full file to one agent, or have parallel agents draft their sections independently then designate one merge agent to write the final file.

**Independent outputs** (one file per topic, one canvas per theme): each agent gets its own target; no coordination needed.

Never let multiple sub-agents write to the same file concurrently.

## Reporting Results to the User

Sub-agents may include output file paths in their results. When reporting to the user, convert those paths to `[@file_path:path]` format — the frontend renders them as clickable links.

Example: Research report is ready: `[@file_path:reports/market-research.md]`

## Sync Example

```python
from sdk.tool import tool

result = tool.call("call_subagent", {
    "agent_name": "explore",
    "agent_id": "find-product-positioning-doc",
    "prompt": """Find the single workspace document that is most useful for answering: "What is this project, who is it for, and what does it provide?"
Check workspace folders that are likely to contain project briefs, product analysis, requirements, launch materials, or internal planning before searching elsewhere.
Return:
1. the file path
2. a 3-5 bullet summary
3. one related file worth reading next
Do not modify files.""",
    "background": False,
})

print(result.content)
```

## Parallel Example

Dispatch first (sequential calls, concurrent execution):

```python
from sdk.tool import tool

def dispatch(agent_id, prompt):
    tool.call("call_subagent", {
        "agent_name": "search",
        "agent_id": agent_id,
        "prompt": prompt,
        "background": True,
    })

dispatch("research-competitors", """Search the web for the top 3-5 competitors in this product space.
For each, return: product name, target users, main differentiator, and source URL.
Focus on product launches, review sites, and tech media from the past 12 months.""")
dispatch("research-market-signals", """Search the web for recent market signals in this product space.
Return:
1. notable user needs or pain points (with source URLs)
2. recurring themes across articles or community discussions
3. any emerging trends worth tracking""")
```

Then wait:

```python
result = tool.call("wait_for_subagents", {
    "agent_ids": ["research-competitors", "research-market-signals"],
    "timeout": 60,
})

print(result.content)
```

## Checklist

Before dispatching:

- Is delegation actually necessary?
- Does the prompt contain all required context (no reference to parent conversation)?
- Is `agent_id` stable, human-readable, and unique to this task branch?
- Is the output target explicit and conflict-free?
- If `background=True`, is there a matching `wait_for_subagents`?
