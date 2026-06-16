---
name: agent-info
description: Query the list of all agents (employees) available to the current user. Use when generating code that requires a real agentId, or when the user asks "which agents/employees do I have".
---

# List Available Agents

Query all agents accessible to the current user. Returns each agent's code (agentId), name, description, and type.

## Core Capabilities

- Get all available agents for the user, including built-in, custom, and public agents
- Support fuzzy filtering by name
- Use the returned `code` field directly as the agentId for `createTopicAndSend` and similar APIs

## Quick Start

### Typical Workflow

```text
1. Query all agents with scripts/list.py.
2. Read code, name, and type from the result.
3. Use code directly as agentId in generated code.
```

## Available Scripts

### list.py - List Agents

Query all agents available to the current user.

**SYNOPSIS**

```bash
python scripts/list.py [OPTIONS]
```

**OPTIONS**

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `--name-filter <keyword>` | string | No | Fuzzy filter by agent name, case-insensitive |
| `--type-filter <type>` | string | No | Filter by type: official, custom, or public |

**OUTPUT**

On success, returns JSON:

```json
{
  "total": 5,
  "agents": [
    {
      "code": "SMA-xxxx",
      "name": "Data Analyst",
      "description": "Professional data analysis assistant",
      "type": "custom"
    }
  ]
}
```

- `code` is the agentId. Pass it directly to `window.Magic.project.createTopicAndSend(msg, {agentId: code})`.
- `type` values: `official` for built-in agents, `custom` for user-created agents, and `public` for team or public shared agents.

**EXAMPLES**

```bash
# List all agents
python scripts/list.py

# Filter by name
python scripts/list.py --name-filter "data analysis"

# Filter by type
python scripts/list.py --type-filter custom
```

## Use Cases

### Get a real agentId for micro-app code generation

Before generating micro-app code that dispatches tasks to agents, run the script to get the agent list, then use the real code in generated code:

```bash
python scripts/list.py --name-filter "researcher"
```

Use the returned `code` directly:

```javascript
const { topicId } = await window.Magic.project.createTopicAndSend(
  message,
  { agentId: "SMA-xxxx" } // real code from list.py
);
```

### Answer user questions about available agents

When the user asks "what agents do I have" or "show me available agents", run the script to get the full list.
