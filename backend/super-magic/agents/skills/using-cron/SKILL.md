---
name: using-cron
description: Manage scheduled tasks — create, query, update, and delete. CRITICAL - When user message contains any future time intent (e.g. "in 2 days", "tomorrow at 8am", "every morning"), you MUST load this skill first. NEVER write custom scheduler scripts.

---

# Scheduled Message Task Management

Manage scheduled message tasks through scripts, supporting create, list, get, update, and delete operations.

## Core Capabilities

- Create one-time or recurring scheduled message tasks
- Query and filter existing scheduled task lists
- Get task details
- Update task configuration (name, time, enabled status, etc.)
- Delete tasks

## Quick Start

### Typical Workflow

```
1. Create task (create.py)
   ↓ Get returned schedule_id
2. Query list (list.py) - Optional
   ↓ Confirm task was created
3. Get details (get.py) - Optional
   ↓ View complete task info
4. Update task (update.py) - As needed
5. Delete task (delete.py) - As needed
```

## Available Scripts

---

### create.py - Create Scheduled Task

Create a new scheduled message task.

**SYNOPSIS**

```bash
python scripts/create.py --task-name <name> (--message-content <content> | --message-content-file <path>) --type <type> --time <HH:MM> [OPTIONS]
```

**DESCRIPTION**

Create a scheduled message task, supporting one-time execution and daily/weekly/monthly repeat modes.

**When to pass `--specify-topic 1`**: Pass 1 only when both hold: (1) the task is recurring (daily_repeat / weekly_repeat / monthly_repeat), and (2) the user intent implies that the next run time or trigger depends on the current or previous run's result (e.g. "run again 3 days after each completion", "next time based on last result"). For one-time tasks or fixed-schedule tasks that do not depend on previous results, omit this option or pass 0.

**OPTIONS**

| Option                             | Type    | Required    | Description                                                                                                                                                                                 |
| ---------------------------------- | ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--task-name <name>`               | string  | Yes         | Task name                                                                                                                                                                                   |
| `--message-content <content>`      | string  | Conditional | Message content (same as detail message_content/task_describe). Mutually exclusive with `--message-content-file`                                                                            |
| `--message-content-file <path>`    | string  | Conditional | Read message content from a file. Prefer this for long text or content with Chinese punctuation, quotes, or brackets                                                                        |
| `--type <type>`                    | string  | Yes         | Schedule type, see table below                                                                                                                                                              |
| `--time <HH:MM>`                   | string  | Yes         | Execution time                                                                                                                                                                              |
| `--day <value>`                    | string  | Conditional | Depends on schedule type, see table below                                                                                                                                                   |
| `--deadline <YYYY-MM-DD HH:MM:SS>` | string  | No          | Expiry datetime; format YYYY-MM-DD HH:MM:SS. If only date or unclear format is given, the system will interpret and complete (e.g. to 00:00:00 that day)                                    |
| `--specify-topic <0\|1>`           | integer | No          | Whether to specify topic; 0=no, 1=yes; default 0. Pass 1 only when the user intent is a **recurring** task whose **next run depends on the previous run's result**; otherwise use default 0 |
| `--topic-pattern <mode>`           | string  | No          | Agent mode for the scheduled run. For built-in agents, pass the mode such as `ip-manager`; for custom agents, pass `custom_agent`; defaults to `general` when omitted                       |
| `--agent-code <code>`              | string  | Conditional | Custom agent code. Required when `--topic-pattern custom_agent`                                                                                                                             |

**Schedule type `--type` and `--day` mapping:**

| `--type`         | Description                   | `--day`                                    |
| ---------------- | ----------------------------- | ------------------------------------------ |
| `no_repeat`      | No repeat, one-time execution | Execution date `YYYY-MM-DD` (required)     |
| `daily_repeat`   | Repeat daily                  | Not needed                                 |
| `weekly_repeat`  | Repeat weekly                 | Day of week `0`-`6`, `0`=Sunday (required) |
| `monthly_repeat` | Repeat monthly                | Day of month `1`-`31` (required)           |

**OUTPUT**

On success: `{"id": "<schedule_id>"}`

**EXAMPLES**

```bash
python scripts/create.py \
  --task-name "Daily Briefing" \
  --message-content "Generate today's briefing" \
  --type daily_repeat \
  --time "9:00" \
  --topic-pattern general
```

```bash
python scripts/create.py \
  --task-name "Custom Agent Task" \
  --message-content "Process this task with the custom agent" \
  --type daily_repeat \
  --time "9:00" \
  --topic-pattern custom_agent \
  --agent-code "SMA-custom-agent"
```

For custom agents, keep this parameter contract:

- `--topic-pattern custom_agent` tells the scheduler to run in custom-agent mode.
- `--agent-code <code>` selects the compiled employee agent, such as `SMA-custom-agent`.
- The script reads `model_id` from `.chat_history/<agent-code><main>.session.json` first, then falls back to `.chat_history/custom_agent<main>.session.json` and `.chat_history/magic<main>.session.json`.

---

### list.py - Query Task List

Query the scheduled task list with optional filtering.

**SYNOPSIS**

```bash
python scripts/list.py [OPTIONS]
```

**DESCRIPTION**

Query all scheduled tasks or filter by conditions, with pagination support. Results are **scoped to the current project**; project_id is taken from the current session and must not be passed.

**OPTIONS**

| Option               | Type    | Required | Description                     |
| -------------------- | ------- | -------- | ------------------------------- |
| `--task-name <name>` | string  | No       | Fuzzy search by task name       |
| `--enabled <0\|1>`   | integer | No       | `1`=enabled `0`=disabled        |
| `--completed <0\|1>` | integer | No       | `1`=completed `0`=not completed |
| `--page <n>`         | integer | No       | Page number, default 1          |
| `--page-size <n>`    | integer | No       | Items per page, default 50      |

**OUTPUT**

On success: `{"total": N, "schedules": [{"id": "...", "task_name": "...", "task_describe": "...", "status": "...", "enabled": 0|1, "time_config": {...}, "deadline": ...}]}`. Each item includes: `id`, `task_name`, `task_describe`, `status`, `enabled`, `time_config`, `deadline`.

**EXAMPLES**

```bash
# Query all
python scripts/list.py

# Filter by conditions
python scripts/list.py --task-name "briefing" --enabled 1 --completed 0
```

---

### get.py - Get Task Details

Get the complete details of a specific scheduled task.

**SYNOPSIS**

```bash
python scripts/get.py --id <schedule_id>
```

**DESCRIPTION**

Query complete task information by task ID.

**OPTIONS**

| Option               | Type   | Required | Description |
| -------------------- | ------ | -------- | ----------- |
| `--id <schedule_id>` | string | Yes      | Task ID     |

**OUTPUT**

On success: Returns complete task info including `id`, `task_name`, `task_describe`, `message_content`, `time_config`, `status`, `enabled`, `deadline`.

**EXAMPLES**

```bash
python scripts/get.py --id "<schedule_id>"
```

---

### update.py - Update Task

Update the configuration of a specific scheduled task; only pass fields to be modified.

**SYNOPSIS**

```bash
python scripts/update.py --id <schedule_id> [OPTIONS]
```

**DESCRIPTION**

Update scheduled task configuration. Only pass fields to be modified; unspecified fields remain unchanged. `--type` and `--time` must be provided together.

**OPTIONS**

| Option                             | Type    | Required | Description                                                                         |
| ---------------------------------- | ------- | -------- | ----------------------------------------------------------------------------------- |
| `--id <schedule_id>`               | string  | Yes      | Task ID                                                                             |
| `--task-name <name>`               | string  | No       | New task name                                                                       |
| `--message-content <content>`      | string  | No       | Message content (same as detail message_content/task_describe)                      |
| `--type <type>`                    | string  | No       | Schedule type (must be provided with `--time`)                                      |
| `--time <HH:MM>`                   | string  | No       | Execution time (must be provided with `--type`)                                     |
| `--day <value>`                    | string  | No       | Date/weekday/day-of-month, depends on `--type`                                      |
| `--deadline <YYYY-MM-DD HH:MM:SS>` | string  | No       | Expiry datetime; format YYYY-MM-DD HH:MM:SS, auto-completed if only date or unclear |
| `--enabled <0\|1>`                 | integer | No       | `1`=enable `0`=disable                                                              |

**OUTPUT**

On success: `{"id": "<schedule_id>"}`

**EXAMPLES**

```bash
# Update task name
python scripts/update.py --id "<schedule_id>" --task-name "New Name"

# Update task description
python scripts/update.py --id "<schedule_id>" --message-content "Updated task description content"

# Update schedule time
python scripts/update.py --id "<schedule_id>" --type daily_repeat --time "10:00"

# Update deadline
python scripts/update.py --id "<schedule_id>" --deadline "2026-12-31 23:59:59"

# Disable task
python scripts/update.py --id "<schedule_id>" --enabled 0

# Re-enable task
python scripts/update.py --id "<schedule_id>" --enabled 1
```

---

### delete.py - Delete Task

Delete a specific scheduled task.

**SYNOPSIS**

```bash
python scripts/delete.py --id <schedule_id>
```

**DESCRIPTION**

Permanently delete a scheduled task by task ID.

**OPTIONS**

| Option               | Type   | Required | Description |
| -------------------- | ------ | -------- | ----------- |
| `--id <schedule_id>` | string | Yes      | Task ID     |

**OUTPUT**

On success: `{"id": "<schedule_id>"}`

**EXAMPLES**

```bash
python scripts/delete.py --id "<schedule_id>"
```

---

## Usage Examples

In Agent environment, use `shell_exec` tool to execute scripts:

```python
# Always run these scripts with shell_exec in the project Python environment.
# Do not call them through run_sdk_snippet because they import the app package.

# Create task
shell_exec(
    command='python scripts/create.py --task-name "Daily Briefing" --message-content "Generate today's briefing" --type daily_repeat --time "9:00" --topic-pattern general'
)

# Create a task with a long message or special characters
shell_exec(
    command='''cat > /tmp/cron-message.txt <<'EOF'
Update the AI card. Read magic.project.js, template.html, fetch fresh data,
generate latest.html, archive the previous version, and update metadata.
EOF
cd /app/agents/skills/using-cron &&
python scripts/create.py --task-name "AI Card" --message-content-file /tmp/cron-message.txt --type daily_repeat --time "9:00" --topic-pattern ip-manager'''
)

# Self-media article data auto sync
# Fixed recurring sync does not bind to one article topic: pass --specify-topic 0 so each run creates a new topic.
# Use the built-in ip-manager mode: pass --topic-pattern ip-manager and do not pass agent_code.
# For frontend/direct payload flows, message_content.extra.super_agent.model uses the first available model for ip-manager. If no model is available, omit the field and let the runtime use its default policy.
shell_exec(
    command='''cat > /tmp/self-media-post-sync.txt <<'EOF'
Read ops/source.json in the current article directory, visit the bound publishedUrl, and update only these operations files in the current article directory:
- Latest metrics and history snapshots in ops/metrics.json
- Latest feedback and history snapshots in ops/comments.json
- ops/review.html as a polished previewable HTML operations report with a performance brief, KPI interpretation, trend and efficiency charts, engagement breakdown, comment insights, and next actions. Use inline CSS/SVG or simple chart blocks without external resources. Render next actions as buttons bound with addEventListener; on click, prefer window.Magic.project.sendMessage(message, { model: "auto" }) and fall back to window.Magic.setInputMessage(message) when unavailable.
- fetchStatus, lastFetchedAt, failureReason, and history snapshots in ops/source.json
Do not generate AI Cards and do not write AI Card analysis artifacts.
EOF
cd /app/agents/skills/using-cron &&
python scripts/create.py --task-name "[Article Sync] Example Article" --message-content-file /tmp/self-media-post-sync.txt --type daily_repeat --time "9:00" --specify-topic 0 --topic-pattern ip-manager'''
)

# Query task list
shell_exec(
    command="python scripts/list.py"
)

# Get task details
shell_exec(
    command='python scripts/get.py --id "<schedule_id>"'
)

# Update task
shell_exec(
    command='python scripts/update.py --id "<schedule_id>" --enabled 0'
)

# Delete task
shell_exec(
    command='python scripts/delete.py --id "<schedule_id>"'
)
```
