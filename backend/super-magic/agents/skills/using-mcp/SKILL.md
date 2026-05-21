---
name: using-mcp
description: Query MCP servers, list available MCP tools, get tool schemas, and call MCP tools programmatically. CRITICAL - When user message contains [@mcp:...] mention, you MUST load this skill first to properly use MCP tools.

---

# MCP Tools Calling Skill

Query MCP server information, tool lists, and schemas through scripts, and call MCP tools via SDK.

## Core Capabilities

- Query MCP server list and status
- List all available MCP tools
- Get JSON Schema definitions of tools
- Call MCP tools and get results
- Dynamically add new MCP servers (effective at runtime, optionally persisted)

## Important Rules

### 1. DO NOT imagine tool names and parameters

Before calling `mcp.call()`, you **MUST** first query and confirm through scripts:
1. Whether the tool exists on that server (via `get_tools.py`) - **REQUIRED**
2. The tool's parameter definition (via `get_tool_schema.py`) - **REQUIRED**
3. Server list (via `get_servers.py`) - Optional, usually provided in user prompts

**STRICTLY FORBIDDEN** to call MCP tools based on imagination or experience without querying first. Even if you think a tool "should" exist, you must query to confirm it first.

### 2. mcp.call() is NOT a tool name

**STRICTLY FORBIDDEN** to call the following as tool names:
- `from sdk.mcp import mcp`
- `mcp.call`
- `mcp.call()`

`mcp.call()` is a Python SDK method that must be executed within Python code using the `run_sdk_snippet` tool.

**Wrong Example**:
```python
# Wrong! Do NOT do this
tool_call(name="from sdk.mcp import mcp", arguments={})
tool_call(name="mcp.call", arguments={...})
```

**Correct Example**:
```python
# Correct! Use run_sdk_snippet tool
run_sdk_snippet(
    python_code="""
from sdk.mcp import mcp
result = mcp.call(...)
"""
)
```

## Key Principles

### Script Execution

Scripts use standard command-line arguments, for example:
- `python scripts/get_servers.py`
- `python scripts/get_tools.py --server-name <server-name>`

In Agent environment, use `shell_exec` tool to execute scripts:

```python
# Get server list
shell_exec(
    command="python scripts/get_servers.py"
)

# Get tool list for a specific server
shell_exec(
    command="python scripts/get_tools.py --server-name <server-name>"
)

# Get tool schema
shell_exec(
    command="python scripts/get_tool_schema.py --server-name <server-name> --tool-name <tool-name>"
)
```

### MCP Tool Calling

**Important Note**: `mcp.call()` is NOT a standalone tool, but an SDK method called within Python code.

In Agent environment, use `run_sdk_snippet` tool to execute Python code containing `mcp.call()` (**MUST** first query and confirm server and tool existence via scripts):

```python
# Use run_sdk_snippet tool to execute the following Python code
run_sdk_snippet(
    python_code="""
from sdk.mcp import mcp

result = mcp.call(
    server_name="<server-name>",  # Must be a real server name from get_servers.py
    tool_name="<tool-name>",      # Must be a real tool name from get_tools.py
    tool_params={"param": "value"}  # Must conform to schema from get_tool_schema.py
)

if result.ok:
    print(result.content)
else:
    print(f"Call failed: {result.content}")
"""
)
```

## Quick Start

### Step 0: Query Server List (Optional)

If unsure which MCP servers are available, run the script to query:

```bash
python scripts/get_servers.py
```

### Step 1: Query Tool List (Required)

**MUST** query the available tool list for the specified server:

```bash
python scripts/get_tools.py --server-name <server-name>
```

### Step 2: Get Tool Schema (Required)

**MUST** get the tool's parameter definition:

```bash
python scripts/get_tool_schema.py --server-name <server-name> --tool-name <tool-name>
```

### Step 3: Call MCP Tool (Required)

After confirming tool and parameters, use `run_sdk_snippet` tool to execute code containing `mcp.call()`:

```python
# Use run_sdk_snippet tool
run_sdk_snippet(
    python_code="""
from sdk.mcp import mcp

result = mcp.call(
    server_name="<server-name>",  # From user prompt or Step 0
    tool_name="<tool-name>",      # From Step 1 query results
    tool_params={"param": "value"}  # Constructed per Step 2 schema
)

if result.ok:
    print(result.content)
else:
    print(f"Call failed: {result.content}")
"""
)
```

## Workflow

**MUST follow** this workflow:

```
[If you need to add a new server first]
A. Add MCP server (add_server.py) - Optional
   ↓ Server is immediately available after success; output includes tool list,
     so you can skip steps 0 and 1

[To call tools on an existing server]
0. [Optional] Get server list (get_servers.py)
   ↓ Query if unsure which servers are available
1. View tool list (get_tools.py) - REQUIRED
   ↓ Confirm tool exists on that server
2. Get tool schema (get_tool_schema.py) - REQUIRED
   ↓ Understand required parameters and types
3. Validate parameters - REQUIRED
   ↓ Ensure all required parameters are provided with correct types
4. Call tool (mcp.call) - REQUIRED
```

**WARNING**: Skipping tool list and schema query steps and calling tools directly will fail due to non-existent tools or incorrect parameters.

## Available Scripts

### add_server.py - Add MCP Server Dynamically

Dynamically add a new MCP server to the running system, effective immediately. Only valid for the current runtime session.

**SYNOPSIS**
```bash
python scripts/add_server.py --name <name> --type stdio|http [OPTIONS]
```

**DESCRIPTION**

Supports both stdio (command-line process) and http (URL) MCP server types.
An existing server with the same name will be disconnected and replaced.
Added servers only exist for the current runtime session and do not survive restarts.

**OPTIONS**

| Option | Type | Required | Description |
|------|------|------|------|
| `--name <name>` | string | Yes | Server name |
| `--type <type>` | string | Yes | Connection type: `stdio` or `http` |
| `--command <cmd>` | string | stdio only | Launch command (e.g. `npx`, `uvx`) |
| `--args <json>` | string | No | Command arguments as a **JSON array string**, e.g. `'["-y","@pkg"]'`; do NOT pass raw space-separated args like `-y @pkg` |
| `--url <url>` | string | http only | Server URL |
| `--env KEY=VALUE [...]` | string | No | Environment variables, supports multiple |
| `--label <name>` | string | No | Server display name |

**OUTPUT**

Returns a JSON object containing:

| Field | Type | Description |
|------|------|------|
| `ok` | boolean | Whether succeeded |
| `name` | string | Server name |
| `tool_count` | number | Number of registered tools |
| `tools` | array | Tool name list |
| `error` | string | Error message on failure |

**EXAMPLES**

Add a stdio server (npx-based MCP).
CRITICAL: `--args` MUST be a JSON array string. Use single quotes around the whole value.
[correct] `--args '["-y","@modelcontextprotocol/server-sequential-thinking"]'`
[wrong]   `--args -y @modelcontextprotocol/server-sequential-thinking`
[wrong]   `--args "-y @modelcontextprotocol/server-sequential-thinking"`
```bash
python scripts/add_server.py \
    --name my-fs-server \
    --type stdio \
    --command npx \
    --args '["-y","@modelcontextprotocol/server-filesystem","/tmp"]' \
    --label "Filesystem"
```

Add an http server:
```bash
python scripts/add_server.py \
    --name my-api-server \
    --type http \
    --url http://localhost:3000/mcp \
    --label "Custom API"
```

Add with environment variables:
```bash
python scripts/add_server.py \
    --name my-server \
    --type stdio \
    --command npx \
    --args '["-y","some-mcp-server"]' \
    --env API_KEY=your_key BASE_URL=https://example.com
```

---

### get_servers.py - Get MCP Server List

Get the list and status of all MCP servers.

**SYNOPSIS**
```bash
python scripts/get_servers.py
```

**DESCRIPTION**

Query all registered MCP servers and return server name, status, tool count, and other information.

**OPTIONS**

No parameters.

**OUTPUT**

Returns a JSON array, each element contains:

| Field | Type | Description |
|------|------|------|
| `name` | string | Server internal name |
| `label_name` | string | Server display name |
| `status` | string | Status: `success`, `failed`, `timeout` |
| `tool_count` | number | Tool count |
| `tools` | array | Tool name list |

**EXAMPLES**

Run the script:
```bash
python scripts/get_servers.py
```

Returns a JSON array, each element contains fields like `label_name`, `tool_count`, etc.

---

### get_tools.py - Get MCP Tool List

Get MCP tool list with optional server filtering.

**SYNOPSIS**
```bash
python scripts/get_tools.py [OPTIONS]
```

**DESCRIPTION**

Query all available MCP tools or tools from a specific server. Returns tool name, description, and other basic information.

**OPTIONS**

| Option | Type | Required | Description |
|------|------|------|------|
| `--server-name <name>` | string | No | Server name, returns all tools if omitted |

**OUTPUT**

Returns a JSON array, each element contains:

| Field | Type | Description |
|------|------|------|
| `name` | string | Tool name |
| `server_name` | string | Server name |
| `description` | string | Tool function description |

**EXAMPLES**

Get all tools:
```bash
python scripts/get_tools.py
```

Get tools from a specific server:
```bash
python scripts/get_tools.py --server-name amap
```

Returns a JSON array, each element contains fields like `name`, `server_name`, `description`, etc.

---

### get_tool_schema.py - Get Tool Schema

Get the JSON Schema definition of specific tool(s), supports batch retrieval.

**SYNOPSIS**
```bash
python scripts/get_tool_schema.py --server-name <server> --tool-name <tool1> [tool2] [tool3] ...
```

**DESCRIPTION**

Query the JSON Schema definition of specific MCP tool(s), including parameter descriptions, type definitions, and required fields. Supports retrieving multiple tools at once.

**OPTIONS**

| Option | Type | Required | Description |
|------|------|------|------|
| `--server-name <name>` | string | Yes | Server name |
| `--tool-name <name> [name2...]` | string | Yes | Tool name(s), supports multiple |

**OUTPUT**

Returns a JSON array, each element contains:

| Field | Type | Description |
|------|------|------|
| `tool_name` | string | Tool name |
| `server_name` | string | Server name |
| `schema` | object | Schema object (with `type`, `properties`, `required`) |
| `error` | string | Error message (only appears when tool not found) |

**EXAMPLES**

Get schema for a single tool:
```bash
python scripts/get_tool_schema.py --server-name amap --tool-name maps_text_search
```

Get schemas for multiple tools:
```bash
python scripts/get_tool_schema.py --server-name amap --tool-name maps_text_search maps_weather maps_geo
```

Returns a JSON array regardless of single or multiple tools, each element containing `tool_name`, `server_name`, and `schema` fields.

## mcp.call Method

**Important**: `mcp.call()` is an SDK method, NOT a standalone tool. It must be called within Python code executed by the `run_sdk_snippet` tool.

Call MCP tools via `mcp.call()` and get execution results.

### Parameters

| Parameter | Required | Type | Description |
|------|------|------|------|
| `server_name` | Yes | string | MCP server name |
| `tool_name` | Yes | string | Tool name |
| `tool_params` | Yes | dict | Tool parameter dict, passed according to tool Schema definition |

### Return Value

Returns a `Result` object containing the following fields:

| Field | Type | Description |
|------|------|------|
| `ok` | boolean | Whether execution succeeded |
| `content` | string | Result content on success, error message on failure |
| `execution_time` | float | Execution time (seconds) |
| `tool_call_id` | string | Tool call ID |
| `name` | string | Full tool name |

### Usage Examples

**Basic Call:**

```python
# Note: Server and tool names MUST be real values confirmed via scripts, never guessed!
# Use run_sdk_snippet tool to execute the following code
run_sdk_snippet(
    python_code="""
from sdk.mcp import mcp

# Call MCP tool
result = mcp.call(
    server_name="<server-name>",  # Must be from get_servers.py query results
    tool_name="<tool-name>",      # Must be from get_tools.py query results
    tool_params={"param_name": "param_value"}  # Must conform to get_tool_schema.py schema
)

# Check result
if result.ok:
    print(f"Call succeeded: {result.content}")
    print(f"Execution time: {result.execution_time}s")
else:
    print(f"Call failed: {result.content}")
"""
)
```

**Complete Workflow:**

```python
# Step 0: [Optional] Get server list (via shell_exec)
# If unsure which servers exist, run:
shell_exec(
    command="python scripts/get_servers.py"
)
# Pick a server with status "success" from the output

# Step 1: [Required] Get tool list (via shell_exec)
shell_exec(
    command="python scripts/get_tools.py --server-name <server-name>"
)
# Pick the desired tool from the output

# Step 2: [Required] Get tool schema (via shell_exec)
shell_exec(
    command="python scripts/get_tool_schema.py --server-name <server-name> --tool-name <tool-name>"
)
# Review required parameters and types

# Step 3: [Required] Call tool (via run_sdk_snippet)
run_sdk_snippet(
    python_code="""
from sdk.mcp import mcp

# Construct params per schema
tool_params = {
    "param1": "value1",
    "param2": "value2"
}

# Call the tool
result = mcp.call(
    server_name="<server-name>",  # From user prompt or Step 0
    tool_name="<tool-name>",      # From Step 1 query results
    tool_params=tool_params    # Constructed per Step 2 schema
)

# Handle result
if result.ok:
    print(f"Call succeeded: {result.content}")
else:
    print(f"Call failed: {result.content}")
"""
)
```

## Notes

1. **Server Confirmation**: If unsure whether server is available, run `get_servers.py` to check server status first
2. **Tool Confirmation**: **MUST** run `get_tools.py` to confirm tool exists on that server before calling
3. **Schema Validation**: **MUST** run `get_tool_schema.py` to get Schema and validate required parameters before calling tools
4. **Parameter Format**: Ensure `tool_params` conforms to the tool's JSON Schema definition
5. **No Imagination**: **STRICTLY FORBIDDEN** to imagine or guess tool names or parameter names; must follow query results
